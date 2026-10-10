/** Session-bound recovery of the fixed submitter's Shield journal. This does
 * not credit this account: only a wallet scan establishes note ownership.
 * No signer, engine, proof, send, retry or permit authority escapes this lane. */
"use strict";
const assert = require("assert/strict");
const { types } = require("util");
const host = require("./host-bindings.js");
const {
  isRailgunAccountEnrollment,
} = require("./railgun-account-enrollment.js");
const { assertRailgunIdentity } = require("./railgun-identity.js");
const {
  assertRailgunAccountPublicDestination,
} = require("./railgun-account-public.js");
const { openRailgunShieldRecovery } = require("./railgun-shield-recovery.js");
const { getPrivacyContext } = require("./context-bindings.js");
const { getPrivateRpcDestinationDetails } = host.rpc;
const fail = () =>
  Object.assign(new Error("Railgun shield recovery unavailable"), {
    code: "RAILGUN_SHIELD_FACADE_REFUSED",
  });
const unknown = () =>
  Object.assign(fail(), { code: "RAILGUN_SHIELD_FACADE_DRAIN_UNOBSERVED" });
const refusal = (code) => Object.assign(fail(), { code });
const CODES = new Set([
  "RAILGUN_SHIELD_FACADE_REFUSED",
  "RAILGUN_SHIELD_FACADE_DRAIN_UNOBSERVED",
  "RAILGUN_SHIELD_RECOVERY_REFUSED",
  "PRIVATE_SUBMISSION_UNRESOLVED",
  "PRIVATE_JOURNAL_UNAVAILABLE",
  "PRIVATE_TRANSACTION_REQUEST_REFUSED",
  "PRIVATE_TRANSACTION_DESTINATION_REFUSED",
  "PRIVATE_RPC_DESTINATION_REFUSED",
  "PRIVATE_REVIEW_REJECTED",
  "PRIVATE_REVIEW_STALE",
  "PRIVATE_RECONCILIATION_STALE",
  "PRIVACY_REQUEST_ABORTED",
  "PRIVACY_CONTEXT_REVOKED",
]);
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
).get;
const REQUESTS = Object.freeze([
  "eth_blockNumber",
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
]);
// Cross-account exclusion is scoped to the host profile and fixed EOA, and is
// released only after the original owner closes. Journal revision guards remain.
const occupied = new Map();
function exact(value, keys) {
  assert.ok(
    value &&
      !types.isProxy(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
  );
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...keys].sort());
  for (const key of keys)
    assert.ok(
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"),
    );
}
function live(signal) {
  assert.ok(
    signal &&
      !types.isProxy(signal) &&
      Object.getPrototypeOf(signal) === AbortSignal.prototype,
  );
  assert.ok(
    !Object.hasOwn(signal, "aborted") && !Object.hasOwn(signal, "reason"),
  );
  assert.equal(Reflect.apply(aborted, signal, []), false);
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
// The fixed public wallet-0 submitter, as production preparation binds it. A
// caller can never select the address whose journal is read or resolved.
function submitterAddress() {
  const record = require("./host-bindings.js").submitter.readMetadata();
  assert.ok(record && record.index === 0 && record.type === "mnemonic");
  const address = require("ethers").getAddress(record.address).toLowerCase();
  assert.ok(BigInt(address) > 0n);
  return address;
}
// The journal is keyed by the current profile, Sepolia and this submitter. The
// engine and transaction-RPC contexts must name the same current profile.
function assertJournalScope(handle, submitter) {
  const engine = getPrivacyContext(handle);
  assert.equal(engine.subject.chainId, 11155111);
  const parent = require("./host-bindings.js").sessions.openPrivacySession();
  const journalHandle = parent.getContext({
    kind: "public-address",
    principal: submitter,
    chainId: 11155111,
    role: "transaction-rpc",
  });
  const journal = getPrivacyContext(journalHandle);
  assert.equal(journal.profileId, engine.profileId);
  assert.equal(journal.subject.principal, submitter);
  assert.equal(journal.subject.chainId, 11155111);
  return journalHandle;
}
// Safe projection of the genuine transaction-RPC destination observation:
// public endpoint and transport only, never a context or transport authority.
function destinationProjection(observation) {
  const details = getPrivateRpcDestinationDetails(observation);
  // Role is checked at its observation origin; projections contain no authority.
  assert.equal(details.chainId, 11155111);
  assert.equal(typeof details.url, "string");
  assert.equal(typeof details.transport, "string");
  return Object.freeze({ url: details.url, transport: details.transport });
}

function hash(value) {
  assert.equal(typeof value, "string");
  assert.match(value, /^0x[0-9a-f]{64}$/);
  return value;
}
function observation(value) {
  if (!value) return null;
  return {
    status: value.status,
    blockNumber: value.blockNumber ?? null,
    blockHash: value.blockHash ?? null,
    confirmations: value.confirmations ?? null,
  };
}
function shieldProjection(value) {
  if (!value) return null;
  assert.ok(["matched", "anomaly"].includes(value.status));
  return { status: value.status };
}
function createRailgunShieldLane(options) {
  exact(options, [
    "owners",
    "destination",
    "signal",
    "reviewDisclosures",
    "reviewResolution",
  ]);
  const { owners, destination, signal, reviewDisclosures, reviewResolution } =
    options;
  exact(owners, ["identity", "enrollment", "coordinator"]);
  const { identity, enrollment, coordinator } = owners;
  assert.ok(isRailgunAccountEnrollment(enrollment));
  live(signal);
  for (const callback of [reviewDisclosures, reviewResolution])
    assert.ok(typeof callback === "function" && !types.isProxy(callback));
  const handle = enrollment.getContext("engine");
  const descriptor = JSON.stringify(assertRailgunIdentity(identity, handle));
  assert.equal(JSON.stringify(enrollment.descriptor), descriptor);
  assertRailgunAccountPublicDestination(coordinator, enrollment, destination);
  const submitter = submitterAddress();
  const journalHandle = assertJournalScope(handle, submitter);
  const context = getPrivacyContext(journalHandle);
  const lockKey = JSON.stringify([context.profileId, submitter]);
  assert.ok(!occupied.has(lockKey));
  const lock = {};
  const controller = new AbortController();
  const lifetime = AbortSignal.any([
    signal,
    identity.signal,
    enrollment.signal,
    coordinator.signal,
    controller.signal,
  ]);
  let busy = false,
    closing = false,
    failed,
    opened = null,
    restriction = null;
  let resolveClosed, rejectClosed;
  const closed = new Promise((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });
  closed.catch(() => {});
  const current = () => {
    live(lifetime);
    assert.ok(!closing && !failed && isRailgunAccountEnrollment(enrollment));
    assert.equal(
      JSON.stringify(assertRailgunIdentity(identity, handle)),
      descriptor,
    );
    assert.equal(JSON.stringify(enrollment.descriptor), descriptor);
    assert.equal(submitterAddress(), submitter);
    assertRailgunAccountPublicDestination(coordinator, enrollment, destination);
    getPrivacyContext(journalHandle);
  };
  function finish() {
    if (!closing || busy || opened) return;
    lifetime.removeEventListener("abort", close);
    if (!failed && occupied.get(lockKey) === lock) occupied.delete(lockKey);
    if (failed) rejectClosed(failed);
    else resolveClosed();
  }
  function close() {
    if (!closing) {
      closing = true;
      controller.abort();
    }
    try {
      opened?.close();
      restriction?.close();
    } catch {
      failed ||= unknown();
    }
    finish();
  }
  function lost() {
    failed ||= unknown();
    close();
    return failed;
  }
  function original(value) {
    if (!types.isPromise(value) || types.isProxy(value))
      return Promise.reject(lost());
    return new Promise((resolve, reject) => {
      try {
        Promise.prototype.then.call(
          value,
          (result) =>
            resolve(Object.freeze({ __proto__: null, value: result })),
          reject,
        );
      } catch {
        reject(lost());
      }
    });
  }
  async function review(callback, summary) {
    current();
    const reviewController = new AbortController();
    const reviewSignal = AbortSignal.any([lifetime, reviewController.signal]);
    const started = performance.now(),
      end = started + 30000;
    const timer = setTimeout(() => reviewController.abort(), 30000);
    timer.unref?.();
    try {
      let decision = callback(
        freeze(summary),
        Object.freeze({ signal: reviewSignal }),
      );
      if (types.isPromise(decision) && !types.isProxy(decision))
        decision = (await original(decision)).value;
      else if (
        decision !== null &&
        ["object", "function"].includes(typeof decision)
      )
        throw lost();
      current();
      live(reviewSignal);
      const now = performance.now();
      assert.ok(now >= started && now < end);
      assert.equal(decision, true);
      return true;
    } finally {
      clearTimeout(timer);
    }
  }
  function invoke(action) {
    try {
      current();
      assert.equal(busy, false);
    } catch {
      return Promise.reject(fail());
    }
    busy = true;
    const pending = (async () => {
      try {
        return await action();
      } catch (error) {
        const code =
          error && !types.isProxy(error)
            ? Object.getOwnPropertyDescriptor(error, "code")?.value
            : undefined;
        if (
          typeof code === "string" &&
          (code.endsWith("_EXIT_UNOBSERVED") ||
            code.endsWith("_DRAIN_UNOBSERVED"))
        ) {
          failed ||= unknown();
          throw unknown();
        }
        throw refusal(
          typeof code === "string" && CODES.has(code)
            ? code
            : "RAILGUN_SHIELD_FACADE_REFUSED",
        );
      } finally {
        busy = false;
        if (failed) close();
        finish();
      }
    })();
    // Retain rejection even if a host abandons its original returned promise.
    pending.catch(() => {});
    return pending;
  }

  // Complete local journal and archive read. Missing storage may mean no rows,
  // but an incomplete or failed read is never represented as an empty journal.
  async function records() {
    const snapshot =
      await host.submissionJournal.readExistingPrivateSubmissionSnapshot(
        journalHandle,
      );
    current();
    assert.ok(
      Array.isArray(snapshot.records) && Array.isArray(snapshot.archive),
    );
    const rows = [...snapshot.records, ...snapshot.archive].filter(
      (r) => r.intent?.kind === "railgun-native-shield",
    );
    assert.equal(new Set(rows.map((r) => r.hash)).size, rows.length);
    return rows;
  }
  function list(...extra) {
    return invoke(async () => {
      assert.equal(extra.length, 0);
      return freeze(
        (await records()).map((r) => ({
          transactionHash: hash(r.hash),
          nonce: r.nonce,
          observation: observation(r.observation),
          resolved: !!r.resolution,
        })),
      );
    });
  }
  async function withRecovery(transactionHash, use) {
    hash(transactionHash);
    const row = (await records()).find((r) => r.hash === transactionHash);
    assert.ok(row && !row.resolution);
    // Capture a genuine own-EOA RPC observation without dispatching a request.
    // It must agree with the session's scan endpoint, then constrains every
    // request made by the original recovery owner, including post-review reads.
    const rpc = host.rpc.createPrivateRpc(journalHandle, "transaction-rpc");
    const rpcDestination = host.rpc.getPrivateRpcDestination(
      rpc,
      journalHandle,
    );
    const target = destinationProjection(rpcDestination);
    assert.equal(
      getPrivateRpcDestinationDetails(rpcDestination).role,
      "transaction-rpc",
    );
    assert.deepEqual(target, destinationProjection(destination));
    current();
    try {
      await review(reviewDisclosures, {
        purpose: "railgun-shield-observation-v1",
        chainId: 11155111,
        submitter,
        transactionHash,
        destination: target,
        requests: [...REQUESTS],
        disclosures: [
          "public-submitter",
          "journaled-transaction-hash",
          "nonce-reconciliation",
          "observation-timing",
        ],
        signingEnabled: false,
        sendEnabled: false,
        retryEnabled: false,
      });
      current();
      host.rpc.assertPrivateRpcDestination(rpc, journalHandle, rpcDestination);
      // Human disclosure review has ended. The original reconciler's 120s
      // review window includes receipt/finality reads around its 30s human
      // review; the destination lifetime also covers initial reconciliation.
      restriction = host.rpc.createPrivateRpcDestinationConstraint({
        observation: rpcDestination,
        signal: lifetime,
        deadline: performance.now() + 300000,
      });
      opened = openRailgunShieldRecovery(submitter, {
        signal: lifetime,
        destinationConstraint: restriction.constraint,
      });
      const value = await use(opened, row, target);
      current();
      return value;
    } finally {
      await drainRecovery();
    }
  }
  async function drainRecovery() {
    const recovery = opened;
    try {
      recovery?.close();
      if (recovery) await original(recovery.closed);
    } catch {
      throw lost();
    } finally {
      opened = null;
      restriction?.close();
      restriction = null;
    }
  }
  function observe(transactionHash, ...extra) {
    return invoke(async () => {
      assert.equal(extra.length, 0);
      return withRecovery(transactionHash, async (recovery, row) => {
        const result = await recovery.observe(transactionHash);
        current();
        assert.equal(result.record.hash, row.hash);
        assert.equal(result.record.intent.digest, row.intent.digest);
        return freeze({
          status: "observed",
          transactionHash,
          observation: observation(result.record.observation),
          shield: shieldProjection(result.shield),
          resolved: !!result.record.resolution,
          trust: "unverified-rpc",
          retryEnabled: false,
        });
      });
    });
  }
  function resolve(transactionHash, options, ...extra) {
    return invoke(async () => {
      assert.equal(extra.length, 0);
      exact(options, ["minimumConfirmations"]);
      const { minimumConfirmations } = options;
      assert.ok(
        Number.isSafeInteger(minimumConfirmations) &&
          minimumConfirmations >= 3 &&
          minimumConfirmations <= 64,
      );
      return withRecovery(transactionHash, async (recovery, row, target) => {
        let reviewed = false;
        const result = await recovery.resolve(transactionHash, {
          minimumConfirmations,
          reviewTimeoutMs: 120000,
          review: async (request) => {
            current();
            assert.equal(request.transactionHash, row.hash);
            await review(reviewResolution, {
              purpose: "railgun-shield-resolution-v1",
              chainId: 11155111,
              submitter,
              transactionHash,
              destination: target,
              observation: observation(request.observation),
              shield: shieldProjection(request.shield),
              finalizedBlockNumber: request.finalized?.number ?? null,
              minimumConfirmations,
              allowsNextTransaction: true,
              retryEnabled: false,
              trust: "unverified-rpc",
            });
            current();
            reviewed = true;
            return Object.freeze({
              allowNextTransaction: true,
              acceptedEvidence: "unverified-rpc",
            });
          },
        });
        current();
        assert.ok(reviewed);
        assert.equal(result.hash, row.hash);
        assert.equal(result.intent.digest, row.intent.digest);
        const details = result.resolution?.railgun;
        assert.ok(["matched", "reverted"].includes(details?.outcome));
        return freeze({
          status: "resolved",
          transactionHash,
          outcome: details.outcome,
          finalizedBlockNumber: details.finalizedBlockNumber,
          retryEnabled: false,
          trust: "unverified-rpc",
        });
      });
    });
  }
  current();
  occupied.set(lockKey, lock);
  lifetime.addEventListener("abort", close);
  return Object.freeze({
    list,
    observe,
    resolve,
    signal: lifetime,
    closed,
    close,
  });
}
module.exports = Object.freeze({ createRailgunShieldLane });
