/** Public structural fixtures only; no owned note, valid proof or permission. */
const { createRailgunPartialCapsuleData, createRailgunLegacyCapsuleData } = require("./railgun-partial-capsule-data");
const { LEGACY_MAX, NOTE_MAX } = require("../../src/amount-bounds");
function widePrivateFixture(kind, amount = NOTE_MAX, unshield = 1n) {
  if (typeof amount !== "bigint" || amount <= LEGACY_MAX || amount > NOTE_MAX) throw Error("fixture amount");
  const partial = kind === "railgun-partial-unshield";
  const f = partial ? createRailgunPartialCapsuleData({ inputAmount: String(amount), unshieldAmount: String(unshield) }) : createRailgunLegacyCapsuleData(kind);
  f.capsule.version = partial ? 4 : 3;
  if (!partial) f.capsule.preparation.amount = String(amount);
  if (kind === "railgun-token-unshield") {
    f.inner.unshieldPreimage.value = String(amount);
    f.capsule.preparation.expected.amount = String(amount);
    f.capsule.preparation.transaction.data = f.encode();
  }
  f.owned.read.received[0].amount = amount;
  f.owned.read.received[0].hash = f.capsule.noteHash;
  Object.assign(f.owned.ownedPoi[0], { hash: f.capsule.noteHash, type: "Shield" });
  return f;
}
module.exports = { widePrivateFixture };
