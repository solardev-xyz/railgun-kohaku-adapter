const { undoRetainedHelpers } = require("./retained-helper-transitions.cjs");
"use strict";
const { createHash } = require("node:crypto");
const { Interface } = require("ethers");
const retained = require("../src/data/railgun-retained-private-data");
const host = require("../host-data.cjs");
const safe = require("../data.cjs");
const { LEGACY_MAX, NOTE_MAX } = require("../src/amount-bounds");
const { selectCapsuleFormat } = require("../src/operation-formats");
const { vectors } = require("./fixtures/private-capsule-vectors.json");
const { createRailgunPartialCapsuleData, createRailgunLegacyCapsuleData } = require("./fixtures/railgun-partial-capsule-data");
const abi = new Interface([host.TRANSACT_ABI]);
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(kind, input, unshield = input) {
  const value = kind === "railgun-partial-unshield"
    ? createRailgunPartialCapsuleData({ inputAmount: String(input), unshieldAmount: String(unshield) }).capsule
    : createRailgunLegacyCapsuleData(kind).capsule;
  if (kind !== "railgun-partial-unshield") value.preparation.amount = String(input);
  if (kind === "railgun-token-unshield") {
    value.preparation.expected.amount = String(input);
    const tx = abi.decodeFunctionData("transact", value.preparation.transaction.data)[0][0].toArray(true);
    tx[5][2] = input;
    value.preparation.transaction.data = abi.encodeFunctionData("transact", [[tx]]);
  }
  value.version = selectCapsuleFormat(kind, String(input)).version;
  return value;
}

test.each(vectors)("retained reader preserves historical $name bytes and digest", v => {
  expect(JSON.stringify(retained.normalizeRailgunPrivateCapsule(v.input))).toBe(v.canonical);
  expect(retained.digestRailgunPrivateCapsule(v.input)).toBe(v.digest);
});

test.each(["railgun-private-transfer", "railgun-token-unshield", "railgun-partial-unshield"])(
  "%s structural formats admit uint120 amounts without widening legacy APIs", kind => {
    for (const amount of [LEGACY_MAX + 1n, NOTE_MAX]) {
      const input = fixture(kind, amount, amount - 1n);
      const checked = retained.normalizeRailgunPrivateCapsule(input);
      expect(checked.version).toBe(kind === "railgun-partial-unshield" ? 4 : 3);
      expect(Object.isFrozen(checked.preparation.expected)).toBe(true);
      expect(retained.digestRailgunPrivateCapsule(input)).toBe(createHash("sha256")
        .update(`freedom:railgun:private-capsule-v${checked.version}\0`)
        .update(JSON.stringify(checked)).digest("hex"));
      for (const api of [host, safe]) {
        expect(() => api.normalizeRailgunPrivateCapsule(input)).toThrow();
        expect(() => api.digestRailgunPrivateCapsule(input)).toThrow();
      }
      expect(() => host.normalizeRailgunPrivateOffer(input.preparation, input.selection)).toThrow();
      const legacyVersion = { ...input, version: kind === "railgun-partial-unshield" ? 2 : 1 };
      expect(() => retained.normalizeRailgunPrivateCapsule(legacyVersion)).toThrow();
      expect(() => host.normalizeRailgunPrivateCapsule(legacyVersion)).toThrow();
    }
  });

test("wide private input does not force a wide public unshield value", () => {
  const input = fixture("railgun-partial-unshield", NOTE_MAX, 1n);
  const checked = retained.normalizeRailgunPrivateCapsule(input);
  expect(checked.version).toBe(4);
  expect(checked.preparation.unshieldAmount).toBe("1");
  expect(checked.preparation.changeAmount).toBe(String(NOTE_MAX - 1n));
});

test.each(["railgun-private-transfer", "railgun-token-unshield", "railgun-partial-unshield"])(
  "%s refuses unnecessary new versions and malformed retained records", kind => {
    const input = fixture(kind, 1000n, 400n);
    input.version += 2;
    expect(() => retained.normalizeRailgunPrivateCapsule(input)).toThrow();
    const wide = fixture(kind, NOTE_MAX, 1n);
    for (const mutate of [
      v => { v.version = 5; },
      v => { v.extra = true; },
      v => { v.preparation[kind === "railgun-partial-unshield" ? "inputAmount" : "amount"] = String(NOTE_MAX + 1n); },
      v => { v.preparation.transaction.chainId = 1; },
      v => { v.selection.recipient = "0x" + "11".repeat(20); },
      v => { v.preparation.transaction.data += "00"; },
    ]) {
      const changed = clone(wide); mutate(changed);
      expect(() => retained.normalizeRailgunPrivateCapsule(changed)).toThrow();
    }
  });

test("proved matcher preserves exact intent and only permits proof-coordinate changes", () => {
  const value = fixture("railgun-token-unshield", NOTE_MAX);
  const { transaction, expected } = value.preparation;
  const tx = abi.decodeFunctionData("transact", transaction.data)[0][0].toArray(true);
  tx[0] = [[1n, 2n], [[3n, 4n], [5n, 6n]], [7n, 8n]];
  const proved = { ...transaction, data: abi.encodeFunctionData("transact", [[tx]]) };
  const checked = retained.matchRailgunPrivateProvedTransaction(transaction, proved, expected);
  for (const key of ["proofVerified", "recipientVerified", "reservationsChecked", "spendingEnabled"])
    expect(checked[key]).toBe(false);
  expect(() => retained.validateRailgunPrivateSigningIntent(proved, expected)).toThrow();
  tx[5][2] -= 1n;
  expect(() => retained.matchRailgunPrivateProvedTransaction(transaction,
    { ...proved, data: abi.encodeFunctionData("transact", [[tx]]) }, expected)).toThrow();
});

test("genuine pre-wide reader refuses new formats and retains its historical bytes", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  const provenance = require("./fixtures/legacy-private-formats/PROVENANCE.json");
  const old = require("./fixtures/legacy-private-formats/railgun-private-capsule");
  const transitions = require("../docs/owners/OPERATION-FORMATS-TRANSITIONS.json");
  for (const row of provenance.files) {
    let text = readFileSync(path.join(__dirname, "fixtures/legacy-private-formats", row.file), "utf8");
    for (const relocation of [...row.relocations].reverse()) {
      expect(text).toContain(relocation.to);
      text = text.replaceAll(relocation.to, relocation.from);
    }
    expect(createHash("sha256").update(text).digest("hex")).toBe(row.originalSha256);
    expect(row.originalSha256).toBe(transitions.changes.find(c => c.file === "src/data/" + row.file).beforeSha256);
  }
  for (const v of vectors) expect(old.digestRailgunPrivateCapsule(v.input)).toBe(v.digest);
  for (const kind of ["railgun-private-transfer", "railgun-token-unshield", "railgun-partial-unshield"]) {
    const value = retained.normalizeRailgunPrivateCapsule(fixture(kind, NOTE_MAX, 1n));
    expect(() => old.normalizeRailgunPrivateCapsule(value)).toThrow();
    expect(() => old.digestRailgunPrivateCapsule(value)).toThrow();
    expect(() => old.normalizeRailgunPrivateCapsule({ ...value, version: kind === "railgun-partial-unshield" ? 2 : 1 })).toThrow();
  }
});

test("new structural sources are explicit provenance and remain private package implementation", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  const transitions = require("../docs/owners/OPERATION-FORMATS-TRANSITIONS.json");
  for (const row of transitions.addedSources)
    expect(createHash("sha256").update(undoRetainedHelpers(readFileSync(path.join(__dirname, "..", row.file), "utf8"), row.file)).digest("hex")).toBe(row.sha256);
  expect(() => require("@freedom/railgun-kohaku-adapter/src/data/railgun-retained-private-data")).toThrow();
  expect(Object.keys(safe)).toHaveLength(3);
  expect(Object.keys(host)).toHaveLength(22);
});


test("legacy offer amount errors retain their assertion class and fields", () => {
  const old = require("./fixtures/legacy-private-formats/railgun-private-offer");
  for (const amount of ["0", "01", "1e3", String(LEGACY_MAX + 1n), 1000, null]) {
    const value = fixture("railgun-private-transfer", 1000n);
    value.preparation.amount = amount;
    const errors = [old, host].map(api => {
      try { api.normalizeRailgunPrivateOffer(value.preparation, value.selection); }
      catch (error) { return error; }
      throw Error("expected refusal");
    });
    expect(errors[1].name).toBe(errors[0].name);
    expect(errors[1].code).toBe(errors[0].code);
    expect(errors[1].operator).toBe(errors[0].operator);
    expect(errors[1].actual).toEqual(errors[0].actual);
    expect(errors[1].expected).toEqual(errors[0].expected);
  }
});
