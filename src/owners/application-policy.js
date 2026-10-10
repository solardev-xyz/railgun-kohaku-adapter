/** Trusted-main spending ceiling. This is application policy, not a Railgun rule.
 * Captured once before owners load; no per-operation ceiling override. */
'use strict';
const { isProxy } = require('util').types;
const DEFAULT_MAX_GAS_FEE = 2000000000000000n;
// Sanity bound for this implementation, not a protocol limit or a recommended fee.
const MAX_APPLICATION_GAS_FEE = 1000000000000000000n;
const fail = () => Object.assign(new Error('Railgun application policy unavailable'), {
  code: 'RAILGUN_APPLICATION_POLICY_REFUSED',
});
let attempted = false;
let ceiling = DEFAULT_MAX_GAS_FEE;
function captureRailgunApplicationPolicy(input) {
  if (attempted) throw fail();
  attempted = true;
  if (arguments.length === 0) return;
  if (arguments.length !== 1 || !input || typeof input !== 'object' || isProxy(input) ||
      Object.getPrototypeOf(input) !== Object.prototype) throw fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const entry = descriptors.maxGasFee;
  if (Reflect.ownKeys(descriptors).length !== 1 || !entry || !entry.enumerable ||
      !Object.hasOwn(entry, 'value') || typeof entry.value !== 'bigint' ||
      entry.value <= 0n || entry.value > MAX_APPLICATION_GAS_FEE) throw fail();
  ceiling = entry.value;
}
function isRailgunGasBudget(value) {
  return typeof value === 'bigint' && value > 0n && value <= ceiling;
}
module.exports = { captureRailgunApplicationPolicy, isRailgunGasBudget };
