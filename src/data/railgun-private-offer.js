/** Structural offer data only; no owned-note selection or authorization. */
const assert = require('assert/strict');
const { validateRailgunPrivateSigningIntent } = require('./railgun-private-intent');
const pins = require('../railgun-shield-pins.json');
const shape = (v, keys) => {
  assert.ok(v && typeof v === 'object' && !Array.isArray(v));
  assert.deepEqual(Object.keys(v).sort(), [...keys].sort());
};
function amount(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^[1-9][0-9]{0,16}$/);
  assert.ok(BigInt(value) <= BigInt(pins.maxQualificationAmount));
}
// Structural broker data only. Ownership/value must still be checked against
// the main-captured note before this offer can reach a spending-key gate.
// Amount arithmetic does not authenticate the encrypted change commitment.
function normalizeRailgunPrivateOffer(value, selection) {
  const partial = selection?.kind === 'railgun-partial-unshield';
  if (partial) shape(selection, ['kind', 'tree', 'position', 'recipient', 'unshieldAmount']);
  shape(value, [
    'transaction',
    'expected',
    'expectedHash',
    'recipient',
    ...(partial ? ['inputAmount', 'unshieldAmount', 'changeAmount'] : ['amount']),
  ]);
  const checked = validateRailgunPrivateSigningIntent(value.transaction, value.expected);
  assert.equal(checked.kind, selection.kind);
  assert.equal(checked.tree, selection.tree);
  assert.equal(value.recipient, selection.recipient);
  if (partial) {
    for (const key of ['inputAmount', 'unshieldAmount', 'changeAmount']) amount(value[key]);
    assert.ok(BigInt(value.unshieldAmount) < BigInt(value.inputAmount));
    assert.equal(
      BigInt(value.changeAmount),
      BigInt(value.inputAmount) - BigInt(value.unshieldAmount)
    );
    assert.equal(checked.recipient, value.recipient);
    assert.equal(checked.unshieldAmount, value.unshieldAmount);
    assert.equal(selection.unshieldAmount, value.unshieldAmount);
  } else amount(value.amount);
  if (checked.kind === 'railgun-token-unshield') {
    assert.equal(checked.recipient, value.recipient);
    assert.equal(checked.amount, value.amount);
  }
  assert.match(value.expectedHash, /^0x[0-9a-f]{64}$/);
  assert.ok(
    BigInt(value.expectedHash) <
      21888242871839275222246405745257275088548364400416034343698204186575808495617n
  );
  return Object.freeze({
    transaction: Object.freeze({ ...value.transaction }),
    expected: Object.freeze({ ...value.expected }),
    expectedHash: value.expectedHash,
    transactionDigest: checked.digest,
    recipient: value.recipient,
    ...(partial
      ? {
          inputAmount: value.inputAmount,
          unshieldAmount: value.unshieldAmount,
          changeAmount: value.changeAmount,
        }
      : { amount: value.amount }),
  });
}
module.exports = { normalizeRailgunPrivateOffer };
