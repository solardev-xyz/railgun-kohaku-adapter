/** Thin trusted Freedom composition for the repo-only recipe. Outer reviewed
 * preparation must pin this tool, the full installed package/host/runtime closure
 * and own the original Electron child. This module is not a native launcher.
 */
"use strict";
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const {
  createRouter,
  publicFixture,
  runReadScenario,
} = require("./read-scenario.cjs");
const ENDPOINT = "https://synthetic.invalid/installed-owner-read";
async function execute({ freedomRoot, directory, sourceBytes, runtime }) {
  assert.equal(process.type, "browser");
  assert.ok(process.versions.electron);
  publicFixture(sourceBytes);
  for (const value of [freedomRoot, directory, ...Object.values(runtime)])
    assert.ok(
      typeof value === "string" &&
        path.isAbsolute(value) &&
        path.resolve(value) === value,
    );
  assert.deepEqual(Object.keys(runtime).sort(), [
    "archive",
    "artifactDirectory",
    "proverArchive",
  ]);
  assert.equal(fs.realpathSync(freedomRoot), freedomRoot);
  assert.equal(
    fs.realpathSync(path.dirname(directory)),
    path.dirname(directory),
  );
  assert.equal(
    fs.existsSync(directory),
    false,
    "Fresh disposable directory only",
  );
  const hostRequire = createRequire(path.join(freedomRoot, "package.json"));
  // Fail before creating the disposable directory if the final public export is absent.
  // No fallback to a private owner path, test resolver or historical Freedom owner.
  hostRequire.resolve("@freedom/railgun-kohaku-adapter/host/owner");
  const fixed = (name) => hostRequire("./src/main/" + name);
  for (const name of [
    "networks/private-rpc.js",
    "wallet/railgun-owner-host.js",
  ])
    assert.equal(
      require.cache[hostRequire.resolve("./src/main/" + name)],
      undefined,
    );
  const ownerEntry = hostRequire.resolve(
    "@freedom/railgun-kohaku-adapter/host/owner",
  );
  assert.equal(require.cache[ownerEntry], undefined);
  const { app } = hostRequire("electron");
  const profileApi = fixed("profile-resolver.js"),
    locks = fixed("profile-lock.js");
  fs.mkdirSync(directory, { mode: 0o700 });
  const profile = profileApi.initializeProfile(app, {
    env: { FREEDOM_TEST_USER_DATA: path.join(directory, "profile") },
  });
  const lock = locks.acquireProfileLock(profile, {
    onCompromised: () => app.exit(1),
  });
  assert.ok(lock);
  const router = createRouter(sourceBytes),
    clients = new Set(),
    endpointLife = new AbortController();
  const application = new AbortController();
  const endpoint = Object.freeze({ signal: endpointLife.signal });
  const overrides = [];
  const replace = (object, key, value) => {
    overrides.push([object, key, object[key], value]);
    object[key] = value;
  };
  let vault,
    ownersClosed = false,
    transportRefusals = 0;
  try {
    const registry = fixed("networks/network-registry.js"),
      transport = fixed("networks/wallet-tor-transport.js");
    const tor = fixed("tor-manager.js"),
      settings = fixed("settings-store.js");
    const { getPrivacyContext } = fixed("networks/privacy-context.js");

    app.dock?.hide();
    await app.whenReady();
    replace(registry, "getNetwork", () => ({
      access: { readOrder: ["direct"] },
      quorum: { timeoutMs: 30000 },
    }));
    replace(registry, "getEndpoints", () => [ENDPOINT]);
    replace(registry, "getEndpointSources", () => [
      { keyed: false, coverage: { 11155111: ENDPOINT } },
    ]);
    replace(tor, "getWalletSocksEndpoint", () => endpoint);
    replace(settings, "isWalletTorExperimentAvailable", () => true);
    replace(transport, "createWalletTorTransport", () => {
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
            assert.equal(subject.kind, "private-account");
            assert.equal(subject.principal, "railgun:0");
            assert.equal(subject.protocol, "railgun");
            assert.equal(subject.deployment, "sepolia");
            assert.equal(subject.chainId, 11155111);
            assert.equal(subject.role, "protocol-rpc");
            assert.equal(subject.operation, null);
            assert.equal(url, ENDPOINT);
            assert.equal(options.method, "POST");
            assert.ok(Buffer.byteLength(options.body) <= 65536);
            const wire = JSON.parse(options.body);
            assert.deepEqual(Object.keys(wire).sort(), [
              "id",
              "jsonrpc",
              "method",
              "params",
            ]);
            assert.equal(wire.jsonrpc, "2.0");
            assert.equal(typeof wire.id, "string");
            const result = router.request(wire.method, wire.params);
            return {
              status: 200,
              body: Buffer.from(
                JSON.stringify({ jsonrpc: "2.0", id: wire.id, result }),
              ),
            };
          } catch (error) {
            transportRefusals++;
            throw error;
          }
        },
      });
      clients.add(client);
      return client;
    });
    vault = fixed("identity/vault.js");
    const vaultDirectory = path.join(directory, "profile", "identity");
    await vault.importVault(
      vaultDirectory,
      "public-fixture-password-not-a-user-credential",
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    );
    await vault.unlockVault(
      vaultDirectory,
      "public-fixture-password-not-a-user-credential",
      0,
    );
    // The fixed host calls the genuine installed public initializeRailgunMain.
    // Real context/RPC/storage/credential/platform owners are not replaced.
    const facade = fixed("wallet/railgun-owner-host.js").initializeRailgunOwner(
      runtime,
    );
    const scenario = await runReadScenario(
      facade,
      sourceBytes,
      application.signal,
    );
    ownersClosed = true;
    router.assertClean();
    assert.equal(transportRefusals, 0);
    return Object.freeze({
      ...scenario,
      rpcOwner: "genuine-private-rpc",
      syntheticRpcMethods: router.counts(),
      outerQualificationRequired: true,
    });
  } finally {
    application.abort();
    vault?.lockVault();
    for (const client of clients) client.close();
    await Promise.all([...clients].map((client) => client.closed));
    endpointLife.abort();
    for (const [object, key, original, replacement] of overrides.reverse()) {
      assert.equal(object[key], replacement);
      object[key] = original;
    }
    // On any uncertain owner failure, the original process retains its profile
    // lock until the outer process owner observes/terminates it. Never hand off.
    if (ownersClosed) locks.releaseProfileLock(lock);
  }
}
module.exports = Object.freeze({ execute });
