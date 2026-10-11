"use strict";
const { NOTE_MAX } = require("../amount-bounds");
const { isRailgunOperationAmount } = require("./application-policy");
const format = require("./railgun-shield-policy-core").createShieldPolicy(NOTE_MAX);
function shieldAmount(value) {
  const amount = format.shieldAmount(value);
  if (!isRailgunOperationAmount(amount)) throw Object.assign(new Error("Railgun native shield refused"), { code: "RAILGUN_SHIELD_REFUSED" });
  return amount;
}
function validateRailgunNativeShield(transaction, expected) {
  const checked = format.validateRailgunNativeShield(transaction, expected);
  shieldAmount(expected.amount);
  return checked;
}
module.exports = { SHIELD_ABI: format.SHIELD_ABI, shieldAmount, validateRailgunNativeShield };
