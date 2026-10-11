"use strict";
/** Fresh Electron process, disposable profiles only. It invokes the example's
 * actual command module and public adapter, not a Freedom owner or test host. */
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { app } = require("electron");
const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const root = fs.realpathSync(config.root);
if (
  path.dirname(root) !== fs.realpathSync(os.tmpdir()) ||
  !path.basename(root).startsWith("railgun-reference-journey-") ||
  fs.readFileSync(path.join(root, "PUBLIC-FIXTURE"), "utf8") !==
    "no funded accounts; synthetic services only\n"
)
  throw Error("Disposable fixture required");
if (!["alice", "bob", "charlie"].includes(config.actor))
  throw Error("Unknown fixture actor");
const example = path.join(root, "example"),
  profileRoot = path.join(root, config.actor);
app.setPath("appData", path.join(root, "locks"));
app.dock?.hide();
const { acquireProfileLock } = require(
  path.join(example, "host/profile-lock.cjs"),
);
const lock = acquireProfileLock({ root: profileRoot });
const { createVault, readVaultProfile } = require(
  path.join(example, "host/vault.cjs"),
);
let vault, composition, session, appState, chain;
const preparationDiagnostics = [],
  commandProgress = [];
const lifetime = new AbortController();
require(path.join(example, "fatal.cjs")).installFatalHandlers({
  app,
  resources: () => ({ vault, lifetime }),
});
async function run() {
  await app.whenReady();
  const profile =
    config.command === "fixture-init"
      ? { id: "public-fixture-" + config.actor, userDataDir: profileRoot }
      : readVaultProfile(profileRoot);
  vault = createVault({
    profile,
    assertCustody: lock.verify,
    unlockMs: 60 * 60000,
  });
  const password = Buffer.from("public disposable reference journey password");
  try {
    if (config.command === "fixture-init") await vault.initialize(password);
    await vault.unlock(password);
  } finally {
    password.fill(0);
  }
  const signal = AbortSignal.any([lifetime.signal, vault.currentSession()]);
  if (config.command === "fixture-init") {
    const { submitter } = require(
      path.join(example, "host/signers.cjs"),
    ).createSignerHost({
      vault,
      profiles: { getActiveProfile: () => profile },
    });
    return {
      status: "initialized",
      funding: submitter.readMetadata().address.toLowerCase(),
    };
  }
  const endpoint = Object.freeze({
    host: "127.0.0.1",
    port: config.port,
    signal,
  });
  const tor = { getWalletSocksEndpoint: () => endpoint };
  composition = require(
    path.join(example, "host/compose.cjs"),
  ).initializeReferenceOwner({
    profile,
    vault,
    tor,
    rpcUrl: config.rpcUrl,
    serviceOrigins: config.serviceOrigins,
    runtime: config.runtime,
    ...(config.maxOperationAmount
      ? { maxOperationAmount: config.maxOperationAmount }
      : {}),
  });
  if (config.command === "receipt")
    return {
      result: await composition.readReceipt(config.transactionHash, () => true),
      hostDigest: composition.hostDigest,
    };
  appState = require(
    path.join(example, "host/application-state.cjs"),
  ).createApplicationState({ profile, vault, assertCustody: lock.verify });
  if (config.fixtureCrash === "after-prepared") {
    if (!["pay-note", "unshield-note", "journey-next"].includes(config.command))
      throw Error("Invalid crash fixture");
    const actual = appState;
    appState = Object.freeze({
      get: actual.get,
      close: actual.close,
      async update(name, change) {
        let changed;
        const result = await actual.update(name, (value) => {
          changed = change(value);
          return changed;
        });
        if (name === "operations" && changed.at(-1)?.status === "prepared")
          process.kill(process.pid, "SIGKILL");
        return result;
      },
    });
  }
  if (config.fixtureCrash === "before-guide-result") {
    const actual = appState;
    appState = {
      ...actual,
      async update(name, change) {
        return actual.update(name, (value) => {
          const next = change(value);
          if (
            name === "guided-journey" &&
            value?.inflight &&
            next.inflight === null
          )
            process.kill(process.pid, "SIGKILL");
          return next;
        });
      },
    };
  }
  chain = require(path.join(example, "chain.cjs")).createChainReader({
    tor,
    rpcUrl: config.rpcUrl,
    signal,
  });
  const reviewTimings = [];
  let reviews = 0,
    disclosedShieldRequests = null;
  // ONLY this marked offline harness consents automatically. No production
  // app switch accepts a fixture or bypasses the terminal's human reviews.
  const consent = (summary) => {
    if (summary?.purpose === "railgun-shield-observation-v1")
      disclosedShieldRequests = [...summary.requests];
    reviews++;
    reviewTimings.push({ purpose: summary?.purpose ?? null, at: Date.now() });
    return true;
  };
  async function command(selected, hooks = {}) {
    await hooks.onDispatch?.();
    if (selected.command === "funding-address") {
      const { submitter } = require(
        path.join(example, "host/signers.cjs"),
      ).createSignerHost({
        vault,
        profiles: { getActiveProfile: () => profile },
      });
      return {
        status: "funding-address",
        chainId: 11155111,
        address: submitter.readMetadata().address,
      };
    }
    if (selected.command === "receipt")
      return composition.readReceipt(selected.transactionHash, consent);
    return await require(
      path.join(example, "account-command.cjs"),
    ).accountCommand({
      ...config,
      ...selected,
      owner: composition.owner,
      maxOperationAmount:
        composition.applicationPolicy.maxOperationAmount ?? 10000000000000000n,
      signal,
      state: appState,
      chain,
      progress: (value) => {
        if (value.status === "txid-recovering") commandProgress.push(value);
        if (
          value.status === "txid-recovering" ||
          value.ranges % 10 === 0 ||
          value.checkpoint === value.anchor
        )
          process.stderr.write(
            JSON.stringify({ fixtureProgress: value }) + "\n",
          );
      },
      scanCacheDigest: composition.cacheDigests.public,
      deadline: Date.now() + (config.pauseScan === true ? 4 : 55) * 60000,
      onDiagnostic: (value) => preparationDiagnostics.push(value),
      onSession: (value) => {
        session = value;
      },
      confirm: consent,
      reviews: {
        preparation: async (summary) => {
          const approved =
            config.refusePreparation === true ? false : consent(summary);
          await hooks.onPreparationDecision?.(approved);
          return approved;
        },
        transaction: async (summary) => {
          const approved = consent(summary);
          await hooks.onTransactionDecision?.(approved, summary);
          return approved;
        },
        disclosure: consent,
        resolution: consent,
        txidConsent: async () => consent,
      },
    });
  }
  let result;
  if (config.command.startsWith("journey-")) {
    const guide = require(path.join(example, "journey.cjs"));
    const identity = guide.journeyIdentity(
      { rpcUrl: config.rpcUrl, runtime: config.runtime },
      composition.hostDigest,
    );
    if (config.command === "journey-start")
      result = await guide.startJourney({
        state: appState,
        identity,
        role: config.actor,
      });
    else if (config.command === "journey-status")
      result = await guide.journeyStatus(appState);
    else
      result = await guide.nextJourney({
        state: appState,
        identity,
        signal,
        execute: command,
        confirm: async () => true,
        ask: async (prompt) => {
          if (prompt.includes("wei")) return "1000000000000000";
          if (prompt.includes("Bob's Railgun")) return config.bobAddress;
          if (prompt.includes("transaction hash")) return config.transferHash;
          throw Error("Unexpected guided fixture input");
        },
      });
  } else result = await command(config);
  return {
    result,
    commandProgress,
    reviews,
    reviewTimings,
    disclosedShieldRequests,
    hostDigest: composition.hostDigest,
    applicationPolicy: {
      maxGasFee: composition.applicationPolicy.maxGasFee.toString(),
      maxOperationAmount: (
        composition.applicationPolicy.maxOperationAmount ?? 10000000000000000n
      ).toString(),
    },
  };
}
async function close() {
  lifetime.abort();
  if (session) {
    session.close();
    await session.closed;
  }
  appState?.close();
  if (chain) await chain.close();
  composition?.close();
  vault?.lock();
}
run().then(
  async (result) => {
    await close();
    process.stdout.write(
      JSON.stringify({ passed: true, ...result }, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ) + "\n",
    );
    app.exit(0);
  },
  async (error) => {
    try {
      await close();
    } catch {
      /* Keep the original fixture failure. */
    }
    // Fixture failures only. There are no funded values in this marked root.
    process.stderr.write(
      JSON.stringify({
        passed: false,
        code: error.code ?? null,
        error: error.message,
        stack: error.stack,
        preparationDiagnostics,
        commandProgress,
      }) + "\n",
    );
    app.exit(1);
  },
);
