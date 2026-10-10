"use strict";
// Format/resource bounds only. No captured application policy belongs here:
// lowering a spending ceiling must not change the meaning of retained records.
const LEGACY_MAX = BigInt(require("./railgun-shield-pins.json").maxQualificationAmount);
const NOTE_MAX = (1n << 120n) - 1n;
// Relay qualification remains independent of direct-operation amount policy.
const RELAY_FEE_MAX = 10000000000000000n;
const RELAY_INPUT_MAX = 10000000000000000n;
function parseAmount(value, maximum, allowZero = false) {
  if (typeof value !== "string" || typeof maximum !== "bigint" ||
      maximum <= 0n || maximum > NOTE_MAX || typeof allowZero !== "boolean" ||
      !(allowZero ? /^(?:0|[1-9][0-9]{0,36})$/ : /^[1-9][0-9]{0,36}$/).test(value))
    throw refused();
  const amount = BigInt(value);
  if (amount > maximum) throw refused();
  return amount;
}
function refused() {
  return Object.assign(Error("Railgun amount format unavailable"), {
    code: "RAILGUN_AMOUNT_FORMAT_REFUSED",
  });
}
module.exports = Object.freeze({ LEGACY_MAX, NOTE_MAX, RELAY_FEE_MAX, RELAY_INPUT_MAX, parseAmount });
