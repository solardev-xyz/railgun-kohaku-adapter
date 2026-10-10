"use strict";
// Persisted format selection, independent of the current application's ceiling.
// These descriptors do not validate ownership or authorize a signature/send.
const { LEGACY_MAX, NOTE_MAX, parseAmount } = require("./amount-bounds");
const TRANSFER = "railgun-private-transfer";
const FULL = "railgun-token-unshield";
const PARTIAL = "railgun-partial-unshield";
const capsuleFormats = Object.freeze([null, ...[1, 2, 3, 4].map(version => Object.freeze({
  version,
  partial: version === 2 || version === 4,
  maximum: version < 3 ? LEGACY_MAX : NOTE_MAX,
  domain: `freedom:railgun:private-capsule-v${version}\0`,
}))]);
const journalFormats = Object.freeze([null, ...[1, 2, 3, 4].map(version => Object.freeze({
  version,
  versionField: version === 1 ? null : version,
  maximum: version < 3 ? LEGACY_MAX : NOTE_MAX,
  domain: version === 1 ? "railgun-transact" : `railgun-transact-v${version}`,
}))]);
const shieldFormats = Object.freeze([null, ...[1, 2].map(version => Object.freeze({
  version,
  versionField: version === 1 ? null : version,
  maximum: version === 1 ? LEGACY_MAX : NOTE_MAX,
}))]);
function refuse() {
  throw Object.assign(Error("Railgun operation format unavailable"), {
    code: "RAILGUN_OPERATION_FORMAT_REFUSED",
  });
}
function privateKind(kind) {
  if (![TRANSFER, FULL, PARTIAL].includes(kind)) refuse();
  return kind === PARTIAL;
}
function capsuleFormat(version) {
  if (!Number.isSafeInteger(version) || version < 1 || version > 4) refuse();
  return capsuleFormats[version];
}
function selectCapsuleFormat(kind, inputAmount) {
  const partial = privateKind(kind);
  const wide = parseAmount(inputAmount, NOTE_MAX) > LEGACY_MAX;
  return capsuleFormats[(partial ? 2 : 1) + (wide ? 2 : 0)];
}
function assertCapsuleFormat(version, kind, inputAmount) {
  const format = capsuleFormat(version);
  if (format !== selectCapsuleFormat(kind, inputAmount)) refuse();
  return format;
}
function selectTransactFormat(kind, publicAmount) {
  const partial = privateKind(kind);
  if (kind === TRANSFER) {
    // Calldata never reveals its private input amount. Do not add it to journals.
    if (publicAmount !== undefined) refuse();
    return journalFormats[1];
  }
  const wide = parseAmount(publicAmount, NOTE_MAX) > LEGACY_MAX;
  return journalFormats[(partial ? 2 : 1) + (wide ? 2 : 0)];
}
function selectShieldFormat(grossAmount) {
  return shieldFormats[parseAmount(grossAmount, NOTE_MAX) > LEGACY_MAX ? 2 : 1];
}
module.exports = Object.freeze({
  capsuleFormat,
  selectCapsuleFormat,
  assertCapsuleFormat,
  selectTransactFormat,
  selectShieldFormat,
});
