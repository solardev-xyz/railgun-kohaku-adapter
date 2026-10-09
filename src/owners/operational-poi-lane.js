/** Private fixed retained-POI companion. No receipt, proof or store crosses it. */
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
  openRailgunOwnPoiMembership,
  openRailgunOwnTransactPoiMembership,
} = require("./railgun-own-poi-membership.js");
const { proveRailgunOwnPoi } = require("./railgun-own-poi-proof.js");
const { checkRailgunRetiredPoiCircuit } = require("./railgun-poi-verifier.js");
const { claimRailgunAccountPhase } = require("./railgun-account-phase.js");
const {
  prepareRailgunPoiDisclosurePlan,
  revalidateRailgunPoiDisclosurePlan,
  submitRailgunRetainedPoi,
} = require("./railgun-poi-disclosure-plan.js");
const {
  recoverRailgunPoiOutputCompleted,
  recoverRailgunAttemptedPoiOutput,
} = require("./railgun-poi-output-recovery.js");
const fail = () =>
  Object.assign(new Error("Railgun retained POI unavailable"), {
    code: "RAILGUN_POI_FACADE_REFUSED",
  });
const unknown = () =>
  Object.assign(fail(), { code: "RAILGUN_POI_FACADE_DRAIN_UNOBSERVED" });
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
).get;
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
function createRailgunPoiLane(options) {
  exact(options, [
    "owners",
    "archive",
    "proverArchive",
    "artifactDirectory",
    "destination",
    "signal",
    "reviewDisclosures",
    "ownedPoiEvidence",
  ]);
  const {
    owners,
    archive,
    proverArchive,
    artifactDirectory,
    destination,
    signal,
    reviewDisclosures,
    ownedPoiEvidence,
  } = options;
  assert.ok(
    typeof ownedPoiEvidence === "function" && !types.isProxy(ownedPoiEvidence),
  );
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
  function close() {
    if (!closing) {
      closing = true;
      controller.abort();
    }
    finish();
  }
  function lost() {
    failed ||= unknown();
    close();
    return failed;
  }
  // Box fulfillment before it reaches resolve: neither thenable assimilation nor
  // Promise species output can replace the original callback/closure settlement.
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
  async function review(summary, context = {}) {
    current();
    const reviewController = new AbortController();
    const reviewSignal = AbortSignal.any([
      lifetime,
      ...(context.signal ? [context.signal] : []),
      reviewController.signal,
    ]);
    const started = performance.now(),
      end = started + 30000;
    const timer = setTimeout(() => reviewController.abort(), 30000);
    timer.unref?.();
    try {
      let decision = reviewDisclosures(
        summary,
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
  async function drain(resource) {
    let error;
    try {
      resource.close();
    } catch (value) {
      error = value;
    }
    try {
      await original(resource.closed);
    } catch (value) {
      error ||= value;
    }
    if (error) {
      failed ||= unknown();
      throw failed;
    }
  }
  function invoke(action, terminal = false) {
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
        throw error;
      } finally {
        busy = false;
        if (terminal || failed) close();
        finish();
      }
    })();
    // Retain rejection even if a host abandons its original returned promise.
    pending.catch(() => {});
    return pending;
  }
  const common = {
    identity,
    enrollment,
    coordinator,
    archive,
    proverArchive,
    artifactDirectory,
    signal: lifetime,
  };
  async function selection(holdId) {
    const reservations = await enrollment.openReservations({
      existingOnly: true,
    });
    current();
    const selector = await reservations.withSigningRecovery(
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
        assert.ok(
          [
            "railgun-private-transfer",
            "railgun-token-unshield",
            "railgun-partial-unshield",
          ].includes(entry.facts.kind),
        );
        return freeze(
          Object.fromEntries(
            ["noteHash", "nullifier", "position", "tree"].map((key) => [
              key,
              entry.facts[key],
            ]),
          ),
        );
      },
      { timeoutMs: 15000 },
    );
    current();
    return selector;
  }
  function disclosure(operation, selected) {
    return freeze({
      purpose: "railgun-retained-poi-facade-disclosure-v1",
      operation,
      chainId: 11155111,
      selection: selected,
      destinationSource: "authenticated-account-public-destination",
      endpoints: {
        poi: "https://ppoi.fdi.network",
        indexer:
          "https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql",
      },
      exposures: [
        "canonical-source-ranges-and-timing",
        "own-transaction-and-receipt",
        "selected-blinded-commitment-and-type",
        "membership-list-and-root",
        "txid-root-and-index",
        "creator-transaction",
      ],
      exactServiceValuesAvailableBeforeAuthenticatedOpen: false,
      mayDiscloseBeforeCreatorTypeMismatchEstablished: true,
      spendingSigningEnabled: false,
      transactionBroadcastEnabled: false,
      poiSubmissionEnabled: false,
    });
  }
  function prepare(holdId, type) {
    try {
      id(holdId);
    } catch {
      return Promise.reject(fail());
    }
    return invoke(async () => {
      const selector = await selection(holdId);
      await review(
        disclosure(
          type === "Shield" ? "prepare-shield" : "prepare-transact",
          holdId,
        ),
      );
      current();
      let membership,
        outcome,
        operationError,
        operationFailed = false;
      try {
        membership = await (
          type === "Shield"
            ? openRailgunOwnPoiMembership
            : openRailgunOwnTransactPoiMembership
        )({
          ...(type === "Transact" ? { identity } : {}),
          enrollment,
          coordinator,
          archive,
          selector,
          signal: lifetime,
        });
        current();
        if (membership.status !== "verified")
          outcome = Object.freeze({
            status: "refused",
            stage: "membership:" + membership.stage,
          });
        else {
          const proof = await proveRailgunOwnPoi({
            ...common,
            membershipReceipt: membership.receipt,
          });
          current();
          if (proof.status !== "proved")
            outcome = Object.freeze({
              status: "refused",
              stage: "proof:" + proof.stage,
            });
          else {
            const store = await enrollment.openPoiIntents();
            current();
            const prepared = await store.prepare({
              proof,
              coordinator,
              signal: lifetime,
            });
            current();
            if (prepared.status !== "prepared")
              outcome = Object.freeze({
                status: "refused",
                stage: "store:" + prepared.stage,
              });
            else {
              id(prepared.capsuleDigest);
              id(prepared.payloadSha256);
              const saved = await store.get(prepared.capsuleDigest);
              current();
              assert.equal(saved.state, "prepared");
              assert.equal(saved.capsuleDigest, prepared.capsuleDigest);
              assert.equal(saved.payloadSha256, prepared.payloadSha256);
              assert.equal(saved.revision, prepared.revision);
              outcome = Object.freeze({
                status: "prepared",
                capsuleDigest: prepared.capsuleDigest,
                payloadSha256: prepared.payloadSha256,
                revision: prepared.revision,
                proofAuthenticated: false,
                disclosureEnabled: false,
                spendingEnabled: false,
              });
            }
          }
        }
      } catch (error) {
        operationFailed = true;
        operationError = error;
      }
      if (membership?.status === "verified") await drain(membership);
      if (operationFailed) throw operationError;
      current();
      return outcome;
    });
  }
  // The single attempted intent for a hold, found from local custody only: the
  // hold's genuine selector, then exactly one attempted entry with that selector.
  async function attemptedCapsule(holdId) {
    const selected = await selection(holdId);
    current();
    const store = await enrollment.openPoiIntents({ existingOnly: true });
    current();
    const rows = await store.list();
    current();
    const matches = [];
    for (const row of rows) {
      if (row.state !== "attempted") continue;
      const entry = await store.get(row.capsuleDigest);
      current();
      assert.equal(entry.capsuleDigest, row.capsuleDigest);
      if (
        entry.state === "attempted" &&
        JSON.stringify(
          ["noteHash", "nullifier", "position", "tree"].map((k) => entry.selector[k]),
        ) ===
          JSON.stringify(
            ["noteHash", "nullifier", "position", "tree"].map((k) => selected[k]),
          )
      )
        matches.push(entry.capsuleDigest);
    }
    assert.equal(matches.length, 1);
    return matches[0];
  }
  // One replacement proof for a hold's attempted output whose identical retry
  // is spent, only when the pinned retired POI circuit key verifies the exact
  // stored original proof and the current key rejects it. Local preparation
  // with fresh membership roots; no handoff, status or disclosure authority.
  // As prepare, the fixed route names the input's creator type and the genuine
  // membership owner reauthenticates it; a mismatched route refuses there.
  function reproveRetired(holdId, type) {
    try {
      id(holdId);
    } catch {
      return Promise.reject(fail());
    }
    return invoke(async () => {
      const capsuleDigest = await attemptedCapsule(holdId);
      const selector = await selection(holdId);
      current();
      const store = await enrollment.openPoiIntents({ existingOnly: true });
      current();
      const entry = await store.get(capsuleDigest);
      current();
      assert.equal(entry.capsuleDigest, capsuleDigest);
      if (
        entry.state !== "attempted" ||
        !entry.retry ||
        entry.reproof?.attempt ||
        entry.payload.blindedCommitmentsOut.length !== 1
      )
        return Object.freeze({ status: "refused", stage: "entry" });
      // A verifier error or timeout is a refusal, never "fails the current key".
      let transition;
      const phase = claimRailgunAccountPhase(enrollment, "recovery");
      try {
        transition = await checkRailgunRetiredPoiCircuit({
          handle: enrollment.getContext("prover", "poi-verify"),
          proverArchive,
          artifactDirectory,
          payload: entry.payload,
          signal: lifetime,
          timeoutMs: 60000,
        });
      } catch {
        return Object.freeze({ status: "refused", stage: "circuit" });
      } finally {
        phase.release();
      }
      current();
      assert.equal(transition.payloadSha256, entry.payloadSha256);
      await review(
        disclosure(
          type === "Shield"
            ? "reprove-retired-shield"
            : "reprove-retired-transact",
          holdId,
        ),
      );
      current();
      let membership,
        outcome,
        operationError,
        operationFailed = false;
      try {
        membership = await (
          type === "Shield"
            ? openRailgunOwnPoiMembership
            : openRailgunOwnTransactPoiMembership
        )({
          ...(type === "Transact" ? { identity } : {}),
          enrollment,
          coordinator,
          archive,
          selector,
          signal: lifetime,
        });
        current();
        if (membership.status !== "verified")
          outcome = Object.freeze({
            status: "refused",
            stage: "membership:" + membership.stage,
          });
        else {
          const proof = await proveRailgunOwnPoi({
            ...common,
            membershipReceipt: membership.receipt,
          });
          current();
          if (proof.status !== "proved")
            outcome = Object.freeze({
              status: "refused",
              stage: "proof:" + proof.stage,
            });
          else {
            const prepared = await store.prepareReproof({
              proof,
              coordinator,
              transition,
              expected: {
                capsuleDigest,
                revision: entry.revision,
                payloadSha256: entry.payloadSha256,
                bodySha256: entry.attempt.submission.bodySha256,
                attemptedAt: entry.attempt.attemptedAt,
                reservedAt: entry.retry.reservedAt,
              },
              signal: lifetime,
            });
            current();
            if (prepared.status !== "reproof-prepared")
              outcome = Object.freeze({
                status: "refused",
                stage: "store:" + prepared.stage,
              });
            else {
              const saved = await store.get(capsuleDigest);
              current();
              assert.equal(saved.reproof.payloadSha256, prepared.payloadSha256);
              assert.equal(saved.reproof.revision, prepared.reproofRevision);
              assert.equal(saved.reproof.attempt, undefined);
              outcome = Object.freeze({
                status: "reproof-prepared",
                capsuleDigest,
                payloadSha256: prepared.payloadSha256,
                reproofRevision: prepared.reproofRevision,
                circuit: Object.freeze({
                  from: prepared.circuit.from,
                  to: prepared.circuit.to,
                }),
                proofAuthenticated: false,
                disclosureEnabled: false,
                spendingEnabled: false,
              });
            }
          }
        }
      } catch (error) {
        operationFailed = true;
        operationError = error;
      }
      if (membership?.status === "verified") await drain(membership);
      if (operationFailed) throw operationError;
      current();
      return outcome;
    });
  }
  function reproofHold(holdId) {
    try {
      id(holdId);
    } catch {
      return Promise.reject(fail());
    }
    return invoke(
      async () => submitCore(await attemptedCapsule(holdId), "reproof"),
      true,
    );
  }
  function retryHold(holdId) {
    try {
      id(holdId);
    } catch {
      return Promise.reject(fail());
    }
    return invoke(
      async () => submitCore(await attemptedCapsule(holdId), "retry"),
      true,
    );
  }
  function submit(capsuleDigest) {
    try {
      id(capsuleDigest);
    } catch {
      return Promise.reject(fail());
    }
    return invoke(() => submitCore(capsuleDigest, null), true);
  }
  async function submitCore(capsuleDigest, mode) {
    const gated = mode === "retry" || mode === "reproof";
    {
      let prepared,
        outcome,
        operationError,
        operationFailed = false;
      try {
        prepared = await prepareRailgunPoiDisclosurePlan({
          identity,
          enrollment,
          coordinator,
          capsuleDigest,
          signal: lifetime,
          ...(mode === "retry" ? { retry: true } : {}),
          ...(mode === "reproof" ? { reproof: true } : {}),
        });
        current();
        if (prepared.status !== "prepared")
          outcome = Object.freeze({
            status: "refused",
            stage: "plan:" + prepared.stage,
          });
        else {
          const checked = await revalidateRailgunPoiDisclosurePlan({
            identity,
            enrollment,
            coordinator,
            plan: prepared.plan,
            signal: lifetime,
          });
          current();
          if (checked.status !== "current")
            outcome = Object.freeze({
              status: "refused",
              stage: "plan:" + checked.stage,
            });
          else
            outcome = await submitRailgunRetainedPoi({
              ...common,
              plan: prepared.plan,
              review,
              // The explicit retry or replacement reads only the session's own
              // last owned POI observation; it never accepts caller-supplied status.
              ...(gated ? { retryEvidence: ownedPoiEvidence } : {}),
            });
        }
      } catch (error) {
        operationFailed = true;
        operationError = error;
      }
      if (prepared?.status === "prepared") await drain(prepared);
      if (operationFailed) throw operationError;
      current();
      assert.ok(["refused", "recovery-required"].includes(outcome.status));
      return outcome;
    }
  }
  function recoverOutput(capsuleDigest, attempted) {
    try {
      id(capsuleDigest);
    } catch {
      return Promise.reject(fail());
    }
    return invoke(async () => {
      await review(
        disclosure(
          attempted ? "recover-attempted-output" : "recover-output",
          capsuleDigest,
        ),
      );
      current();
      const result = await (
        attempted
          ? recoverRailgunAttemptedPoiOutput
          : recoverRailgunPoiOutputCompleted
      )({
        identity,
        enrollment,
        coordinator,
        archive,
        capsuleDigest,
        ...(attempted ? {} : { sourceDestination: destination }),
        signal: lifetime,
      });
      current();
      if (result.status !== "matched")
        return Object.freeze({ status: "refused", stage: result.stage });
      assert.equal(result.capsuleDigest, capsuleDigest);
      assert.equal(result.outputMatched, true);
      assert.equal(result.membershipAuthenticated, false);
      assert.equal(result.spendingEnabled, false);
      if (attempted) {
        assert.equal(result.recordState, "attempted");
        id(result.attemptBodySha256);
        for (const key of [
          "eligibilityEstablished",
          "attemptOutcomeKnown",
          "submissionAccepted",
          "retryEnabled",
        ])
          assert.equal(result[key], false);
      }
      return Object.freeze({
        status: "matched",
        ...(attempted
          ? {
              recordState: "attempted",
              attemptBodySha256: result.attemptBodySha256,
              eligibilityEstablished: false,
              attemptOutcomeKnown: false,
              submissionAccepted: false,
              retryEnabled: false,
            }
          : {}),
        capsuleDigest: result.capsuleDigest,
        revision: result.revision,
        payloadSha256: result.payloadSha256,
        outputMatched: true,
        proofVerified: false,
        originalInputReconstructed: false,
        originalRootsAccepted: false,
        membershipAuthenticated: false,
        sourceAuthenticated: false,
        disclosureEnabled: false,
        spendingEnabled: false,
      });
    });
  }
  lifetime.addEventListener("abort", close);
  current();
  return Object.freeze({
    prepareShield: (holdId) => prepare(holdId, "Shield"),
    prepareTransact: (holdId) => prepare(holdId, "Transact"),
    submit: (capsuleDigest) => submit(capsuleDigest),
    recoverOutput: (capsuleDigest) => recoverOutput(capsuleDigest, false),
    recoverAttemptedOutput: (capsuleDigest) =>
      recoverOutput(capsuleDigest, true),
    // One explicit second handoff of a hold's attempted entry's identical
    // request, gated by fresh owned Missing status. Never automatic.
    retryAttempted: (holdId) => retryHold(holdId),
    // After the spent retry, one replacement proof under the current POI
    // circuit for a retired-circuit original, then its single explicit handoff,
    // gated by fresh owned Missing status. Never automatic.
    reproveRetiredShield: (holdId) => reproveRetired(holdId, "Shield"),
    reproveRetiredTransact: (holdId) => reproveRetired(holdId, "Transact"),
    submitReproof: (holdId) => reproofHold(holdId),
    close,
    closed,
    signal: lifetime,
  });
}
module.exports = Object.freeze({ createRailgunPoiLane });
