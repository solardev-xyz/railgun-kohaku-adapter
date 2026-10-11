"use strict";
/** Installed-package, independent-host, synthetic-chain acceptance. Uses fresh
 * random vaults and one Electron process per step. Never accepts a profile path.
 * Supply only public runtime paths in an input JSON file; nothing is downloaded. */
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto");
const { execFileSync, execFile } = require("node:child_process"),
  { promisify } = require("node:util");
const execute = promisify(execFile),
  repo = path.resolve(__dirname, "../../.."),
  inputs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const {
  createJourneyChain,
  ENDPOINT,
  POI_URL,
  INDEXER_URL,
} = require("../../qualification/installed-journey/journey-chain.cjs");
const {
  createJourneyCrypto,
} = require("../../qualification/installed-journey/journey-crypto.cjs");
const {
  createJourneyPoiVerifier,
} = require("../../qualification/installed-journey/journey-poi-verifier.cjs");
const {
  transformTestList,
  TARGET,
} = require("../../qualification/installed-journey/synthetic-copy-contract.cjs");
const { createFixtureServer } = require("./server.cjs");
assert.ok(
  [undefined, "acknowledged", "retained-unknown", "retained-upgrade", "wide-retained"].includes(inputs.variant),
);
const { TRANSACT_ABI } = require("../../../src/data/railgun-private-policy.js");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const root = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "railgun-reference-journey-")),
);
fs.chmodSync(root, 0o700);
const write = (name, value) =>
  fs.writeFileSync(
    path.join(root, name),
    typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
write("PUBLIC-FIXTURE", "no funded accounts; synthetic services only\n");
for (const actor of ["alice", "bob", "charlie", "locks"])
  fs.mkdirSync(path.join(root, actor), { mode: 0o700 });
process.stdout.write(JSON.stringify({ stage: "fixture-created", root }) + "\n");
// Npm's real publication whitelist, no lifecycle hook and no install/network.
const packed = JSON.parse(
  execFileSync(
    "npm",
    [
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      root,
      "--cache",
      path.join(root, "npm-cache"),
    ],
    { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
)[0];
const installed = path.join(
  root,
  "node_modules/@freedom/railgun-kohaku-adapter",
);
fs.mkdirSync(installed, { recursive: true });
const previousTar = inputs.variant === "retained-upgrade" ? inputs.previousTar : null;
if (previousTar) {
  assert.equal(hash(fs.readFileSync(previousTar)),
    "5cb040aa6c28343d31a1db14db679cf45ef132e48e62f98df1cb1a9e184a5821");
} else assert.notEqual(inputs.variant, "retained-upgrade");
execFileSync("tar", [
  "-xzf",
  previousTar ?? path.join(root, packed.filename),
  "-C",
  installed,
  "--strip-components=1",
]);
for (const dependency of ["ethers", "better-sqlite3"])
  fs.symlinkSync(
    fs.realpathSync(path.join(repo, "node_modules", dependency)),
    path.join(root, "node_modules", dependency),
    "dir",
  );
const exampleSource = previousTar ? inputs.previousHost : path.join(repo, "examples/reference-wallet");
if (previousTar) {
  // Measure the old host as data before executing any of its modules.
  const files = JSON.parse(fs.readFileSync(path.join(exampleSource, "host/sources.json"), "utf8"));
  const rows = files.map((name) => {
    assert.ok(typeof name === "string" && !path.isAbsolute(name) && !name.split("/").includes(".."));
    return [name, hash(fs.readFileSync(path.join(exampleSource, name)))];
  });
  assert.equal(hash(JSON.stringify(["railgun-reference-host-v1", rows])),
    "ac34e683eabd8b6c8f5eb3f44999c18edaf6ae69441a8bbc0ec8033d50c2d495");
}
fs.cpSync(
  exampleSource,
  path.join(root, "example"),
  {
    recursive: true,
    filter: (filename) => !filename.split(path.sep).includes("node_modules"),
  },
);
const target = path.join(installed, TARGET),
  before = fs.readFileSync(target),
  after = transformTestList(before);
fs.writeFileSync(target, after);
const installation = {
  tarSha256: hash(fs.readFileSync(path.join(root, packed.filename))),
  files: packed.files.length,
  ...(previousTar ? { initialTarSha256: hash(fs.readFileSync(previousTar)) } : {}),
  transform: { target: TARGET, before: hash(before), after: hash(after) },
  scope: "synthetic list only; no production package mutation",
};
write("INSTALL.json", installation);
const certificateConfig =
  "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=synthetic.invalid\n[ext]\nsubjectAltName=DNS:synthetic.invalid,DNS:ppoi.fdi.network,DNS:rail-squid.squids.live\nbasicConstraints=critical,CA:TRUE\n";
write("openssl.cnf", certificateConfig);
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-config",
    path.join(root, "openssl.cnf"),
    "-keyout",
    path.join(root, "key.pem"),
    "-out",
    path.join(root, "cert.pem"),
  ],
  { stdio: "ignore" },
);
let server,
  worker,
  chain,
  step = 0;
const results = [];
async function actor(name, command, extra = {}) {
  const tag = String(++step).padStart(2, "0") + "-" + name + "-" + command;
  const config = {
    root,
    actor: name,
    command,
    runtime: inputs.runtime,
    ...(inputs.variant === "wide-retained" ? {maxOperationAmount: "50000000000000000"} : {}),
    rpcUrl: ENDPOINT,
    serviceOrigins: [POI_URL, new URL(INDEXER_URL).origin],
    port: server?.port ?? 0,
    ...extra,
  };
  const firstMethod = server?.methods.length ?? 0;
  const started = performance.now();
  write(tag + ".request.json", config);
  process.stdout.write(JSON.stringify({ stage: "running", step: tag }) + "\n");
  try {
    const execution = execute(
      inputs.electron,
      [
        path.join(__dirname, "actor.cjs"),
        path.join(root, tag + ".request.json"),
      ],
      {
        cwd: root,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          NODE_EXTRA_CA_CERTS: path.join(root, "cert.pem"),
        },
        timeout: 15 * 60000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    let progressBuffer = "";
    execution.child.stderr.on("data", (chunk) => {
      progressBuffer += chunk.toString();
      const lines = progressBuffer.split("\n");
      progressBuffer = lines.pop().slice(-8192);
      for (const line of lines) {
        let progress;
        try {
          progress = JSON.parse(line).fixtureProgress;
        } catch {
          continue;
        }
        if (
          progress &&
          [progress.checkpoint, progress.anchor, progress.ranges].every(
            Number.isSafeInteger,
          )
        )
          process.stdout.write(
            JSON.stringify({ stage: "scan-progress", step: tag, ...progress }) +
              "\n",
          );
      }
    });
    const { stdout, stderr } = await execution;
    write(tag + ".stdout", stdout);
    write(tag + ".stderr", stderr);
    const lines = stdout.trim().split("\n"),
      result = JSON.parse(lines.at(-1));
    assert.equal(result.passed, true);
    assert.equal(
      extra.expectedRefusal,
      undefined,
      "Expected refusal unexpectedly succeeded",
    );
    result.elapsedMs = Math.round(performance.now() - started);
    result.networkMethods = server?.methods.slice(firstMethod) ?? [];
    if (extra.expectedOutcome) {
      assert.deepEqual(result.result.outcome, extra.expectedOutcome);
      result.expectedRefusal = true;
    }
    const expectedSends =
      !extra.expectedOutcome &&
      ["shield", "pay-note", "unshield-note", "submit-stored"].includes(command)
        ? 1
        : 0;
    assert.equal(
      result.networkMethods.filter(
        (method) => method === "eth_sendRawTransaction",
      ).length,
      expectedSends,
    );
    write(tag + ".result.json", result);
    results.push({ tag, result });
    process.stdout.write(JSON.stringify({ stage: "passed", step: tag }) + "\n");
    return result.result ?? result;
  } catch (error) {
    write(tag + ".failure.json", {
      message: error.message,
      stdout: error.stdout ?? null,
      stderr: error.stderr ?? null,
    });
    if (extra.expectedRefusal && error.code === 1) {
      const failure = JSON.parse(error.stderr.trim().split("\n").at(-1));
      assert.equal(failure.passed, false);
      assert.equal(failure.code, extra.expectedRefusal);
      const networkMethods = server.methods.slice(firstMethod);
      assert.ok(!networkMethods.includes("eth_sendRawTransaction"));
      const refused = {
        expectedRefusal: true,
        code: failure.code,
        networkMethods,
      };
      write(tag + ".expected-refusal.json", refused);
      results.push({ tag, result: refused });
      process.stdout.write(
        JSON.stringify({ stage: "expected-refusal", step: tag }) + "\n",
      );
      return refused;
    }
    if (extra.fixtureCrash === "after-prepared" && error.signal === "SIGKILL") {
      assert.ok(
        !server.methods.slice(firstMethod).includes("eth_sendRawTransaction"),
      );
      const crashed = { expectedCrash: true, signal: "SIGKILL", sent: false };
      write(tag + ".expected-crash.json", crashed);
      results.push({ tag, result: crashed });
      process.stdout.write(
        JSON.stringify({ stage: "expected-crash", step: tag }) + "\n",
      );
      return crashed;
    }
    throw Error("Fixture step failed: " + tag, { cause: error });
  }
}
async function main() {
  const actors = inputs.variant === "retained-upgrade" ? ["alice", "bob"] : ["alice", "bob", "charlie"];
  const funding = {};
  for (const name of actors)
    funding[name] = (await actor(name, "fixture-init")).funding;
  assert.equal(new Set(Object.values(funding)).size, actors.length);
  worker = createJourneyCrypto({ engineModules: inputs.engineModules });
  chain = createJourneyChain({
    ethers: require("ethers"),
    transactAbi: TRANSACT_ABI,
    sourceBytes: fs.readFileSync(inputs.publicSource),
    crypto: worker,
    submitters: Object.values(funding),
    poiVerifier: createJourneyPoiVerifier({
      engineModules: inputs.engineModules,
      serialProver: inputs.serialProver,
    }),
  });
  await chain.init();
  server = await createFixtureServer({
    chain,
    submitters: Object.values(funding),
    key: fs.readFileSync(path.join(root, "key.pem")),
    cert: fs.readFileSync(path.join(root, "cert.pem")),
  });
  const addresses = {};
  for (const name of actors) {
    await actor(name, "account-create");
    await actor(name, "scan");
    await actor(name, "wallet-rebuild");
    addresses[name] = (await actor(name, "address")).address;
    assert.equal((await actor(name, "notes")).notes.length, 0);
  }
  assert.equal(new Set(Object.values(addresses)).size, actors.length);
  const shield = await actor("alice", "shield", { amount: inputs.variant === "wide-retained" ? "30000000000000000" : "1000000000000000" });
  const shieldHash = shield.outcome.hash ?? shield.outcome.transactionHash;
  assert.match(shieldHash, /^0x[0-9a-f]{64}$/);
  await chain.mine();
  const history = await actor("alice", "shield-history");
  assert.ok(
    history.records.some(
      (row) => row.transactionHash === shieldHash && !row.resolved,
    ),
  );
  server.setReadDelay(2000);
  try {
    await actor("alice", "shield-resolve", { transactionHash: shieldHash });
  } finally {
    server.setReadDelay(0);
  }
  const recovery = results.at(-1).result;
  assert.ok(recovery.networkMethods.length * 2000 > 30000);
  assert.ok(recovery.elapsedMs > 30000);
  assert.ok(
    recovery.networkMethods.every((method) =>
      recovery.disclosedShieldRequests.includes(method),
    ),
  );
  assert.ok(!recovery.networkMethods.includes("eth_sendRawTransaction"));
  assert.ok(
    (await actor("alice", "shield-history")).records.some(
      (row) => row.transactionHash === shieldHash && row.resolved,
    ),
  );
  await actor("alice", "scan");
  await actor("alice", "wallet-sync");
  const notes = (await actor("alice", "notes")).notes.filter(
    (n) => n.spentTxid === false,
  );
  assert.equal(notes.length, 1);
  let transfer;
  if (inputs.variant === "retained-unknown") {
    const crashed = await actor("alice", "pay-note", {
      noteId: notes[0].id,
      recipient: addresses.bob,
      fixtureCrash: "after-prepared",
    });
    assert.equal(crashed.expectedCrash, true);
    const retained = (await actor("alice", "holds")).records;
    assert.equal(retained.length, 1);
    assert.equal(retained[0].localState, "proof-present");
    const unsent = await actor("alice", "observe", {
      holdId: retained[0].holdId,
    });
    assert.equal(unsent.status, "unjournaled");
    assert.equal(chain.state().transactions.length, 1);
    await actor("alice", "pay-note", {
      noteId: notes[0].id,
      recipient: addresses.bob,
      expectedRefusal: "RAILGUN_KOHAKU_PRIVATE_ADAPTER_REFUSED",
    });
    server.dropNextSendResponse();
    transfer = await actor("alice", "submit-stored", {
      holdId: retained[0].holdId,
    });
    assert.equal(transfer.outcome.submissionStatus, "unknown");
    assert.equal(server.counts.lostSendResponses, 1);
    await actor("alice", "submit-stored", {
      holdId: retained[0].holdId,
      expectedOutcome: { status: "recovery-required", stage: "prior-attempt" },
    });
  } else {
    transfer = await actor("alice", "pay-note", {
      noteId: notes[0].id,
      recipient: addresses.bob,
    });
  }
  await chain.mine();
  const holds = (await actor("alice", "holds")).records;
  assert.equal(holds.length, 1);
  const transferHash =
    transfer.outcome.hash ?? transfer.outcome.transactionHash;
  const observedTransfer = await actor("alice", "observe", {
    holdId: holds[0].holdId,
  });
  assert.equal(observedTransfer.status, "journaled");
  assert.equal(observedTransfer.transactionHash, transferHash);
  assert.equal(observedTransfer.observation.status, "included");
  assert.equal(observedTransfer.transact.status, "matched");
  assert.equal(observedTransfer.output.kind, "shielded");
  const resolvedTransfer = await actor("alice", "resolve", {
    holdId: holds[0].holdId,
  });
  assert.equal(resolvedTransfer.status, "resolved");
  assert.equal(resolvedTransfer.transactionHash, transferHash);
  assert.equal(resolvedTransfer.outcome, "matched");
  assert.deepEqual(resolvedTransfer.output, observedTransfer.output);
  assert.ok(
    resolvedTransfer.finalizedBlockNumber >=
      observedTransfer.observation.blockNumber,
  );
  await actor("alice", "scan");
  await actor("alice", "wallet-sync");
  await actor("alice", "txid-sync");
  const prepared = await actor("alice", "poi-prepare-shield", {
    holdId: holds[0].holdId,
  });
  assert.equal(prepared.status, "prepared");
  await actor("alice", "poi-submit", { capsuleDigest: prepared.capsuleDigest });
  for (const name of actors.filter((name) => name !== "alice")) {
    await actor(name, "scan");
    await actor(name, "wallet-sync");
  }
  const bobNotes = (await actor("bob", "notes")).notes.filter(
    (n) => n.spentTxid === false,
  );
  assert.equal(bobNotes.length, 1);
  assert.equal(bobNotes[0].amount, notes[0].amount);
  if (actors.includes("charlie")) assert.equal(
    (await actor("charlie", "notes")).notes.filter((n) => n.spentTxid === false)
      .length,
    0,
  );
  assert.equal(
    (await actor("alice", "notes")).notes.filter((n) => n.spentTxid === false)
      .length,
    0,
  );
  const status = await actor("bob", "poi-status", { noteId: bobNotes[0].id });
  assert.deepEqual(status.statuses, ["Valid"]);
  await actor("bob", "txid-sync");
  let unshield;
  if (inputs.variant === "wide-retained") {
    const crashed = await actor("bob", "unshield-note", {
      noteId: bobNotes[0].id, recipient: funding.bob, fixtureCrash: "after-prepared",
    });
    assert.equal(crashed.expectedCrash, true);
    const retained = (await actor("bob", "holds", {maxOperationAmount: "1"})).records;
    assert.equal(retained.length, 1);
    assert.equal(retained[0].localState, "proof-present");
    const holdId = retained[0].holdId;
    assert.equal((await actor("bob", "observe", {holdId, maxOperationAmount: "1"})).status, "unjournaled");
    assert.deepEqual((await actor("bob", "notes", {maxOperationAmount: "1"})).notes, bobNotes);
    assert.deepEqual((await actor("bob", "poi-status", {noteId: bobNotes[0].id, maxOperationAmount: "1"})).statuses, ["Valid"]);
    await actor("bob", "submit-stored", {holdId, maxOperationAmount: "1",
      expectedOutcome: {status: "recovery-required", stage: "history"}});
    assert.equal(chain.state().transactions.length, 2);
    assert.deepEqual((await actor("bob", "holds")).records, retained);
    unshield = await actor("bob", "submit-stored", {holdId});
    write("WIDE-POLICY.json", {gross: "30000000000000000", ceiling: "50000000000000000",
      loweredCeiling: "1", retainedRead: true, observation: true, poiStatus: true,
      loweredSubmissionRefused: true, noRebuildForPolicyChange: true, sameHold: true,
      restoredSubmission: true, chainTransactions: chain.state().transactions.length});
  } else if (inputs.variant === "retained-upgrade") {
    const crashed = await actor("bob", "unshield-note", {
      noteId: bobNotes[0].id, recipient: funding.bob, fixtureCrash: "after-prepared",
    });
    assert.equal(crashed.expectedCrash, true);
    const retained = (await actor("bob", "holds")).records;
    assert.equal(retained.length, 1);
    assert.equal(retained[0].localState, "proof-present");
    const holdId = retained[0].holdId;
    assert.equal((await actor("bob", "observe", { holdId })).status, "unjournaled");
    const oldDelay = server.armColdSourceDelay();
    await actor("bob", "submit-stored", {
      holdId,
      expectedOutcome: { status: "recovery-required", stage: "source",
        sourceOutcome: { fatal: false, reason: "expired", rpcFailure: null } },
    });
    server.clearColdSourceDelay();
    assert.ok(oldDelay.requests > 0);
    assert.equal(chain.state().transactions.length, 2);
    assert.equal((await actor("bob", "observe", { holdId })).status, "unjournaled");
    fs.renameSync(path.join(root, "example"), path.join(root, "retired-example"));
    fs.cpSync(path.join(repo, "examples/reference-wallet"), path.join(root, "example"), {
      recursive: true, filter: (filename) => !filename.split(path.sep).includes("node_modules"),
    });
    // Preserve the old install. Only the normal public new-generation and
    // wallet rebuild APIs admit the new policy; custody is never copied/edited.
    fs.renameSync(installed, path.join(root, "retired-package"));
    fs.mkdirSync(installed);
    execFileSync("tar", ["-xzf", path.join(root, packed.filename), "-C", installed, "--strip-components=1"]);
    const original = fs.readFileSync(path.join(installed, TARGET));
    const transformed = transformTestList(original);
    fs.writeFileSync(path.join(installed, TARGET), transformed);
    const upgradeTransform = { target: TARGET, before: hash(original), after: hash(transformed) };
    await actor("bob", "account-info", { expectedRefusal: "RAILGUN_ACCOUNT_PUBLIC_REFUSED" });
    for (const name of ["bob"]) {
      await actor(name, "scan-new");
      await actor(name, "wallet-rebuild");
      await actor(name, "txid-sync");
    }
    const same = (await actor("bob", "holds")).records;
    assert.deepEqual(same, retained);
    assert.equal((await actor("bob", "observe", { holdId })).status, "unjournaled");
    const delay = server.armColdSourceDelay();
    unshield = await actor("bob", "submit-stored", { holdId });
    server.clearColdSourceDelay();
    assert.equal(delay.passes, 4);
    assert.ok(delay.requests > 0);
    write("RETAINED-UPGRADE.json", { previousTarSha256: hash(fs.readFileSync(previousTar)),
      currentTarSha256: installation.tarSha256, oldDelay, delay, sameHold: true,
      policyRebuild: true, transactionsBeforeSubmit: 2, upgradeTransform,
      reviewTimings: results.at(-1).result.reviewTimings,
      timingScope: "Wire final-pass start and observed review times; not an owner-internal timestamp" });
  } else {
    unshield = await actor("bob", "unshield-note", {
      noteId: bobNotes[0].id, recipient: funding.bob,
    });
  }
  await chain.mine();
  const bobHolds = (await actor("bob", "holds")).records;
  assert.equal(bobHolds.length, 1);
  await actor("bob", "observe", { holdId: bobHolds[0].holdId });
  const resolution = await actor("bob", "resolve", {
    holdId: bobHolds[0].holdId,
  });
  assert.equal(resolution.outcome, "matched");
  assert.equal(
    BigInt(resolution.output.received) + BigInt(resolution.output.fee),
    BigInt(notes[0].amount),
  );
  await actor("bob", "scan");
  await actor("bob", "wallet-sync");
  assert.equal(
    (await actor("bob", "notes")).notes.filter((n) => n.spentTxid === false)
      .length,
    0,
  );
  const receipts = [];
  for (const [index, transaction] of chain.state().transactions.entries())
    receipts.push(
      await actor(index === 2 ? "bob" : "alice", "receipt", {
        transactionHash: transaction.hash,
      }),
    );
  assert.ok(
    receipts.every(
      (receipt) =>
        receipt.receiptStatus === "0x1" && receipt.withinCurrentGasPolicy,
    ),
  );
  await actor("alice", "receipt", {
    transactionHash: chain.state().transactions[2].hash,
    expectedRefusal: "REFERENCE_RECEIPT_REFUSED",
  });
  // Mutations apply only to this extracted disposable install, never repository
  // source. Each subsequent command is a fresh real Electron owner process.
  const compatibility = [];
  for (const [scope, name, reusable] of inputs.variant === "retained-upgrade" ? [] : [
    ["host", "review.cjs", true],
    ["package", "src/data/railgun-poi-submit-data.js", true],
    ["package", "src/owners/railgun-event-projector.js", false],
    ["host", "host/vault.cjs", false],
  ]) {
    const file = path.join(
      scope === "host" ? path.join(root, "example") : installed,
      name,
    );
    const original = fs.readFileSync(file);
    const changed = Buffer.concat([
      original,
      Buffer.from("\n// Synthetic compatibility byte control.\n"),
    ]);
    fs.writeFileSync(file, changed);
    try {
      if (reusable) {
        assert.equal(
          (await actor("alice", "notes")).notes.filter(
            (n) => n.spentTxid === false,
          ).length,
          0,
        );
        assert.equal((await actor("alice", "scan")).status, "complete");
        await actor("alice", "wallet-sync");
        await actor("alice", "txid-sync");
      } else {
        await actor("alice", "account-info", {
          expectedRefusal: "RAILGUN_ACCOUNT_PUBLIC_REFUSED",
        });
        await actor("alice", "account-info", {
          cache: "pending",
          expectedRefusal: "RAILGUN_PUBLIC_CATALOG_REFUSED",
        });
      }
      compatibility.push({
        scope,
        file: name,
        reusable,
        beforeSha256: hash(original),
        afterSha256: hash(changed),
      });
    } finally {
      fs.writeFileSync(file, original);
    }
    // Restoring the original bytes restores access to the same custody/cache;
    // the refused controls never rebuild or alter source-policy state.
    await actor("alice", "notes");
  }
  write("CACHE-COMPATIBILITY.json", compatibility);
  chain.assertClean();
  assert.equal(chain.state().transactions.length, 3);
  assert.ok(chain.report().poiVerification.verified >= 1);
  assert.equal(
    server.methods.filter((method) => method === "eth_sendRawTransaction")
      .length,
    3,
  );
  return {
    passed: true,
    variant: inputs.variant ?? "acknowledged",
    installation,
    broadcastRequests: 3,
    shieldRecoveryElapsedMs: recovery.elapsedMs,
    independentActors: actors.length,
    transactions: 3,
    transfer,
    unshield,
    conservation: true,
    actualGasFee: receipts
      .reduce((sum, receipt) => sum + BigInt(receipt.gasFee), 0n)
      .toString(),
    poiVerification: chain.report().poiVerification,
    limits: [
      "synthetic chain and list; no EVM execution",
      "real current-circuit POI verification",
      "loopback SOCKS/TLS, not Tor",
      "fresh processes and random independent vaults",
      ...(inputs.variant === "retained-upgrade" ? ["two-actor migration only; unrelated Charlie and cache controls stay in other variants"] : []),
      "installed package with recorded test-list transform",
    ],
  };
}
main()
  .then(
    (result) => {
      write("RESULT.json", result);
      process.stdout.write(
        JSON.stringify({ stage: "journey-passed", root }) + "\n",
      );
    },
    (error) => {
      write("FAILURE.json", { error: error.message, stack: error.stack });
      process.stderr.write(error.stack + "\n");
      process.exitCode = 1;
    },
  )
  .finally(async () => {
    if (chain) {
      write("CHAIN.json", chain.state());
      write("SERVICE.json", chain.report());
    }
    if (server) {
      write("NETWORK.json", server.counts);
      await server.close();
    }
    if (worker) await worker.close();
  });
