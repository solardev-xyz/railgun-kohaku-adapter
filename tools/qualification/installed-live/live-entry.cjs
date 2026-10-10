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
// A verified predecessor report. Its digest and mode travel as non-enumerable
// properties, so a report chained from an earlier fixed link can be matched to
// its exact recorded bytes; they never enter a new report.
function pinned(reference) {
  if (!reference) return null;
  const bytes = fs.readFileSync(reference.report);
  assert.equal(sha(bytes), reference.reportSha256);
  const outer = JSON.parse(bytes);
  return Object.defineProperties(outer.scenario, {
    reportSha256: { value: reference.reportSha256 },
    reportMode: { value: outer.mode },
    // The producing run's own frozen request telemetry, when it recorded one.
    telemetry: { value: outer.telemetry ?? null },
  });
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
  // Sanitized wallet-transport telemetry for diagnosing a refused live scan:
  // method, HTTP status, closed error code, elapsed time and size only, never
  // a URL, parameter or body. Local evidence; written only on failure.
  const transportTrace = { requests: 0, failures: 0, byOutcome: {}, recent: [] };
  const traceRequest = (entry) => {
    transportTrace.requests++;
    if (entry.code || entry.status !== 200 || entry.rpcError || entry.shapeInvalid) transportTrace.failures++;
    const key =
      entry.method +
      ':' +
      (entry.code ?? entry.status) +
      (entry.rpcError ? ':rpc-error' + (entry.rpcErrorCode ?? '') : '') +
      (entry.resultNull ? ':null' : '') +
      (entry.shapeInvalid ? ':shape' : '');
    transportTrace.byOutcome[key] = (transportTrace.byOutcome[key] || 0) + 1;
    transportTrace.recent.push(entry);
    if (transportTrace.recent.length > 64) transportTrace.recent.shift();
  };
  // Vault lifecycle evidence: lifetime, whether overridden, and when the
  // session aborted relative to unlock. No key or account data.
  const lifecycle = { lifetimeMs: null, overridden: null, sessionAbortedAfterMs: null };
  // Sanitized request telemetry on every outcome, in the report and in a
  // failure record alike: an allowlisted method, closed status/error/result
  // categories, the request's start sequence, timing, size, cancellation
  // provenance and the scenario's interval marks. Never a URL, parameter,
  // body, identifier or raw error. A request trace cannot expose a local
  // assertion; it only orders the service requests around one.
  const TELEMETRY_METHODS = new Set([
    'eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getLogs', 'eth_call',
    'eth_estimateGas', 'eth_getTransactionCount', 'eth_getBalance', 'eth_getCode', 'eth_gasPrice',
    'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_sendRawTransaction', 'eth_getTransactionByHash',
    'eth_getTransactionReceipt', 'ppoi_validated_txid', 'ppoi_validate_txid_merkleroot',
    'ppoi_validate_poi_merkleroots', 'ppoi_merkle_proofs', 'ppoi_pois_per_list', 'ppoi_submit_transact_proof',
    'ppoi_poi_events', 'ppoi_node_status',
  ]);
  const TELEMETRY_CODES = new Set([
    'TOR_REQUEST_FAILED', 'TOR_REQUEST_TIMEOUT', 'PRIVACY_REQUEST_ABORTED', 'SYNTHETIC_INJECTED_FAULT',
    'SYNTHETIC_DELIVERY_UNOBSERVED',
  ]);
  const TELEMETRY_RPC = { [-32602]: 'invalid-params', [-32603]: 'internal', [-32000]: 'server', [-32601]: 'method' };
  const TELEMETRY_MARKS = new Set([
    'open-private:start', 'open-private:end', 'prepare:start', 'prepare:end', 'prepare:refused',
    'broadcast:start', 'broadcast:end', 'broadcast:refused', 'history:start', 'history:end', 'history:failed',
    'custody-history:start', 'custody-history:end',
  ]);
  const TELEMETRY_MAX = 2048;
  const origin = Date.now();
  const telemetry = { started: 0, completed: 0, inflight: 0, truncated: false, entries: [], marks: [] };
  const failureLike = (entry) => entry.code !== null || entry.status !== 200 || entry.rpcError !== null || entry.shapeInvalid;
  const beginRequest = (method) => {
    telemetry.started++;
    telemetry.inflight++;
    return { seq: telemetry.started, method: TELEMETRY_METHODS.has(method) ? method : 'other', startAt: Date.now() - origin };
  };
  const endRequest = (begun, outcome) => {
    telemetry.inflight--;
    telemetry.completed++;
    const code = outcome.code == null ? null : TELEMETRY_CODES.has(outcome.code) ? outcome.code : 'OTHER_ERROR';
    const entry = {
      seq: begun.seq,
      method: begun.method,
      startAt: begun.startAt,
      ms: Date.now() - origin - begun.startAt,
      status: Number.isSafeInteger(outcome.status) ? outcome.status : null,
      code,
      rpcError: outcome.rpcError ? TELEMETRY_RPC[outcome.rpcErrorCode] ?? 'other' : null,
      resultNull: outcome.resultNull === true,
      shapeInvalid: outcome.shapeInvalid === true,
      bytes: Number.isSafeInteger(outcome.bytes) ? outcome.bytes : null,
    };
    // Abort provenance, temporal attribution only: the latest other failure
    // completed before this one. It does not establish causation.
    if (code === 'PRIVACY_REQUEST_ABORTED') {
      const prior = [...telemetry.entries].reverse().find((row) => failureLike(row) && row.code !== 'PRIVACY_REQUEST_ABORTED');
      entry.afterFailureSeq = prior ? prior.seq : null;
    }
    if (telemetry.entries.length < TELEMETRY_MAX) telemetry.entries.push(entry);
    else telemetry.truncated = true;
  };
  const mark = (label) => {
    assert.ok(TELEMETRY_MARKS.has(label), 'Telemetry mark');
    if (telemetry.marks.length < 256) telemetry.marks.push({ label, seq: telemetry.started, at: Date.now() - origin });
    else telemetry.truncated = true;
  };
  const telemetrySnapshot = (transport) =>
    JSON.parse(
      JSON.stringify({
        version: 1,
        transport,
        complete: !telemetry.truncated && telemetry.inflight === 0,
        inflight: telemetry.inflight,
        started: telemetry.started,
        completed: telemetry.completed,
        entries: telemetry.entries,
        marks: telemetry.marks,
        lifecycle,
      })
    );
  let vaultLifetime = null,
    sessionUnlockedAt = null;
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
      // A pass-through of the genuine transport: same request, close, closed
      // and release; only the observation above is added.
      const walletTransport = fixed('networks/wallet-tor-transport.js');
      const genuine = walletTransport.createWalletTorTransport;
      replace(walletTransport, 'createWalletTorTransport', (...args) => {
        const value = genuine(...args);
        return Object.freeze({
          close: value.close,
          closed: value.closed,
          release: value.release,
          async request(handle, url, options) {
            let method = 'other';
            try {
              const body = JSON.parse(options?.body ?? 'null');
              if (typeof body?.method === 'string' && /^[a-z_]{1,40}$/i.test(body.method)) method = body.method;
            } catch {
              /* Not JSON-RPC: counted as other. */
            }
            const started = Date.now();
            const begun = beginRequest(method);
            try {
              const response = await value.request(handle, url, options);
              // Bounded outcome classification of an answer: never its payload.
              const outcome = {};
              if (method !== 'other' && Buffer.isBuffer(response?.body)) {
                try {
                  const body = JSON.parse(response.body.toString('utf8'));
                  if (body && Object.hasOwn(body, 'error')) {
                    outcome.rpcError = true;
                    if (Number.isSafeInteger(body.error?.code)) outcome.rpcErrorCode = body.error.code;
                  } else if (!body || !Object.hasOwn(body, 'result')) outcome.shapeInvalid = true;
                  else if (body.result === null) outcome.resultNull = true;
                } catch {
                  outcome.shapeInvalid = true;
                }
              }
              traceRequest({ method, status: response?.status ?? null, ...outcome, ms: Date.now() - started, bytes: response?.body?.length ?? null });
              endRequest(begun, { status: response?.status ?? null, ...outcome, bytes: response?.body?.length ?? null });
              return response;
            } catch (error) {
              const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : 'REQUEST_FAILED';
              traceRequest({ method, status: null, code, ms: Date.now() - started });
              endRequest(begun, { status: null, code });
              throw error;
            }
          },
        });
      });
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
        // Strict quantities: a missing or malformed field refuses, never a default.
        for (const key of ['status', 'gasUsed', 'effectiveGasPrice', 'blockNumber']) assert.match(value[key], /^0x[0-9a-f]{1,64}$/);
        assert.match(value.blockHash, /^0x[0-9a-f]{64}$/);
        return {
          status: value.status,
          gasUsed: BigInt(value.gasUsed).toString(),
          effectiveGasPrice: BigInt(value.effectiveGasPrice).toString(),
          blockNumber: Number(BigInt(value.blockNumber)),
          blockHash: value.blockHash.toLowerCase(),
        };
      };
    } else {
      const family = path.join(__dirname, '../installed-journey');
      const { createJourneyChain, ENDPOINT: PRIMARY, LIMITED_ENDPOINT } = require(path.join(family, 'journey-chain.cjs'));
      const ENDPOINT = request.synthetic.endpoint === 'limited' ? LIMITED_ENDPOINT : PRIMARY;
      const { createJourneyCrypto } = require(path.join(family, 'journey-crypto.cjs'));
      const { createJourneyPoiVerifier } = require(path.join(family, 'journey-poi-verifier.cjs'));
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
        faults: request.synthetic.faults ?? {},
        poiVerifier: createJourneyPoiVerifier({
          engineModules: request.synthetic.engineModules,
          serialProver: path.join(request.runtime.proverArchive, 'serial-prover.cjs'),
        }),
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
            const begun = beginRequest(typeof wire?.method === 'string' ? wire.method : 'other');
            let result;
            try {
              result = await chain.request(subject, url, wire);
            } catch (error) {
              // A modeled provider error answers as JSON-RPC, as a gateway would.
              if (error?.code !== 'SYNTHETIC_RPC_ERROR') {
                endRequest(begun, { status: null, code: typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED' });
                throw error;
              }
              const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: wire.id, error: error.rpcError }));
              const status = Number.isSafeInteger(error.httpStatus) ? error.httpStatus : 200;
              endRequest(begun, { status, rpcError: true, rpcErrorCode: error.rpcError?.code, bytes: body.length });
              return {
                // A modeled service may answer its error with a non-200 status.
                status,
                body,
              };
            }
            const body = Buffer.from(
              JSON.stringify(Object.hasOwn(wire, 'jsonrpc') ? { jsonrpc: '2.0', id: wire.id, result } : result)
            );
            endRequest(begun, { status: 200, resultNull: result === null, bytes: body.length });
            return { status: 200, body };
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
        // The synthetic chain's block hash convention: the word of n + 1000.
        const blockHash = '0x' + BigInt(tx.blockNumber + 1000).toString(16).padStart(64, '0');
        return { status: tx.status, gasUsed: '1248446', effectiveGasPrice: tx.gasPrice, blockNumber: tx.blockNumber, blockHash };
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
    // The one bounded lifetime override (live rebuild only; see vault-lifetime.cjs).
    // Applied after the owner read: a successful vault key borrow resets the
    // timer to the host default, which would silently undo an earlier override.
    const identity = fixed('identity/vault.js');
    const unlockedAt = performance.now();
    vaultLifetime = require('./vault-lifetime.cjs').applyRebuildUnlock(identity, {
      mode: request.mode,
      synthetic: !live,
      params: request.params,
    });
    lifecycle.lifetimeMs = vaultLifetime.lifetimeMs;
    lifecycle.overridden = vaultLifetime.overridden;
    identity.getSessionSignal().addEventListener(
      'abort',
      () => {
        lifecycle.sessionAbortedAfterMs = Math.round(performance.now() - unlockedAt);
      },
      { once: true }
    );
    sessionUnlockedAt = unlockedAt;
    const facade = fixed('wallet/railgun-owner-host.js').initializeRailgunOwner(request.runtime);
    const scenario = await MODES[request.mode]({
      facade,
      signal: application.signal,
      milestone,
      mark,
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
      mode: request.mode,
      vault: { unlockedAt: sessionUnlockedAt, lifetimeMs: vaultLifetime.lifetimeMs },
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
      // Frozen once the scenario returned, after its lanes and sessions drained.
      telemetry: telemetrySnapshot(request.transport),
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
        // An attempt's own closed outcome code, kept apart from a later failure.
        primaryRefusal:
          typeof error?.primaryRefusal === 'string' && /^[A-Za-z0-9_:-]{1,80}$/.test(error.primaryRefusal)
            ? error.primaryRefusal
            : null,
        ...(live ? {} : { message: String(error?.message ?? '').slice(0, 240) }),
        frames: String(error?.stack ?? '')
          .split('\n')
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 14),
        ...(live ? {} : { milestones: milestones.map((value) => value.slice(0, 200)) }),
        syntheticChain: chain?.report() ?? null,
        transportTrace: live ? transportTrace : null,
        telemetry: telemetrySnapshot(request.transport),
        lifecycle,
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
