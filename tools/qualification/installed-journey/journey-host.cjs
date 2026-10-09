/** Thin trusted Freedom composition for the installed-owner journey family,
 * adapted from the reviewed r5 freedom-private.cjs. Only the registry, Tor
 * endpoint, availability setting and lower transport leaves are replaced; the
 * genuine installed initializeRailgunOwner, contexts, RPC admission, journal,
 * credentials, stores, engine and prover run unchanged.
 */
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { publicFixture } = require('./read-scenario.cjs');
const { createJourneyChain, ENDPOINT } = require('./journey-chain.cjs');
const { createJourneyCrypto } = require('./journey-crypto.cjs');
const { createJourneyPoiVerifier } = require('./journey-poi-verifier.cjs');
const scenarios = require('./journey-scenario.cjs');
const MODES = Object.freeze({
  prepare: { cold: false, sendMode: 'acknowledge' },
  'submit-stored': { cold: true, sendMode: 'acknowledge' },
  'submit-stored-unknown': { cold: true, sendMode: 'unknown-after-delivery' },
  'cold-output': { cold: true, sendMode: 'acknowledge' },
  'transact-unshield': { cold: true, sendMode: 'acknowledge' },
  'legacy-recover': { cold: true, sendMode: 'acknowledge' },
  'policy-probe': { cold: true, sendMode: 'acknowledge' },
  'pending-negative': { cold: true, sendMode: 'acknowledge' },
  'policy-recover': { cold: true, sendMode: 'acknowledge' },
});
const failures = new WeakMap();
async function executeInner(
  { freedomRoot, directory, profileDirectory, sourceBytes, runtime, mode, previous, chainState, engineModules },
  diagnostic
) {
  assert.ok(Object.hasOwn(MODES, mode));
  const { cold, sendMode } = MODES[mode];
  assert.equal(previous !== undefined, cold);
  assert.equal(chainState !== undefined, cold);
  assert.equal(process.type, 'browser');
  publicFixture(sourceBytes);
  for (const value of [freedomRoot, directory, profileDirectory, ...Object.values(runtime)])
    assert.ok(typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value);
  assert.deepEqual(Object.keys(runtime).sort(), ['archive', 'artifactDirectory', 'proverArchive']);
  assert.equal(fs.existsSync(directory), false, 'Fresh output directory only');
  assert.equal(fs.existsSync(profileDirectory), cold);
  const hostRequire = createRequire(path.join(freedomRoot, 'package.json'));
  hostRequire.resolve('@freedom/railgun-kohaku-adapter/host/owner');
  const fixed = (name) => hostRequire('./src/main/' + name);
  for (const name of ['networks/private-rpc.js', 'wallet/railgun-owner-host.js'])
    assert.equal(require.cache[hostRequire.resolve('./src/main/' + name)], undefined);
  const ethers = hostRequire('ethers');
  const { TRANSACT_ABI } = hostRequire('@freedom/railgun-kohaku-adapter/host/data');
  const { app } = hostRequire('electron');
  const profileApi = fixed('profile-resolver.js'),
    locks = fixed('profile-lock.js');
  fs.mkdirSync(directory, { mode: 0o700 });
  const profile = profileApi.initializeProfile(app, {
    env: { FREEDOM_TEST_USER_DATA: profileDirectory },
  });
  const lock = locks.acquireProfileLock(profile, { onCompromised: () => app.exit(1) });
  assert.ok(lock);
  const worker = createJourneyCrypto({ engineModules });
  const chain = createJourneyChain({
    ethers,
    transactAbi: TRANSACT_ABI,
    sourceBytes,
    state: chainState,
    sendMode,
    crypto: worker,
    poiVerifier: createJourneyPoiVerifier({
      engineModules,
      serialProver: path.join(runtime.proverArchive, 'serial-prover.cjs'),
    }),
  });
  const clients = new Set(),
    endpointLife = new AbortController(),
    application = new AbortController();
  const endpoint = Object.freeze({ signal: endpointLife.signal });
  const overrides = [];
  const replace = (object, key, value) => {
    overrides.push([object, key, object[key], value]);
    object[key] = value;
  };
  let vault,
    manager,
    ownersClosed = false,
    transportFailures = 0;
  try {
    const registry = fixed('networks/network-registry.js'),
      transport = fixed('networks/wallet-tor-transport.js');
    const tor = fixed('tor-manager.js'),
      settings = fixed('settings-store.js');
    const { getPrivacyContext } = fixed('networks/privacy-context.js');
    await chain.init();
    app.dock?.hide();
    await app.whenReady();
    replace(registry, 'getNetwork', () => ({
      access: { readOrder: ['direct'] },
      quorum: { timeoutMs: 30000 },
    }));
    replace(registry, 'getEndpoints', () => [ENDPOINT]);
    replace(registry, 'getEndpointSources', () => [
      { keyed: false, coverage: { 11155111: ENDPOINT } },
    ]);
    replace(tor, 'getWalletSocksEndpoint', () => endpoint);
    replace(settings, 'isWalletTorExperimentAvailable', () => true);
    replace(transport, 'createWalletTorTransport', () => {
      let closed = false,
        resolve;
      const barrier = new Promise((yes) => {
        resolve = yes;
      });
      const client = Object.freeze({
        closed: barrier,
        release() {},
        close() {
          if (!closed) {
            closed = true;
            resolve();
          }
        },
        async request(handle, url, options) {
          try {
            assert.equal(closed, false);
            assert.equal(options.signal.aborted, false);
            const { subject } = getPrivacyContext(handle);
            assert.equal(options.method, 'POST');
            assert.ok(Buffer.byteLength(options.body) <= 65536);
            const wire = JSON.parse(options.body);
            const result = await chain.request(subject, url, wire);
            return {
              status: 200,
              body: Buffer.from(
                JSON.stringify(
                  Object.hasOwn(wire, 'jsonrpc') ? { jsonrpc: '2.0', id: wire.id, result } : result
                )
              ),
            };
          } catch (error) {
            transportFailures++;
            throw error;
          }
        },
      });
      clients.add(client);
      return client;
    });
    vault = fixed('identity/vault.js');
    manager = fixed('identity-manager.js');
    if (cold) await manager.unlockVault('public-fixture-password-not-a-user-credential');
    else
      await manager.importExistingMnemonic(
        'public-fixture-password-not-a-user-credential',
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        false
      );
    assert.equal(vault.isUnlocked(), true);
    const facade = fixed('wallet/railgun-owner-host.js').initializeRailgunOwner(runtime);
    const scenario = await scenarios.run(mode, {
      directory,
      profileDirectory,
      facade,
      sourceBytes,
      signal: application.signal,
      previous,
      chain,
      milestone: diagnostic.milestone,
    });
    ownersClosed = true;
    const chainReport = chain.report();
    if (sendMode === 'unknown-after-delivery') {
      assert.equal(chainReport.unknownSends >= 1, true);
      assert.equal(transportFailures, chainReport.unknownSends);
    } else assert.equal(transportFailures, 0);
    chain.assertClean();
    fs.writeFileSync(
      path.join(directory, 'chain-state.json'),
      JSON.stringify(chain.state(), null, 2) + '\n',
      { flag: 'wx', mode: 0o600 }
    );
    return Object.freeze({
      ...scenario,
      rpcOwner: 'genuine-private-rpc',
      syntheticChain: { ...chainReport, derived: chain.derived() },
      outerQualificationRequired: true,
    });
  } finally {
    application.abort();
    await worker.close();
    if (manager) await manager.lockVault();
    else vault?.lockVault();
    for (const client of clients) client.close();
    await Promise.all([...clients].map((client) => client.closed));
    endpointLife.abort();
    for (const [object, key, original, replacement] of overrides.reverse()) {
      assert.equal(object[key], replacement);
      object[key] = original;
    }
    diagnostic.snapshot = Object.freeze({
      schema: 'railgun-journey-failure-v1',
      milestones: Object.freeze([...diagnostic.seen]),
      syntheticChain: chain.report(),
      transportFailures,
    });
    if (ownersClosed) locks.releaseProfileLock(lock);
  }
}
async function execute(options) {
  const diagnostic = { seen: [], snapshot: null };
  diagnostic.milestone = (value) => {
    diagnostic.seen.push(value);
  };
  try {
    return await executeInner(options, diagnostic);
  } catch (error) {
    if (error && (typeof error === 'object' || typeof error === 'function'))
      failures.set(error, diagnostic.snapshot);
    throw error;
  }
}
function failureDiagnostics(error) {
  return failures.get(error) || null;
}
module.exports = Object.freeze({ execute, failureDiagnostics, MODES });
