"use strict";
const { createHash } = require("node:crypto");
const retained = require("../src/data/railgun-retained-private-data");
const host = require("../host-data.cjs");
const poi = require("../host-poi.cjs");
const { NOTE_MAX } = require("../src/amount-bounds");
const { poiTransactSelectorDomain } = require("../src/operation-formats");
const { widePrivateFixture } = require("./fixtures/wide-private-capsule-data");
const pins = require("../src/railgun-shield-pins.json");
const hex = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
const kinds = ["railgun-private-transfer", "railgun-token-unshield", "railgun-partial-unshield"];

test.each(kinds)("retained %s preparation uses format bounds while the public host stays legacy", kind => {
  const f = widePrivateFixture(kind);
  expect(retained).not.toHaveProperty("selectRailgunPrivatePreparation");
  const result = retained.normalizeRailgunPrivatePreparation(f.capsule.preparation, { ...f.owned, selection: f.capsule.selection });
  for (const key of ["witnessRetained", "recipientVerified", "reservationsChecked", "poiVerified", "spendingEnabled"])
    expect(result[key]).toBe(false);
  expect(() => host.selectRailgunPrivatePreparation(f.owned, f.request)).toThrow();
  expect(() => host.normalizeRailgunPrivatePreparation(f.capsule.preparation, { ...f.owned, selection: f.capsule.selection })).toThrow();
  f.owned.read.received[0].spentTxid = "already-spent";
  expect(() => retained.normalizeRailgunPrivatePreparation(f.capsule.preparation, { ...f.owned, selection: f.capsule.selection })).toThrow();
});

test.each(kinds.flatMap(kind => ["Shield", "Transact"].map(origin => [kind, origin])))(
  "%s recovery from %s keeps the original signed root and exact value", (kind, origin) => {
    const f = widePrivateFixture(kind);
    f.owned.ownedPoi[0].type = origin;
    const input = { capsule: f.capsule, signature: { R8: [hex(1), hex(2)], S: hex(3) },
      proverArchive: "/public-fixture/prover.asar", artifactDirectory: "/public-fixture/artifacts" };
    expect(retained.normalizeRailgunPrivateRecoveryInput(input, { walletId: f.capsule.walletId })).toEqual(input);
    expect(() => host.normalizeRailgunPrivateRecoveryInput(input, { walletId: f.capsule.walletId })).toThrow();
    f.inner.proof = { a: { x: 1, y: 2 }, b: { x: [3, 4], y: [5, 6] }, c: { x: 7, y: 8 } };
    const transaction = { ...f.capsule.preparation.transaction, data: f.encode() };
    const proof = { status: "proved", transaction, independentlyVerified: false,
      transactionDigest: retained.matchRailgunPrivateProvedTransaction(f.capsule.preparation.transaction,
        transaction, f.capsule.preparation.expected).digest };
    f.owned.trees[0].root = hex(999);
    const context = { ...f.owned, capsule: f.capsule, walletId: f.capsule.walletId };
    expect(retained.normalizeRailgunPrivateRecoveryResult(proof, context)).toEqual(proof);
    expect(() => host.normalizeRailgunPrivateRecoveryResult(proof, context)).toThrow();
    f.owned.read.received[0].amount -= 1n;
    expect(() => retained.normalizeRailgunPrivateRecoveryResult(proof, context)).toThrow();
  });

function creators(capsule) {
  const { tree, position } = capsule.selection;
  return {
    shield: { type: "Shield", tree, position, preimage: { npk: hex(7),
      token: { tokenType: 0, tokenAddress: pins.wrappedNative, tokenSubID: hex(0) },
      value: String(NOTE_MAX) }, ciphertext: { encryptedBundle: [hex(8), hex(9), hex(10)], shieldKey: hex(11) } },
    transact: { type: "Transact", tree, position, hash: capsule.noteHash,
      ciphertext: { ciphertext: [hex(7), hex(8), hex(9), hex(10)], blindedSenderViewingKey: hex(11),
        blindedReceiverViewingKey: hex(12), annotationData: "0x", memo: "0x" } },
  };
}

test.each(kinds)("%s POI helper binds wide custody without widening host/poi", kind => {
  const f = widePrivateFixture(kind), c = retained.normalizeRailgunPrivateCapsule(f.capsule);
  const partial = kind === "railgun-partial-unshield";
  const shape = retained.getRailgunOwnPoiShape(c);
  expect(shape.capsuleVersion).toBe(partial ? 4 : 3);
  expect(shape.selectorDomain).toBe(partial ? "freedom:railgun:own-selector-v2\0" : "freedom:railgun:own-selector-v1\0");
  expect(shape.outputCount).toBe(kind === "railgun-token-unshield" ? 0 : 1);
  const origins = creators(c);
  const shield = retained.normalizeRailgunPoiShieldInput(c, origins.shield);
  expect(shield.facts.value).toBe(String(NOTE_MAX));
  expect(shield.bindingDigest).toBe(createHash("sha256").update("freedom:railgun:poi-shield-selector-v1\0")
    .update(JSON.stringify({ capsule: c, creator: origins.shield })).digest("hex"));
  const descriptor = { walletId: c.walletId, instanceId: "0zk1" + "q".repeat(123), masterPublicKey: hex(3).slice(2),
    spendingPublicKey: [hex(4).slice(2), hex(5).slice(2)], viewingPublicKey: hex(6).slice(2), accountIndex: 0 };
  const input = { archive: "/public-fixture/engine.asar", descriptor, capsule: c, creator: origins.transact };
  const result = retained.prepareRailgunPoiTransactSelectorInput(input);
  expect(retained.normalizeRailgunPoiTransactSelectorInput(result)).toEqual(result);
  expect(result.bindingDigest).toBe(createHash("sha256").update(poiTransactSelectorDomain(c.version))
    .update(JSON.stringify({ descriptor, capsule: c, creator: origins.transact })).digest("hex"));
  expect(() => poi.getRailgunOwnPoiShape(c)).toThrow();
  expect(() => poi.normalizeRailgunPoiShieldInput(c, origins.shield)).toThrow();
  expect(() => poi.prepareRailgunPoiTransactSelectorInput(input)).toThrow();
  origins.shield.preimage.value = "1";
  expect(() => retained.normalizeRailgunPoiShieldInput(c, origins.shield)).toThrow();
  input.creator.hash = hex(999);
  expect(() => retained.prepareRailgunPoiTransactSelectorInput(input)).toThrow();
});

test("Transact membership selector domains form an explicit closed table", () => {
  expect([1, 2, 3, 4].map(poiTransactSelectorDomain)).toEqual([
    "freedom:railgun:poi-transact-selector-v1\0", "freedom:railgun:poi-transact-selector-v2\0",
    "freedom:railgun:poi-transact-selector-v3\0", "freedom:railgun:poi-transact-selector-v4\0",
  ]);
  for (const version of [0, 5, "3", null]) expect(() => poiTransactSelectorDomain(version)).toThrow();
});
