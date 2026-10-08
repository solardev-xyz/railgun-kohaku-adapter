/** Private fixed held-submission companion. It binds one existing signed private
 * hold to its exact journaled EOA submission, then observes or resolves that
 * submission through the existing transact recovery. It never signs, sends,
 * retries, selects a journal row by position or releases the hold. */
"use strict";
const assert = require("assert/strict");
const { types } = require("util");
const {
  isRailgunAccountEnrollment,
} = require("./railgun-account-enrollment.js");
const { assertRailgunIdentity } = require("./railgun-identity.js");
const {
  assertRailgunAccountPublicDestination,
} = require("./railgun-account-public.js");
const {
  openRailgunTransactRecovery,
} = require("./railgun-transact-recovery.js");
const { getPrivacyContext } = require("./context-bindings.js");
const fail = () =>
  Object.assign(new Error("Railgun held submission unavailable"), {
    code: "RAILGUN_SUBMISSION_FACADE_REFUSED",
  });
const unknown = () =>
  Object.assign(fail(), { code: "RAILGUN_SUBMISSION_FACADE_DRAIN_UNOBSERVED" });
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
).get;
const KINDS = Object.freeze([
  "railgun-private-transfer",
  "railgun-token-unshield",
  "railgun-partial-unshield",
]);
// Exactly the transaction-RPC reads the original endpoint readiness check,
// nonce reconciliation, receipt match and finality checks may issue for one
// journaled own-EOA hash.
const REQUESTS = Object.freeze([
  "eth_blockNumber",
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
]);
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
function id(value) {
  assert.equal(typeof value, "string");
  assert.match(value, /^[a-f0-9]{64}$/);
  return value;
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
  const journal = getPrivacyContext(
    parent.getContext({
      kind: "public-address",
      principal: submitter,
      chainId: 11155111,
      role: "transaction-rpc",
    }),
  );
  assert.equal(journal.profileId, engine.profileId);
  assert.equal(journal.subject.principal, submitter);
  assert.equal(journal.subject.chainId, 11155111);
}
function noteId(output) {
  assert.ok(
    Number.isSafeInteger(output?.tree) &&
      output.tree >= 0 &&
      output.tree < 65536 &&
      Number.isSafeInteger(output.position) &&
      output.position >= 0,
  );
  return `${output.tree}:${output.position}`;
}
// Public outcome fields only: no nullifier, commitment, calldata or ciphertext.
function outputProjection(transact) {
  if (transact?.status !== "matched") return null;
  const output = transact.output;
  if (transact.operation === "railgun-private-transfer") {
    assert.equal(output.kind, "shielded");
    return { kind: "shielded", noteId: noteId(output) };
  }
  if (transact.operation === "railgun-token-unshield") {
    assert.equal(output.kind, "unshield");
    return {
      kind: "unshield",
      recipient: output.recipient,
      amount: output.amount,
      received: output.received,
      fee: output.fee,
      feeDeviation: output.feeDeviation === true,
    };
  }
  assert.equal(transact.operation, "railgun-partial-unshield");
  assert.equal(output.kind, "partial-unshield");
  return {
    kind: "partial-unshield",
    changeNoteId: noteId(output.change),
    recipient: output.unshield.recipient,
    unshieldAmount: output.unshield.unshieldAmount,
    received: output.unshield.received,
    fee: output.unshield.fee,
    feeDeviation: output.unshield.feeDeviation === true,
  };
}
function observationProjection(observation) {
  if (!observation) return null;
  assert.equal(typeof observation.status, "string");
  return {
    status: observation.status,
    blockNumber: observation.blockNumber ?? null,
    blockHash: observation.blockHash ?? null,
    confirmations: observation.confirmations ?? null,
  };
}
function transactProjection(transact) {
  if (!transact) return null;
  assert.ok(["matched", "anomaly"].includes(transact.status));
  return transact.status === "matched"
    ? {
        status: "matched",
        operation: transact.operation,
        blockNumber: Number(BigInt(transact.blockNumber)),
        blockHash: transact.blockHash,
      }
    : { status: "anomaly" };
}
function createRailgunSubmissionLane(options) {
  exact(options, ["owners", "destination", "signal", "reviewDisclosures"]);
  const { owners, destination, signal, reviewDisclosures } = options;
  exact(owners, ["identity", "enrollment", "coordinator"]);
  const { identity, enrollment, coordinator } = owners;
  assert.ok(isRailgunAccountEnrollment(enrollment));
  live(signal);
  assert.ok(
    typeof reviewDisclosures === "function" &&
      !types.isProxy(reviewDisclosures),
  );
  const handle = enrollment.getContext("engine");
  const descriptor = JSON.stringify(assertRailgunIdentity(identity, handle));
  assert.equal(JSON.stringify(enrollment.descriptor), descriptor);
  assertRailgunAccountPublicDestination(coordinator, enrollment, destination);
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
    recovery = null,
    resolveClosed,
    rejectClosed;
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
    assertRailgunAccountPublicDestination(coordinator, enrollment, destination);
  };
  function finish() {
    if (!closing || busy) return;
    lifetime.removeEventListener("abort", close);
    if (failed) rejectClosed(failed);
    else resolveClosed();
  }
  // Revoke the independently opened journal scope with its parent lane; the
  // pending operation still settles before `closed`.
  function revoke() {
    const opened = recovery;
    recovery = null;
    try {
      opened?.close();
    } catch {
      failed ||= unknown();
    }
  }
  function close() {
    if (!closing) {
      closing = true;
      controller.abort();
    }
    revoke();
    finish();
  }
  function lost() {
    failed ||= unknown();
    close();
    return failed;
  }
  // Box fulfillment before it reaches resolve: neither thenable assimilation nor
  // Promise species output can replace the original callback settlement.
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
  async function review(summary) {
    current();
    const reviewController = new AbortController();
    const reviewSignal = AbortSignal.any([lifetime, reviewController.signal]);
    const started = performance.now(),
      end = started + 30000;
    const timer = setTimeout(() => reviewController.abort(), 30000);
    timer.unref?.();
    try {
      let decision = reviewDisclosures(
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
        )
          failed ||= error;
        // Coded owner/host refusals keep their generic messages; anything else,
        // notably assertion values over custody facts, never leaves the lane.
        if (
          typeof code === "string" &&
          /^(?:RAILGUN|PRIVATE|PRIVACY)_[A-Z0-9_]{1,80}$/.test(code)
        )
          throw error;
        throw fail();
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
  // Local authenticated custody only; no service, RPC or journal access.
  async function held(holdId) {
    const reservations = await enrollment.openReservations({
      existingOnly: true,
    });
    current();
    const value = await reservations.withSigningRecovery(
      async (records, context) => {
        context.assertCurrent();
        current();
        const rows = records.filter((row) => row.entry.id === holdId);
        assert.equal(rows.length, 1);
        const { entry, receipt } = rows[0];
        reservations.assertReceiptContext(receipt, "recovery");
        assert.deepEqual(await reservations.assertReceipt(receipt), entry);
        context.assertCurrent();
        current();
        assert.ok(KINDS.includes(entry.facts.kind));
        assert.match(entry.facts.intentDigest, /^0x[0-9a-f]{64}$/);
        assert.ok(entry.signing && typeof entry.signing === "object");
        assert.match(entry.signing.submitter, /^0x[0-9a-f]{40}$/);
        return freeze({
          kind: entry.facts.kind,
          tree: entry.facts.tree,
          nullifier: entry.facts.nullifier,
          intentDigest: entry.facts.intentDigest,
          submitter: entry.signing.submitter,
        });
      },
      { timeoutMs: 15000 },
    );
    current();
    return value;
  }
  // The only accepted join: the journal intent derived from the submitted
  // calldata must carry this hold's exact zero-proof signing digest, nullifier,
  // tree and operation. Absence stays unjournaled; more than one match refuses.
  function bind(records, hold) {
    const matches = records.filter(
      (record) =>
        record.intent?.kind === "railgun-transact" &&
        record.intent.intentDigest === hold.intentDigest &&
        record.intent.nullifier === hold.nullifier &&
        record.intent.tree === hold.tree &&
        record.intent.operation === hold.kind,
    );
    assert.ok(matches.length <= 1);
    return matches[0] ?? null;
  }
  function disclosure(holdId, hold) {
    return {
      purpose: "railgun-held-submission-observation-v1",
      chainId: 11155111,
      holdId,
      operation: hold.kind,
      submitter: hold.submitter,
      destinationRole: "transaction-rpc",
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
      holdReleaseEnabled: false,
    };
  }
  // Custody, submitter and profile checks are local; consent precedes the
  // journal scope, and only a complete journal read may report no match.
  async function open(holdId) {
    id(holdId);
    const hold = await held(holdId);
    assert.equal(hold.submitter, submitterAddress());
    assertJournalScope(handle, hold.submitter);
    await review(disclosure(holdId, hold));
    current();
    assert.equal(recovery, null);
    recovery = openRailgunTransactRecovery(hold.submitter);
    const opened = recovery;
    const record = bind(await opened.list(), hold);
    current();
    return { hold, opened, record };
  }
  function observe(holdId) {
    return invoke(async () => {
      try {
        const { hold, opened, record } = await open(holdId);
        if (!record)
          return freeze({
            status: "unjournaled",
            holdId,
            kind: hold.kind,
            transactionHash: null,
            submissionEnabled: false,
            retryEnabled: false,
          });
        const observed = await opened.observe(record.hash);
        current();
        assert.equal(observed.record.hash, record.hash);
        assert.equal(observed.record.intent.digest, record.intent.digest);
        return freeze({
          status: "journaled",
          holdId,
          kind: hold.kind,
          transactionHash: record.hash,
          observation: observationProjection(observed.record.observation),
          transact: transactProjection(observed.transact),
          output: outputProjection(observed.transact),
          resolved: !!observed.record.resolution,
          trust: "unverified-rpc",
          submissionEnabled: false,
          retryEnabled: false,
        });
      } finally {
        revoke();
      }
    });
  }
  function resolve(holdId, options) {
    return invoke(async () => {
      exact(options, ["minimumConfirmations"]);
      const { minimumConfirmations } = options;
      assert.ok(
        Number.isSafeInteger(minimumConfirmations) &&
          minimumConfirmations >= 3 &&
          minimumConfirmations <= 64,
      );
      try {
        const { hold, opened, record } = await open(holdId);
        assert.ok(record && !record.resolution);
        let reviewed;
        const resolved = await opened.resolve(record.hash, {
          minimumConfirmations,
          // The host sees only this sanitized projection, never the raw
          // reconciliation request or receipt-derived note material.
          review: async (request) => {
            current();
            assert.equal(request.transactionHash, record.hash);
            const summary = {
              purpose: "railgun-held-submission-resolution-v1",
              chainId: 11155111,
              holdId,
              operation: hold.kind,
              transactionHash: record.hash,
              observation: observationProjection(request.observation),
              transact: transactProjection(request.transact),
              output: outputProjection(request.transact),
              finalizedBlockNumber: request.finalized?.number ?? null,
              minimumConfirmations,
              allowsNextTransaction: true,
              releasesHold: false,
              retryEnabled: false,
              trust: "unverified-rpc",
            };
            await review(summary);
            reviewed = freeze(summary);
            return Object.freeze({
              allowNextTransaction: true,
              acceptedEvidence: "unverified-rpc",
            });
          },
        });
        current();
        assert.ok(reviewed);
        // The outcome is the journal's permit-checked resolution, not the
        // reviewed summary; reverted resolves the journal but carries no output.
        assert.equal(resolved.hash, record.hash);
        assert.equal(resolved.intent.digest, record.intent.digest);
        const details = resolved.resolution?.railgun;
        assert.ok(["matched", "reverted"].includes(details?.outcome));
        assert.equal(
          details.outcome === "matched",
          reviewed.transact?.status === "matched",
        );
        return freeze({
          status: "resolved",
          holdId,
          kind: hold.kind,
          transactionHash: record.hash,
          outcome: details.outcome,
          finalizedBlockNumber: details.finalizedBlockNumber,
          output: details.outcome === "matched" ? reviewed.output : null,
          releasesHold: false,
          retryEnabled: false,
          trust: "unverified-rpc",
        });
      } finally {
        revoke();
      }
    });
  }
  lifetime.addEventListener("abort", close);
  current();
  return Object.freeze({
    observe,
    resolve,
    close,
    closed,
    signal: lifetime,
  });
}
module.exports = Object.freeze({ createRailgunSubmissionLane });
