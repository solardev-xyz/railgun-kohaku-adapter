"use strict";
const assert = require("node:assert/strict");
const path = require("node:path"),
  fs = require("node:fs"),
  os = require("node:os");
const {
  createVault,
} = require("../../examples/reference-wallet/host/vault.cjs");
const {
  createContextHost,
} = require("../../examples/reference-wallet/host/context.cjs");
const {
  createSessionHost,
} = require("../../examples/reference-wallet/host/sessions.cjs");
const {
  createCredentialHost,
} = require("../../examples/reference-wallet/host/credentials.cjs");
const {
  createStorageHost,
} = require("../../examples/reference-wallet/host/storage.cjs");

/** Disposable reference-host custody exercise. It is not an account or network
 * qualification. No keys, mnemonic, seed or authority handles leave the process. */
async function checkReferenceCustody({ profile, password, create }) {
  const root = profile.userDataDir;
  assert.equal(fs.realpathSync(root), root);
  assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(root).startsWith("railgun-reference-cold-"));
  const marker = root + ".public-conformance";
  if (create) {
    assert.equal(fs.readdirSync(root).length, 0);
    fs.writeFileSync(marker, "reference-custody-v1", {
      flag: "wx",
      mode: 0o600,
    });
  }
  assert.equal(fs.readFileSync(marker, "utf8"), "reference-custody-v1");
  const appData = root + ".locks";
  fs.mkdirSync(appData, { recursive: true, mode: 0o700 });
  const lock =
    require("../../examples/reference-wallet/host/profile-lock-core.cjs").acquireLock(
      { root, appData },
    );
  const context = createContextHost({ assertCurrent: lock.verify }),
    vault = createVault({ profile, assertCustody: lock.verify });
  const profiles = { getActiveProfile: () => profile };
  const credentials = createCredentialHost({ context, profiles, vault });
  const application = new AbortController();
  const sessionHost = createSessionHost({
    context,
    profiles,
    credentials,
    lifetime: application.signal,
  });
  const storage = createStorageHost(context);
  try {
    if (create) await vault.initialize(password);
    await vault.unlock(password);
    const parent = sessionHost.sessions.openPrivacySession();
    const parentHandle = parent.getContext({
      kind: "private-account",
      principal: "railgun:0",
      chainId: 11155111,
      protocol: "railgun",
      deployment: "sepolia",
      role: "storage",
      operation: "railgun-account-enrollment-v1",
    });
    const requestLifetime = new AbortController();
    const scope = context.createPrivacyScope({
      profileId: context.getPrivacyContext(parentHandle).profileId,
      signal: AbortSignal.any([parent.signal, requestLifetime.signal]),
    });
    const handle = scope.getContext({
      kind: "private-account",
      principal: "railgun:0",
      chainId: 11155111,
      protocol: "railgun",
      deployment: "sepolia",
      role: "storage",
      operation: "railgun-account-enrollment-v1",
    });
    let stored, borrowed;
    try {
      await credentials.withMaterial(
        {
          handle,
          vaultSession: credentials.currentSession(),
          accountIndex: 0,
          purpose: "storage-root",
          signal: requestLifetime.signal,
        },
        async ({ bytes, profileGuard }) => {
          borrowed = bytes;
          const directory = path.join(
            profile.userDataDir,
            "wallet-railgun-accounts",
          );
          stored = storage.createPrivacyStorage({
            handle,
            directory,
            key: bytes,
            profileGuard,
          });
          if (create) {
            assert.equal(await stored.get("conformance"), null);
            await stored.update(
              "conformance",
              () => "reference-host-custody-v1",
            );
          }
          assert.equal(
            await stored.get("conformance"),
            "reference-host-custody-v1",
          );
          requestLifetime.abort();
          scope.close();
        },
      );
      assert.equal(
        borrowed.every((byte) => byte === 0),
        true,
      );
      await assert.rejects(stored.get("conformance"));
    } finally {
      requestLifetime.abort();
      scope.close();
    }
    return Object.freeze({
      authenticatedInventory: true,
      encryptedRecord: true,
      rootDrained: true,
      revoked: true,
    });
  } finally {
    sessionHost.close();
    application.abort();
    vault.lock();
  }
}
module.exports = { checkReferenceCustody };
if (require.main === module) {
  // Test-only password comes from stdin, never argv or the environment.
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", async () => {
    const password = Buffer.concat(chunks);
    for (const chunk of chunks) chunk.fill(0);
    try {
      const [directory, mode] = process.argv.slice(2);
      assert.ok(mode === "create" || mode === "open");
      const result = await checkReferenceCustody({
        profile: { id: "public-custody-conformance", userDataDir: directory },
        password,
        create: mode === "create",
      });
      process.stdout.write(JSON.stringify(result) + "\n");
    } catch (error) {
      process.stderr.write(
        String(error.code || "CUSTODY_CONFORMANCE_REFUSED") + "\n",
      );
      process.exitCode = 1;
    } finally {
      password.fill(0);
    }
  });
}
