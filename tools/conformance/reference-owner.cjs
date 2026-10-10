"use strict";
// Electron main, offline only. Reopening is limited to this tool's marked
// disposable roots; it is not a command for opening an existing wallet profile.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { app } = require("electron");
const net = require("node:net");
const [
  archive,
  proverArchive,
  artifactDirectory,
  mode = "initialize",
  priorRoot,
] = process.argv.slice(2);
const root = priorRoot
  ? fs.realpathSync(priorRoot)
  : fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "railgun-reference-owner-")),
    );
if (
  path.dirname(root) !== fs.realpathSync(os.tmpdir()) ||
  !path.basename(root).startsWith("railgun-reference-owner-")
)
  throw new Error("Disposable conformance root required");
const marker = path.join(root, "PUBLIC-CONFORMANCE.json");
if (priorRoot) {
  if (
    fs.readFileSync(marker, "utf8") !==
    "railgun-reference-owner-public-fixture-v1\n"
  )
    throw new Error("Not a conformance fixture");
} else
  fs.writeFileSync(marker, "railgun-reference-owner-public-fixture-v1\n", {
    flag: "wx",
    mode: 0o600,
  });
const profile = Object.freeze({
  id: "public-reference-owner-conformance",
  userDataDir: path.join(root, "profile"),
});
if (!priorRoot) fs.mkdirSync(profile.userDataDir, { mode: 0o700 });
const locks = path.join(root, "locks");
if (!priorRoot) fs.mkdirSync(locks, { mode: 0o700 });
const {
  acquireProfileLock,
} = require("../../examples/reference-wallet/host/profile-lock.cjs");
app.setPath("appData", locks);
let locked = false,
  profileLock;
try {
  profileLock = acquireProfileLock({ root: profile.userDataDir });
  locked = true;
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      passed: false,
      code: error.code || "REFERENCE_LOCK_REFUSED",
    }) + "\n",
  );
  app.exit(2);
}
// app.exit schedules termination; it does not stop this JavaScript task.
if (locked) {
  const {
    createVault,
  } = require("../../examples/reference-wallet/host/vault.cjs");
  const {
    initializeReferenceOwner,
  } = require("../../examples/reference-wallet/host/compose.cjs");
  const vault = createVault({ profile, assertCustody: profileLock.verify });
  app.dock?.hide();
  async function main() {
    if (
      ![
        "initialize",
        "account",
        "account-hold",
        "reopen",
        "hold-lock",
      ].includes(mode)
    )
      throw new Error("Unsupported conformance mode");
    await app.whenReady();
    if (mode === "hold-lock") {
      process.stdout.write(JSON.stringify({ ready: true, mode, root }) + "\n");
      await new Promise((resolve) => process.stdin.once("data", resolve));
      return;
    }
    const password = Buffer.from("public reference conformance password");
    try {
      if (mode !== "reopen") await vault.initialize(password);
      await vault.unlock(password);
    } finally {
      password.fill(0);
    }
    let endpointReads = 0,
      connections = 0;
    const networkLifetime = new AbortController();
    const listener = net.createServer((socket) => {
      connections++;
      socket.destroy();
    });
    await new Promise((resolve, reject) => {
      listener.once("error", reject);
      listener.listen(0, "127.0.0.1", resolve);
    });
    const endpoint = Object.freeze({
      host: "127.0.0.1",
      port: listener.address().port,
      signal: networkLifetime.signal,
    });
    // Explicit offline endpoint fixture. Account opening constructs a scan source
    // and asks for endpoint metadata, but must not perform a request. Any actual
    // connection is refused and counted. This is not Tor qualification.
    const tor = Object.freeze({
      getWalletSocksEndpoint() {
        endpointReads++;
        return endpoint;
      },
    });
    const composition = initializeReferenceOwner({
      profile,
      vault,
      tor,
      rpcUrl: "https://unused.invalid",
      serviceOrigins: [],
      runtime: { archive, proverArchive, artifactDirectory },
    });
    let session;
    try {
      let description = null;
      if (["account", "account-hold", "reopen"].includes(mode)) {
        session = await composition.owner[
          mode === "reopen" ? "openAccount" : "createAccount"
        ]({
          accountIndex: 0,
          signal: new AbortController().signal,
          ...(mode === "reopen" ? { publicCache: "pending" } : {}),
        });
        const value = session.describe();
        description = {
          accountIndex: value.accountIndex,
          chainId: value.chainId,
          deployment: value.deployment,
          instanceIdSha256: require("node:crypto")
            .createHash("sha256")
            .update(value.instanceId)
            .digest("hex"),
        };
        if (mode === "account-hold") {
          process.stdout.write(
            JSON.stringify({ ready: true, mode, root, account: description }) +
              "\n",
          );
          await new Promise((resolve) => process.stdin.once("data", resolve));
          profileLock.verify();
        }
        await session.close();
        await session.closed;
        session = null;
      }
      if (connections !== 0)
        throw new Error("Offline owner attempted network access");
      process.stdout.write(
        JSON.stringify({
          passed: true,
          mode,
          hostDigest: composition.hostDigest,
          account: description,
          endpointReads,
          connections,
          electron: process.versions.electron,
          node: process.versions.node,
          platform: process.platform,
          architecture: process.arch,
          root,
        }) + "\n",
      );
    } finally {
      if (session) {
        await session.close();
        await session.closed;
      }
      composition.close();
      vault.lock();
      networkLifetime.abort();
      await new Promise((resolve) => listener.close(resolve));
    }
  }
  main().then(
    () => app.quit(),
    (error) => {
      vault.lock();
      process.stderr.write(
        JSON.stringify({
          passed: false,
          code: error?.code || "REFERENCE_CONFORMANCE_REFUSED",
          frames: String(error?.stack || "")
            .split("\n")
            .slice(1, 8),
        }) + "\n",
      );
      app.exit(1);
    },
  );
}
