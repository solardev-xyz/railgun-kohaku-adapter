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
  runtime: process,
  resources: () => ({ vault, tor, composition, session, operation }),
  onForced: (code) =>
    process.stderr.write(
      JSON.stringify({ status: "recovery-required", code }) + "\n",
    ),
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
  const unlockStarted = Date.now();
  try {
    await vault.unlock(password);
  } finally {
    password.fill(0);
  }
  const signal = AbortSignal.any([lifetime.signal, vault.currentSession()]);
  if (options.command === "funding-address") {
    const { submitter } = require("./host/signers.cjs").createSignerHost({
      vault,
      profiles: { getActiveProfile: () => profile },
    });
    return Object.freeze({
      status: "funding-address",
      chainId: 11155111,
      address: submitter.readMetadata().address,
    });
  }
  if (options.command === "operations") {
    const state =
      require("./host/application-state.cjs").createApplicationState({
        profile,
        vault,
        assertCustody: lock.verify,
      });
    try {
      return Object.freeze({
        status: "operations",
        operations: (await state.get("operations")) ?? [],
      });
    } finally {
      state.close();
    }
  }
  if (options.command === "unshield-note") {
    const { submitter } = require("./host/signers.cjs").createSignerHost({
      vault,
      profiles: { getActiveProfile: () => profile },
    });
    if (
      options.recipient.toLowerCase() !==
      submitter.readMetadata().address.toLowerCase()
    )
      throw Object.assign(
        Error("Unshield recipient must be the enrolled funding address"),
        { code: "REFERENCE_UNSHIELD_RECIPIENT" },
      );
  }
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
  if (options.command === "receipt")
    return composition.readReceipt(
      options.transactionHash,
      require("./review.cjs").createReviews(terminal).disclosure,
    );
  let chain, state;
  try {
    if (
      ["scan", "scan-new", "shield", "pay-note", "unshield-note"].includes(
        options.command,
      )
    ) {
      state = require("./host/application-state.cjs").createApplicationState({
        profile,
        vault,
        assertCustody: lock.verify,
      });
    }
    if (["scan", "scan-new"].includes(options.command)) {
      chain = require("./chain.cjs").createChainReader({
        tor,
        rpcUrl: config.rpcUrl,
        signal,
      });
    }
    return await require("./account-command.cjs").accountCommand({
      owner: composition.owner,
      ...options,
      signal,
      state,
      chain,
      onSession: (value) => {
        session = value;
      },
      scanCacheDigest: composition.cacheDigests.public,
      deadline: unlockStarted + config.unlockMinutes * 60000,
      reviews: require("./review.cjs").createReviews(terminal),
      confirm: () =>
        terminal.confirm(
          options.command === "scan-new"
            ? "Begin a new public scan generation and application scan phase? This is a full rescan. Existing custody remains retained."
            : "Begin a new derived wallet generation? Existing custody remains retained.",
          "REBUILD",
          signal,
        ),
      progress: (value) =>
        process.stderr.write(
          JSON.stringify({ status: "scanning", ...value }) + "\n",
        ),
    });
  } finally {
    state?.close();
    if (chain) await chain.close();
  }
}
operation = run();
operation
  .then(async (result) => {
    process.stdout.write(
      JSON.stringify(result, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ) + "\n",
    );
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
