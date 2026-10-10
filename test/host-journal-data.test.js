const deploymentTransitions = require("../docs/owners/DEPLOYMENT-TRANSITIONS.json");
const sourceSha = value => createHash("sha256").update(value).digest("hex");
const {
  validRailgunTransactResolution: valid,
  freezeRailgunTransactResolution: freeze,
} = require("../host-journal-data.cjs");
const { railgunTransactJournalIntent } = require("../host-journal-data.cjs");
const { fixture } = require("./fixtures/railgun-journal-transact-data");
const pins = require("../src/railgun-shield-pins.json");
function sample(unshield = false) {
  const intent = railgunTransactJournalIntent(fixture(unshield).transaction());
  const record = {
    hash: "0x" + "a".repeat(64),
    intent,
    observation: {
      status: "included",
      blockNumber: 16,
      blockHash: "0x" + "b".repeat(64),
    },
  };
  const value = {
    outcome: "matched",
    finalizedBlockNumber: 16,
    finalizedBlockHash: record.observation.blockHash,
    transact: {
      status: "matched",
      transactionHash: record.hash,
      blockHash: record.observation.blockHash,
      blockNumber: "0x10",
      operation: intent.operation,
      inputTree: intent.tree,
      nullifier: intent.nullifier,
      commitment: intent.commitment,
      boundParamsHash: intent.boundParamsHash,
      intentDigest: intent.intentDigest,
      nullifiedLogIndex: "0x5",
      trust: "unverified-rpc",
      spendingEnabled: false,
      output: unshield
        ? {
            kind: "unshield",
            logIndex: "0x8",
            recipient: intent.recipient,
            token: pins.wrappedNative,
            amount: intent.amount,
            received: "998",
            fee: "2",
            feeDeviation: false,
          }
        : { kind: "shielded", tree: 1, position: 123, logIndex: "0x8" },
    },
  };
  return { record, value };
}
const { createHash } = require("crypto");
const { execFileSync } = require("child_process");
const path = require("path");
const data = require("../host-journal-data.cjs");
const prepared = require("./fixtures/railgun-journal-shield-prepared.json");
const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

test.each([
  [
    false,
    "7c455e7b710f8bd655034746883617c2ebc81c1f0023174926133c6d788d7bd2",
    "f1594ef2c96fc2ac1a342e1d040c90ad7c7fbf29cc3cb4a598ef6b7b4d289709",
  ],
  [
    true,
    "c75ff187f729679c8a581fc62a1417cface46de43e1674510e0a0a75e54e05e9",
    "0f9985fa90618d93d20100ff9256706b2bb9843934ae209628646c540295d86b",
  ],
])(
  "preserves original %s journal and resolution golden transcripts",
  (unshield, intent, resolution) => {
    const { record, value } = sample(unshield);
    expect(sha(record.intent)).toBe(intent);
    expect(data.validRailgunTransactIntent(record.intent)).toBe(true);
    expect(valid(value, record)).toBe(true);
    expect(freeze(value)).toBe(value);
    expect(sha(value)).toBe(resolution);
    expect(Object.isFrozen(value.transact.output)).toBe(true);
    expect(valid({ ...value, finalizedBlockNumber: 0 }, record)).toBe(false);
    expect(
      valid(
        { ...value, transact: { ...value.transact, spendingEnabled: true } },
        record,
      ),
    ).toBe(false);
  },
);

test("retains qualified public Shield calldata binding and in-place outcome freeze", () => {
  const binding = data.shieldIntentBinding({
    chainId: pins.chainId,
    ...prepared,
  });
  expect(binding).toEqual({
    npk: prepared.npk,
    token: pins.wrappedNative,
    amount: prepared.value,
    noteValue: prepared.noteValue,
  });
  const intent = {
    kind: "railgun-native-shield",
    digest: "0x" + "1".repeat(64),
    ...binding,
  };
  expect(data.validShieldIntent(intent)).toBe(true);
  expect(data.validShieldIntent({ ...intent, amount: "0" })).toBe(false);
  const record = {
    hash: "0x" + "a".repeat(64),
    intent,
    observation: {
      status: "included",
      blockNumber: 16,
      blockHash: "0x" + "b".repeat(64),
    },
  };
  const value = {
    outcome: "matched",
    finalizedBlockNumber: 16,
    finalizedBlockHash: record.observation.blockHash,
    shield: {
      status: "matched",
      transactionHash: record.hash,
      blockHash: record.observation.blockHash,
      blockNumber: "0x10",
      logIndex: "0x1",
      tree: 0,
      position: 0,
      ...binding,
      fee: (BigInt(binding.amount) - BigInt(binding.noteValue)).toString(),
      feeDeviation: false,
      trust: "unverified-rpc",
      spendingEnabled: false,
    },
  };
  expect(data.validRailgunShieldResolution(value, record)).toBe(true);
  expect(data.freezeRailgunShieldResolution(value)).toBe(value);
  expect(Object.isFrozen(value.shield)).toBe(true);
  expect(
    data.validRailgunShieldResolution(
      { ...value, shield: { ...value.shield, spendingEnabled: true } },
      record,
    ),
  ).toBe(false);
  for (const to of [pins.proxy, pins.implementation, pins.relayAdapt])
    expect(data.isRailgunTarget(to)).toBe(true);
  expect(data.isRailgunTarget(pins.wrappedNative)).toBe(false);
});

test("does not wrap original refusals or normalize malformed inputs", () => {
  expect(() => data.railgunTransactJournalIntent({ data: "0x" })).toThrow(
    expect.objectContaining({ code: "RAILGUN_TRANSACT_INTENT_REFUSED" }),
  );
  expect(() => data.shieldIntentBinding({ data: 1 })).toThrow(
    "Invalid shield intent",
  );
  expect(() => data.freezeRailgunTransactResolution(null)).toThrow(TypeError);
  expect(() => data.freezeRailgunShieldResolution(null)).toThrow(TypeError);
  expect(data.validShieldIntent(null)).toBeNull();
  expect(data.validRailgunTransactIntent(null)).toBe(false);
});

test("CJS and ESM consumers use the same nine functions without initializing owners", () => {
  const stdout = execFileSync(
    process.execPath,
    [path.join(__dirname, "consumer/journal-data.cjs")],
    { encoding: "utf8", timeout: 15000 },
  );
  expect(JSON.parse(stdout)).toEqual({
    exports: 9,
    bootstrapInitialized: false,
  });
});

test("partial v2 journal and nested freeze preserve the original shapes", () => {
  const {
    createRailgunPartialCapsuleData,
  } = require("./fixtures/railgun-partial-capsule-data");
  const tx = createRailgunPartialCapsuleData().capsule.preparation.transaction;
  const intent = data.railgunTransactJournalIntent({
    ...tx,
    from: "0x" + "34".repeat(20),
  });
  expect(intent).toMatchObject({
    version: 2,
    operation: "railgun-partial-unshield",
    unshieldAmount: "400",
  });
  expect(data.validRailgunTransactIntent(intent)).toBe(true);
  expect(data.validRailgunTransactIntent({ ...intent, version: 1 })).toBe(
    false,
  );
  const value = {
    transact: { version: 2, output: { change: {}, unshield: {} } },
  };
  expect(data.freezeRailgunTransactResolution(value)).toBe(value);
  for (const object of [
    value,
    value.transact,
    value.transact.output,
    value.transact.output.change,
    value.transact.output.unshield,
  ])
    expect(Object.isFrozen(object)).toBe(true);
});

test("retains the source fixture bytes apart from the two declared import rewrites", () => {
  const fs = require("fs");
  const provenance = require("./fixtures/journal-data-provenance.json");
  const restored = fs
    .readFileSync(
      path.join(__dirname, "fixtures/railgun-journal-transact-data.js"),
      "utf8",
    )
    .replace(
      "../../src/data/railgun-private-policy",
      "../../src/main/wallet/railgun-private-policy",
    )
    .replace(
      "../../src/railgun-shield-pins.json",
      "../../src/main/wallet/railgun-shield-pins.json",
    );
  const source = provenance.sources.find(
    (row) => row.path === "scripts/fixtures/railgun-transact-data.js",
  );
  expect(createHash("sha256").update(restored).digest("hex")).toBe(
    source.sha256,
  );
});

test("reconstructs the committed canonical data algorithms through the reviewed deployment transition", () => {
  const fs = require("fs");
  const {
    canonicalModules,
  } = require("./fixtures/journal-data-provenance.json");
  for (const [filename, hash] of Object.entries(canonicalModules)) {
    expect(
      createHash("sha256")
        .update(undoDeployment(fs.readFileSync(path.join(__dirname, "..", filename), "utf8"), filename))
        .digest("hex"),
    ).toBe(hash);
  }
});

function undoDeployment(text, file) {
  const change = deploymentTransitions.changes.find((row) => row.file === file);
  if (!change) return text;
  expect(sourceSha(text)).toBe(change.afterSha256);
  for (const edit of [...change.replacements].reverse()) {
    expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
    text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
  }
  expect(sourceSha(text)).toBe(change.beforeSha256);
  return text;
}
