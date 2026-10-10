"use strict";
const { randomBytes, randomUUID } = require("node:crypto");
const { setMaxListeners } = require("node:events");

function failure(code) {
  return Object.assign(new Error("Reference privacy context unavailable"), {
    code,
  });
}
function refuse(code = "INVALID_PRIVACY_CONTEXT") {
  throw failure(code);
}
function text(value) {
  if (typeof value !== "string" || !value || value.length > 256) refuse();
  return value;
}
function subject(value) {
  if (
    !value ||
    !["public-address", "private-account", "service"].includes(value.kind)
  )
    refuse();
  let principal = text(value.principal);
  if (value.kind === "public-address") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(principal)) refuse();
    principal = principal.toLowerCase();
  }
  if (!Number.isSafeInteger(value.chainId) || value.chainId < 1) refuse();
  const protocol = value.protocol === undefined ? null : text(value.protocol);
  const deployment =
    value.deployment === undefined ? null : text(value.deployment);
  if (value.kind === "private-account" && (!protocol || !deployment)) refuse();
  return Object.freeze({
    kind: value.kind,
    principal,
    chainId: value.chainId,
    protocol,
    deployment,
    role: text(value.role),
    operation: value.operation === undefined ? null : text(value.operation),
  });
}
function requirements(value = {}) {
  const defaults = {
    origin: "tor",
    content: "public",
    correctness: "any",
    maxAgeMs: null,
  };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !Object.hasOwn(defaults, key))
  )
    refuse("INVALID_PRIVACY_REQUIREMENTS");
  const result = { ...defaults, ...value };
  if (
    result.origin !== "tor" ||
    !["public", "pir"].includes(result.content) ||
    !["any", "quorum", "proof"].includes(result.correctness) ||
    (result.maxAgeMs !== null &&
      (!Number.isSafeInteger(result.maxAgeMs) || result.maxAgeMs < 0))
  )
    refuse("INVALID_PRIVACY_REQUIREMENTS");
  return Object.freeze(result);
}

/** A host instance owns its registry. Handles from another host, realm or
 * serialized object carry no authority. Requirements describe requested policy;
 * the transport must independently enforce it. */
function createContextHost({ assertCurrent = () => {} } = {}) {
  const registry = new WeakMap();
  let validationDepth = 0;
  function getPrivacyContext(handle, chainId) {
    const entry = registry.get(handle);
    if (!entry) refuse();
    entry.active();
    if (chainId !== undefined && chainId !== entry.value.subject.chainId)
      refuse("PRIVACY_CHAIN_MISMATCH");
    return entry.value;
  }
  function createPrivacyScope({
    profileId,
    signal,
    isCurrent = () => true,
  } = {}) {
    text(profileId);
    if (!(signal instanceof AbortSignal) || typeof isCurrent !== "function")
      refuse();
    const lifetime = new AbortController();
    setMaxListeners(512, lifetime.signal);
    const generation = randomUUID();
    const handles = new Map();
    const owned = new WeakSet();
    let tasks = 0;
    function close() {
      signal.removeEventListener("abort", close);
      handles.clear();
      lifetime.abort(failure("PRIVACY_CONTEXT_REVOKED"));
    }
    function active() {
      // Parent scopes can authenticate each other repeatedly in one synchronous
      // validation stack. Check the host's physical custody boundary at both
      // ends of that stack, not once per nested edge. No logical currentness or
      // signal check is cached, and nothing survives this call or an await.
      const outer = validationDepth++ === 0;
      try {
        if (outer) assertCurrent();
        try {
          if (signal.aborted || isCurrent() !== true) close();
        } catch {
          close();
        }
        if (outer) assertCurrent();
        if (lifetime.signal.aborted) refuse("PRIVACY_CONTEXT_REVOKED");
      } finally {
        validationDepth--;
      }
    }
    signal.addEventListener("abort", close, { once: true });
    if (signal.aborted) close();
    function getContext(input, policy) {
      active();
      const normalized = subject(input),
        requested = requirements(policy);
      const key = JSON.stringify([normalized, requested]);
      if (handles.has(key)) return handles.get(key);
      if (handles.size >= 256) refuse("PRIVACY_CONTEXT_LIMIT");
      const handle = Object.freeze(Object.create(null));
      const value = Object.freeze({
        profileId,
        generation,
        isolationToken: randomBytes(32).toString("hex"),
        subject: normalized,
        requirements: requested,
        signal: lifetime.signal,
      });
      registry.set(handle, { value, active });
      owned.add(handle);
      handles.set(key, handle);
      return handle;
    }
    function assertOwned(handle) {
      active();
      if (!owned.has(handle)) refuse();
      getPrivacyContext(handle);
    }
    function run(handle, task) {
      assertOwned(handle);
      if (typeof task !== "function") refuse();
      if (tasks >= 32) refuse("PRIVACY_TASK_LIMIT");
      tasks++;
      return new Promise((resolve, reject) => {
        let settled = false;
        function finish(failed, value) {
          if (settled) return;
          settled = true;
          tasks--;
          lifetime.signal.removeEventListener("abort", cancel);
          if (failed) reject(value);
          else resolve(value);
        }
        function cancel() {
          finish(true, lifetime.signal.reason);
        }
        lifetime.signal.addEventListener("abort", cancel, { once: true });
        // Keep observing original work even when cancellation has already
        // rejected the public result. Tasks cannot commit through this method.
        Promise.resolve()
          .then(() => {
            assertOwned(handle);
            return task(lifetime.signal);
          })
          .then((value) => {
            assertOwned(handle);
            finish(false, value);
          })
          .catch((error) => finish(true, error));
      });
    }
    return Object.freeze({ signal: lifetime.signal, getContext, run, close });
  }
  return Object.freeze({ getPrivacyContext, createPrivacyScope });
}
module.exports = { createContextHost };
