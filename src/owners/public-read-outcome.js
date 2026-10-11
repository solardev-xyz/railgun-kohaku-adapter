"use strict";
/** Process-local provenance, never persisted or accepted from a service reply.
 * Only the fixed public-services transport catch registers a failure. Hosts are
 * trusted capabilities; unknown hosts may omit categories and remain ineligible.
 */
const { types } = require("node:util");
const failures = new WeakMap();
function registerPublicReadFailure(target, source) {
  if (!source || typeof source !== "object" || types.isProxy(source)) return;
  const code = Object.getOwnPropertyDescriptor(source, "code"),
    category = Object.getOwnPropertyDescriptor(source, "failureCategory");
  if (!code || !category || !("value" in code) || !("value" in category)) return;
  if (!["TOR_REQUEST_FAILED", "TOR_REQUEST_TIMEOUT"].includes(code.value) ||
      !["connection", "timeout"].includes(category.value)) return;
  failures.set(target, Object.freeze({
    schema: "railgun-public-read-failure-v1",
    operation: "txid-sync",
    category: category.value,
  }));
}
function carryPublicReadFailure(source, target) {
  const value = readPublicReadFailure(source);
  if (value) failures.set(target, value);
  return target;
}
function readPublicReadFailure(error) {
  return error && typeof error === "object" ? failures.get(error) ?? null : null;
}
module.exports = { registerPublicReadFailure, carryPublicReadFailure, readPublicReadFailure };
