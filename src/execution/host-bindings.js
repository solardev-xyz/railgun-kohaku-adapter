/** Trusted bootstrap only. These ports are fixed for the lifetime of this module
 * realm; they are never supplied by a wallet operation, renderer or job input.
 * Genuine host context and artifact capabilities remain owned by that host.
 */
'use strict';
const { isProxy } = require('util').types;
let host;
const fail = () =>
  Object.assign(new Error('Railgun execution host unavailable'), {
    code: 'RAILGUN_EXECUTION_HOST_UNAVAILABLE',
  });
function fields(value, keys) {
  if (!value || typeof value !== 'object' || isProxy(value)) throw fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some((key) => !descriptors[key] || !Object.hasOwn(descriptors[key], 'value'))
  )
    throw fail();
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function capture(receiver, names) {
  if (!receiver || typeof receiver !== 'object' || isProxy(receiver)) throw fail();
  const result = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(receiver, name);
    if (
      !descriptor ||
      !Object.hasOwn(descriptor, 'value') ||
      typeof descriptor.value !== 'function' ||
      isProxy(descriptor.value)
    )
      throw fail();
    const original = descriptor.value;
    result[name] = (...args) => Reflect.apply(original, receiver, args);
  }
  return result;
}
function initializeRailgunExecutionHost(value) {
  const key = Symbol.for('@freedom/railgun-kohaku-adapter/execution-host-v1');
  if (Object.hasOwn(globalThis, key)) throw fail();
  // No reset, adoption or returned binding: a prior initialization attempt is
  // fatal to this bootstrap, including one made through another package copy.
  Object.defineProperty(globalThis, key, { value: Object.freeze({}), configurable: false });
  const input = fields(value, ['context', 'artifacts']);
  fields(input.context, ['getPrivacyContext', 'createPrivacyScope']);
  fields(input.artifacts, ['createPrivacyArtifactLoader']);
  host = Object.freeze({
    ...capture(input.context, ['getPrivacyContext', 'createPrivacyScope']),
    ...capture(input.artifacts, ['createPrivacyArtifactLoader']),
  });
}
function getPrivacyContext(...args) {
  if (!host) throw fail();
  return host.getPrivacyContext(...args);
}
function createPrivacyScope(...args) {
  if (!host) throw fail();
  return host.createPrivacyScope(...args);
}
function createPrivacyArtifactLoader(...args) {
  if (!host) throw fail();
  return host.createPrivacyArtifactLoader(...args);
}
module.exports = {
  initializeRailgunExecutionHost,
  getPrivacyContext,
  createPrivacyScope,
  createPrivacyArtifactLoader,
};
