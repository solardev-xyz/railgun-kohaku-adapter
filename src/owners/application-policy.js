/** Trusted-main spending ceiling. This is application policy, not a Railgun rule.
 * Captured once before owners load; no per-operation ceiling override. */
'use strict';
const { isProxy } = require('util').types;
const { LEGACY_MAX, NOTE_MAX } = require('../amount-bounds');
const DEFAULT_MAX_GAS_FEE = 2000000000000000n;
// Sanity bound for this implementation, not a protocol limit or a recommended fee.
const MAX_APPLICATION_GAS_FEE = 1000000000000000000n;
const fail = () => Object.assign(new Error('Railgun application policy unavailable'), {
  code: 'RAILGUN_APPLICATION_POLICY_REFUSED',
});
let attempted = false;
let ceiling = DEFAULT_MAX_GAS_FEE;
let operationCeiling = LEGACY_MAX;
function captureRailgunApplicationPolicy(input) {
  if (attempted) throw fail();
  attempted = true;
  if (arguments.length === 0) return;
  if (arguments.length !== 1 || !input || typeof input !== 'object' || isProxy(input) ||
      Object.getPrototypeOf(input) !== Object.prototype) throw fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (!keys.length || keys.some(key => !['maxGasFee', 'maxOperationAmount'].includes(key))) throw fail();
  const read = (name, fallback, maximum) => {
    if (!Object.hasOwn(descriptors, name)) return fallback;
    const entry = descriptors[name];
    if (!entry.enumerable || !Object.hasOwn(entry, 'value') ||
        typeof entry.value !== 'bigint' || entry.value <= 0n || entry.value > maximum) throw fail();
    return entry.value;
  };
  const gas = read('maxGasFee', DEFAULT_MAX_GAS_FEE, MAX_APPLICATION_GAS_FEE);
  const operation = read('maxOperationAmount', LEGACY_MAX, NOTE_MAX);
  ceiling = gas;
  operationCeiling = operation;
}
function isRailgunGasBudget(value) {
  return typeof value === 'bigint' && value > 0n && value <= ceiling;
}
function isRailgunOperationAmount(value) {
  return typeof value === 'bigint' && value > 0n && value <= operationCeiling;
}
module.exports = { captureRailgunApplicationPolicy, isRailgunGasBudget, isRailgunOperationAmount };
