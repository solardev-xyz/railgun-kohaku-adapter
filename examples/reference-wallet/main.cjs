"use strict";
// Headless Electron main. No BrowserWindow, IPC server, automatic transaction,
// credential environment variable or direct-network fallback.
const { app } = require("electron");
let vault, tor, composition, session, operation;
const lifetime = new AbortController();
const fatal = require("./fatal.cjs").installFatalHandlers({
  app,
  resources: () => ({ vault, lifetime }),
});
const fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const { parseArguments, loadConfiguration } = require("./config.cjs");
const { createTerminal } = require("./terminal.cjs");
const { custodyCommand } = require("./custody.cjs");
const { assertRoot } = require("./host/files.cjs");
const { acquireProfileLock } = require("./host/profile-lock.cjs");
const { createVault, readVaultProfile } = require("./host/vault.cjs");
const shutdown = require("./shutdown.cjs").createShutdown({
  app,
  lifetime,
  resources: () => ({ vault, tor, composition, session, operation }),
  onForced: () =>
    process.stderr.write(
      '{"status":"recovery-required","code":"REFERENCE_SHUTDOWN_TIMEOUT"}\n',
    ),
});
process.once("SIGINT", () => {
  void shutdown.quit();
});
process.once("SIGTERM", () => {
  void shutdown.quit();
});
process.once("SIGHUP", () => {
  void shutdown.quit();
});
function directory(filename, create) {
  if (!fs.existsSync(filename) && create) {
    assertRoot(path.dirname(filename));
    fs.mkdirSync(filename, { mode: 0o700 });
  }
  assertRoot(filename);
  return filename;
}
async function run() {
  const options = parseArguments(process.argv.slice(2));
  const fresh = ["init", "restore"].includes(options.command);
  directory(options.profile, fresh);
  const lock = acquireProfileLock({
    root: options.profile,
    onCompromised: fatal,
  });
  const config = options.config ? loadConfiguration(options.config) : null;
  const profile = fresh
    ? Object.freeze({ id: randomUUID(), userDataDir: options.profile })
    : readVaultProfile(options.profile);
  vault = createVault({
    profile,
    assertCustody: lock.verify,
    unlockMs: (config?.unlockMinutes ?? 15) * 60000,
  });
  const terminal = createTerminal();
  app.dock?.hide();
  await app.whenReady();
  if (fresh || options.command === "backup")
    return custodyCommand({
      command: options.command,
      vault,
      terminal,
      signal: lifetime.signal,
    });
  const password = await terminal.read("Vault password: ", {
    secret: true,
    signal: lifetime.signal,
  });
  try {
    await vault.unlock(password);
  } finally {
    password.fill(0);
  }
  const signal = AbortSignal.any([lifetime.signal, vault.currentSession()]);
  const torDirectory = directory(path.join(lock.directory, "tor"), true);
  tor = require("./host/tor.cjs").createTorManager({
    ...config.tor,
    directory: torDirectory,
    signal,
  });
  process.stderr.write("Starting the pinned Tor proxy…\n");
  await tor.start();
  composition = require("./host/compose.cjs").initializeReferenceOwner({
    ...config,
    profile,
    vault,
    tor,
  });
  session = await composition.owner[
    options.command === "account-create" ? "createAccount" : "openAccount"
  ]({
    accountIndex: 0,
    signal,
    ...(options.command === "account-info" && options.cache === "pending"
      ? { publicCache: "pending" }
      : {}),
  });
  return Object.freeze({ status: "account-opened", ...session.describe() });
}
operation = run();
operation
  .then(async (result) => {
    process.stdout.write(JSON.stringify(result) + "\n");
    await shutdown.quit();
  })
  .catch(async (error) => {
    // Never print arbitrary thrown messages/stacks: provider and review payloads
    // can contain wallet data. A closed code is enough for this command surface.
    try {
      await shutdown.close();
    } catch {
      /* Retain original failure; process exit revokes remaining work. */
    }
    const code =
      typeof error?.code === "string" &&
      /^(REFERENCE|RAILGUN|PRIVATE|PRIVACY|TOR)_[A-Z0-9_]{1,96}$/.test(
        error.code,
      )
        ? error.code
        : "REFERENCE_COMMAND_REFUSED";
    process.stderr.write(JSON.stringify({ status: "refused", code }) + "\n");
    app.exit(1);
  });
