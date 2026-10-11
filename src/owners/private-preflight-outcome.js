"use strict";
// Local diagnostics, never authority or permission to retry. Keep only closed
// categories; raw errors, identifiers, messages and payloads never leave here.
const { isProxy } = require("node:util").types;
const outcomes = new WeakMap();
const gates = new WeakMap();
const categories = Object.freeze({
  reason: ["rpc", "stale", "inactive", "mismatch", "refused"],
  step: ["deployment", "artifacts", "input-gate", "rootHistory", "unshieldFee", "verifier", "nullifiers", "anchor-recheck"],
  deploymentStep: ["anchor", "code-proxy", "code-relayAdapt", "code-wrappedNative", "code-implementation", "slot-implementation", "slot-paused", "getter-railgun", "getter-wBase", "getter-shieldFee", "getter-tokenBlocklist", "anchor-recheck"],
});
const own = (value, key) => {
  if (!value || typeof value !== "object" || isProxy(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
};
function rememberPrivatePreflightOutcome(result, error, budgetExpired = false) {
  const genuineCode = own(error, "code") === "RAILGUN_PRIVATE_PREFLIGHT_REFUSED";
  const pick = (key) => {
    const value = genuineCode ? own(error, key) : undefined;
    return categories[key].includes(value) ? value : null;
  };
  const reason = pick("reason"), step = pick("step");
  const cause = reason === "rpc" ? own(error, "causeCode") : undefined;
  const transport = ["TOR_REQUEST_FAILED", "TOR_REQUEST_TIMEOUT", "PRIVACY_REQUEST_ABORTED"].includes(cause)
    ? cause : reason === "rpc" ? "other" : null;
  const transportStage = cause === "TOR_REQUEST_FAILED" &&
    ["connect", "tls", "socket-new", "socket-reused", "response", "unclassified"].includes(own(error, "causeStage"))
    ? own(error, "causeStage") : null;
  outcomes.set(result, Object.freeze({
    reason: reason ?? "unknown",
    step,
    deploymentStep: step === "deployment" ? pick("deploymentStep") : null,
    transport,
    transportStage,
    // Means the local allocation elapsed, not that it caused every failure.
    budgetExpired: budgetExpired === true,
  }));
  return result;
}
function readPrivatePreflightOutcome(result) {
  return result && typeof result === "object" ? outcomes.get(result) ?? null : null;
}
function rememberPrivateEvidenceGate(result, gate) {
  if (["window", "poi", "preflight", "provenance", "binding"].includes(gate)) gates.set(result, gate);
  return result;
}
function readPrivateEvidenceGate(result) { return gates.get(result) ?? null; }
module.exports = { rememberPrivatePreflightOutcome, readPrivatePreflightOutcome, rememberPrivateEvidenceGate, readPrivateEvidenceGate };
