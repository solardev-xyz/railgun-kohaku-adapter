/** Private worker-only bootstrap. No vault, main owner, EOA, transport, artifact
 * or credential ports. The fixed host storage entry must initialize this before
 * loading the original session protocol. Never initialized from workerData.
 */
"use strict";
const { isMainThread, parentPort } = require("worker_threads");
const { isProxy } = require("util").types;
let captured;
const names = ["getPrivacyContext", "createPrivacyScope"];
const fail = () =>
  Object.assign(new Error("Railgun worker host unavailable"), {
    code: "RAILGUN_WORKER_HOST_UNAVAILABLE",
  });
function fields(value, expected) {
  if (
    !value ||
    typeof value !== "object" ||
    isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== expected.length) throw fail();
  const result = {};
  for (const key of expected) {
    const field = descriptors[key];
    if (!field || !field.enumerable || !Object.hasOwn(field, "value"))
      throw fail();
    result[key] = field.value;
  }
  return result;
}
function initializeRailgunWorkerHost(input, ...extra) {
  if (isMainThread || !parentPort) throw fail();
  const marker = Symbol.for(
    "@freedom/railgun-kohaku-adapter/owner-worker-host-v1",
  );
  if (Object.hasOwn(globalThis, marker)) throw fail();
  Object.defineProperty(globalThis, marker, {
    value: Object.freeze({}),
    configurable: false,
  });
  if (extra.length) throw fail();
  const { context } = fields(input, ["context"]);
  const methods = fields(context, names),
    next = {};
  for (const name of names) {
    const fn = methods[name];
    if (typeof fn !== "function" || isProxy(fn)) throw fail();
    next[name] = (...args) => Reflect.apply(fn, context, args);
  }
  captured = Object.freeze(next);
}
const context = Object.freeze({
  getPrivacyContext(...args) {
    if (!captured) throw fail();
    return captured.getPrivacyContext(...args);
  },
  createPrivacyScope(...args) {
    if (!captured) throw fail();
    return captured.createPrivacyScope(...args);
  },
});
module.exports = Object.freeze({ initializeRailgunWorkerHost, context });
