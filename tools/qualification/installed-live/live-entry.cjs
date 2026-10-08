/** Electron main for one installed-live mode. "live" uses the genuine Freedom
 * host with its dedicated bundled Arti endpoint, a fixed Sepolia RPC and the
 * existing profile's safeStorage credential. "synthetic" runs the identical
 * modes against the reviewed journey chain and a disposable synthetic profile.
 * The genuine installed initializeRailgunOwner and all owners run unchanged.
 * Failure records keep codes and source frames only, never messages or values.
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { createRequire } = require('module');
const { file, sha } = require('../installed-journey/inventory.cjs');
const { MODES } = require('./live-scenario.cjs');
const CHAIN_ID = 11155111;
const FIXTURE_PASSWORD = 'public-fixture-password-not-a-user-credential';
function write(name, value) {
  fs.writeFileSync(name, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
function pinned(reference) {
  if (!reference) return null;
  const bytes = fs.readFileSync(reference.report);
  assert.equal(sha(bytes), reference.reportSha256);
  return JSON.parse(bytes).scenario;
}
async function main() {
  assert.equal(process.type, 'browser');
  assert.equal(process.env.FREEDOM_RAILGUN_INSTALLED_LIVE, '1');
  const [filename, expectedSha] = process.argv.slice(2);
  const bytes = fs.readFileSync(filename);
  assert.equal(sha(bytes), expectedSha);
  const request = JSON.parse(bytes);
  assert.equal(request.schema, 'railgun-installed-live-request-v1');
  assert.ok(Object.hasOwn(MODES, request.mode));
  assert.ok(['live', 'synthetic'].includes(request.transport));
  for (const [name, expected] of Object.entries(request.recipeFiles)) assert.deepEqual(file(name), expected);
  const live = request.transport === 'live';
  const hostRequire = createRequire(path.join(request.hostRoot, 'package.json'));
  const fixed = (name) => hostRequire('./src/main/' + name);
  const { app, safeStorage } = hostRequire('electron');
  const milestones = [];
  const milestone = (value) => milestones.push(String(value).slice(0, 2000));
  const overrides = [];
  const replace = (object, key, value) => {
    overrides.push([object, key, object[key]]);
    object[key] = value;
  };
  let report = null,
    client = null,
    chain = null,
    worker = null,
    manager = null,
    lock = null,
    locks = null,
    released = false;
  const clients = new Set();
  const endpointLife = new AbortController(),
    application = new AbortController();
  try {
    const previous = pinned(request.previous);
    // The original held report, pinned by the launcher to the campaign binding.
    const heldBytes = fs.readFileSync(request.heldReport.file);
    assert.equal(sha(heldBytes), request.heldReport.sha256);
    assert.equal(request.heldReport.sha256, request.ledgerHeader.binding.heldTransferReportSha256);
    const lineage = Object.fromEntries(
      Object.entries(request.lineage ?? {}).map(([name, reference]) => [name, pinned(reference)])
    );
    fs.mkdirSync(request.outputDirectory, { mode: 0o700 });
    const profile = fixed('profile-resolver.js').initializeProfile(app, {
      env: { FREEDOM_TEST_USER_DATA: request.profileDirectory },
    });
    locks = fixed('profile-lock.js');
    lock = locks.acquireProfileLock(profile, { onCompromised: () => app.exit(1) });
    app.dock?.hide();
    await app.whenReady();
    const registry = fixed('networks/network-registry.js'),
      tor = fixed('tor-manager.js');
    let readFinalized, readReceipt, expectedRpc;
    if (live) {
      assert.equal(app.isPackaged, false);
      assert.equal(process.env.FREEDOM_WALLET_TOR_EXPERIMENT, '1');
      const marker = JSON.parse(fs.readFileSync(path.join(request.profileDirectory, 'railgun-test-profile.json')));
      assert.deepEqual(marker, { version: 1, chainId: CHAIN_ID, profileId: profile.id, disposable: true });
      assert.equal(safeStorage.isEncryptionAvailable(), true);
      client = await hostRequire('./scripts/qualify-ppv2-live.js').openLiveTransport(
        path.join(request.outputDirectory, 'transport'),
        (message) => milestone('tor:' + message),
        request.live.rpcSource
      );
      replace(tor, 'getWalletSocksEndpoint', () => client.endpoint);
      // The campaign's one frozen endpoint.
      assert.equal(client.metadata.rpc, request.live.rpcUrl);
      expectedRpc = new URL(client.metadata.rpc).href;
      assert.equal(
        registry.addCustomChain(
          {
            chainId: CHAIN_ID,
            name: 'Sepolia installed Railgun journey',
            nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
          },
          [client.metadata.rpc]
        ).success,
        true
      );
      registry.updateNetwork(CHAIN_ID, {
        access: { readOrder: ['direct'], allowDirect: true },
        quorum: { timeoutMs: 45000 },
      });
      readFinalized = async () => {
        const block = await client.rpc('eth_getBlockByNumber', ['finalized', false]);
        assert.ok(block && /^0x[0-9a-f]+$/.test(block.number) && /^0x[0-9a-f]{64}$/.test(block.hash));
        return Object.freeze({ number: Number(BigInt(block.number)), hash: block.hash.toLowerCase() });
      };
      // Public receipts of the campaign's own public transaction hashes only.
      readReceipt = async (hash) => {
        assert.match(hash, /^0x[0-9a-f]{64}$/);
        const value = await client.rpc('eth_getTransactionReceipt', [hash]);
        assert.ok(value && value.transactionHash?.toLowerCase() === hash);
        return { status: value.status, gasUsed: BigInt(value.gasUsed).toString(), effectiveGasPrice: BigInt(value.effectiveGasPrice).toString(), blockNumber: Number(BigInt(value.blockNumber)) };
      };
    } else {
      const family = path.join(__dirname, '../installed-journey');
      const { createJourneyChain, ENDPOINT: PRIMARY, LIMITED_ENDPOINT } = require(path.join(family, 'journey-chain.cjs'));
      const ENDPOINT = request.synthetic.endpoint === 'limited' ? LIMITED_ENDPOINT : PRIMARY;
      const { createJourneyCrypto } = require(path.join(family, 'journey-crypto.cjs'));
      const stateBytes = request.synthetic.chainState ? fs.readFileSync(request.synthetic.chainState.file) : null;
      if (stateBytes) assert.equal(sha(stateBytes), request.synthetic.chainState.sha256);
      worker = createJourneyCrypto({ engineModules: request.synthetic.engineModules });
      chain = createJourneyChain({
        ethers: hostRequire('ethers'),
        transactAbi: hostRequire('@freedom/railgun-kohaku-adapter/host/data').TRANSACT_ABI,
        sourceBytes: fs.readFileSync(request.synthetic.publicSource),
        state: stateBytes ? JSON.parse(stateBytes) : undefined,
        crypto: worker,
        autoMine: { afterMs: 0 },
        sendMode: request.synthetic.sendMode ?? 'acknowledge',
      });
      await chain.init();
      expectedRpc = new URL(ENDPOINT).href;
      const { getPrivacyContext } = fixed('networks/privacy-context.js');
      const transport = fixed('networks/wallet-tor-transport.js'),
        settings = fixed('settings-store.js');
      const endpoint = Object.freeze({ signal: endpointLife.signal });
      replace(registry, 'getNetwork', () => ({ access: { readOrder: ['direct'] }, quorum: { timeoutMs: 30000 } }));
      replace(registry, 'getEndpoints', () => [ENDPOINT]);
      replace(registry, 'getEndpointSources', () => [{ keyed: false, coverage: { 11155111: ENDPOINT } }]);
      replace(tor, 'getWalletSocksEndpoint', () => endpoint);
      replace(settings, 'isWalletTorExperimentAvailable', () => true);
      replace(transport, 'createWalletTorTransport', () => {
        let closed = false,
          resolve;
        const barrier = new Promise((yes) => {
          resolve = yes;
        });
        const value = Object.freeze({
          closed: barrier,
          release() {},
          close() {
            if (!closed) {
              closed = true;
              resolve();
            }
          },
          async request(handle, url, options) {
            assert.equal(closed, false);
            const { subject } = getPrivacyContext(handle);
            const wire = JSON.parse(options.body);
            let result;
            try {
              result = await chain.request(subject, url, wire);
            } catch (error) {
              // A modeled provider error answers as JSON-RPC, as a gateway would.
              if (error?.code !== 'SYNTHETIC_RPC_ERROR') throw error;
              return {
                status: 200,
                body: Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: wire.id, error: error.rpcError })),
              };
            }
            return {
              status: 200,
              body: Buffer.from(
                JSON.stringify(Object.hasOwn(wire, 'jsonrpc') ? { jsonrpc: '2.0', id: wire.id, result } : result)
              ),
            };
          },
        });
        clients.add(value);
        return value;
      });
      readFinalized = async () => {
        const n = chain.state().finalized;
        return Object.freeze({ number: n, hash: '0x' + BigInt(n + 1000).toString(16).padStart(64, '0') });
      };
      readReceipt = async (hash) => {
        const tx = chain.state().transactions.find((row) => row.hash === hash);
        assert.ok(tx && tx.blockNumber !== null);
        return { status: tx.status, gasUsed: '1248446', effectiveGasPrice: tx.gasPrice, blockNumber: tx.blockNumber };
      };
    }
    manager = fixed('identity-manager.js');
    if (live) {
      let password = safeStorage.decryptString(
        fs.readFileSync(path.join(request.profileDirectory, 'qualification-password.bin'))
      );
      await manager.unlockVault(password);
      password = undefined;
    } else await manager.unlockVault(FIXTURE_PASSWORD);
    const owner = (await fixed('wallet/signers.js').getSigner(0).getAddress()).toLowerCase();
    if (live) assert.equal(owner, request.live.enrolledOwner);
    const facade = fixed('wallet/railgun-owner-host.js').initializeRailgunOwner(request.runtime);
    const scenario = await MODES[request.mode]({
      facade,
      signal: application.signal,
      milestone,
      owner,
      previous,
      lineage,
      rebuildReport: lineage.rebuild ?? null,
      readFinalized,
      readReceipt,
      expectedRpc,
      heldReport: JSON.parse(heldBytes),
      heldReportSha256: sha(heldBytes),
      synthetic: !live,
      // Synthetic crash: the network keeps what it received, then the process
      // dies at once. Electron's process.exit would let JavaScript run on.
      crash: live
        ? null
        : () => {
            write(path.join(request.outputDirectory, 'chain-state.json'), chain.state());
            process.kill(process.pid, 'SIGKILL');
          },
      params: request.params ?? {},
      profile: request.profileDirectory,
      header: request.ledgerHeader,
    });
    report = {
      schema: 'railgun-installed-live-native-v1',
      mode: request.mode,
      transport: request.transport,
      scenario,
      tor: client?.metadata ?? null,
      routing: live
        ? {
            composition: 'qualification',
            torEndpoint: 'dedicated bundled Arti via scripts/qualify-ppv2-live.js openLiveTransport',
            registry: { chainId: CHAIN_ID, rpc: client.metadata.rpc, readOrder: ['direct'], allowDirect: true, quorumTimeoutMs: 45000 },
            circuitIsolationQualified: false,
          }
        : null,
      milestones: live ? null : milestones,
    };
    write(path.join(request.outputDirectory, 'report.json'), report);
    if (chain) write(path.join(request.outputDirectory, 'chain-state.json'), chain.state());
    // The launcher records the report digest only after exit and postchecks.
  } catch (error) {
    report = null;
    try {
      write(path.join(request.evidenceDirectory, 'failure.json'), {
        code: typeof error?.code === 'string' ? error.code : null,
        name: typeof error?.name === 'string' ? error.name : null,
        ...(live ? {} : { message: String(error?.message ?? '').slice(0, 240) }),
        frames: String(error?.stack ?? '')
          .split('\n')
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 14),
        ...(live ? {} : { milestones: milestones.map((value) => value.slice(0, 200)) }),
        syntheticChain: chain?.report() ?? null,
      });
    } catch {
      /* Diagnostics cannot replace the original failure. */
    }
    // The synthetic network keeps what it received even when the run fails.
    const statePath = path.join(request.outputDirectory, 'chain-state.json');
    if (chain && fs.existsSync(request.outputDirectory) && !fs.existsSync(statePath)) write(statePath, chain.state());
  } finally {
    application.abort();
    try {
      if (manager) await manager.lockVault();
    } catch {
      report = null;
    }
    for (const value of clients) value.close();
    await Promise.all([...clients].map((value) => value.closed));
    endpointLife.abort();
    for (const [object, key, original] of overrides.reverse()) object[key] = original;
    try {
      if (client) await client.close();
      if (worker) await worker.close();
    } catch {
      report = null;
    }
    // The original process keeps the profile lock on any failure until exit.
    if (report && lock) {
      locks.releaseProfileLock(lock);
      released = true;
    }
  }
  app.exit(report && released ? 0 : 1);
}
main().catch(() => {
  process.stderr.write('Installed live entry refused\n');
  process.exitCode = 1;
});
