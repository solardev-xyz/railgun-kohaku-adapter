"use strict";
const { types } = require("node:util");
// Only the synchronous owner getPrivacyContext call opens this frame. It is
// never shared across an await, task, operation or process. Logical revocation
// is checked by the fence on every call; writer admission always checks disk.
let frame = null;
function assertFenceValidation(key, assertPhysical) {
  if (!frame) return assertPhysical();
  if (!frame.has(key)) {
    assertPhysical();
    frame.set(key, assertPhysical);
  }
}
function withFenceValidation(readContext) {
  const outer = frame === null;
  if (outer) frame = new Map();
  let result, failed = false, first;
  try {
    result = readContext();
    if (result && (typeof result === "object" || typeof result === "function") &&
        (types.isProxy(result) || types.isPromise(result) || "then" in result))
      throw Object.assign(new Error("Synchronous context validation required"), {
        code: "RAILGUN_OWNER_HOST_UNAVAILABLE",
      });
  } catch (error) {
    failed = true;
    first = error;
  } finally {
    if (outer) {
      const checks = frame;
      frame = null;
      let exitFailed = false;
      for (const check of checks.values()) {
        try { check(); } catch (error) {
          if (!exitFailed) first = error;
          exitFailed = true;
          failed = true;
        }
      }
    }
  }
  if (failed) throw first;
  return result;
}
module.exports = { assertFenceValidation, withFenceValidation };
