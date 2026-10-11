"use strict";
const assert = require("node:assert/strict");
/** Real installed guide and encrypted application state; one fresh process per
 * explicit continuation. Fixture-only consent, chain and services. */
async function runGuided({ actor, chain, server, write, installation, timing = false, timingBaseline = false, baselineReadDelayMs = 1250 }) {
  const traces = { alice: [], bob: [] };
  let bobAddress, transferHash;
  async function next(name, extra = {}, readDelayMs) {
    const before = await actor(name, "journey-status");
    const expectedSends = extra.expectedSends ?? (
      ["shield", "payment", "payment-submit"].includes(before.step) &&
      !before.interrupted &&
      !extra.fixtureCrash
        ? 1
        : 0);
    const delayed = timing && ['shield', 'payment', 'payment-submit'].includes(before.step);
    server.setReadDelay(readDelayMs ?? (delayed ? 1250 : 0));
    let result;
    try {
      result = await actor(name, "journey-next", {
        bobAddress, transferHash, expectedSends,
        ...(timing && before.step === 'shield' ? { shieldReviewDelayMs: 45000 } : {}),
        ...extra,
      });
    } finally { server.setReadDelay(0); }
    traces[name].push({ before: before.step, after: result.step ?? "crashed" });
    if (expectedSends && !extra.fixtureCrash && !extra.expectedRefusal)
      await chain.mine();
    assert.notEqual(result.step, "diagnosis");
    return result;
  }
  for (const name of ["alice", "bob"]) await actor(name, "journey-start");
  // Bob obtains his address before Alice pays. Deliberate clean pause and a lost
  // wallet completion result exercise the real application's durable navigation.
  for (let i = 0; i < 20; i++) {
    const status = await actor("bob", "journey-status");
    if (status.step === "initial-scan" && !traces.bob.some((t) => t.paused)) {
      const paused = await next("bob", { pauseScan: true });
      assert.equal(paused.step, "initial-scan");
      traces.bob.push({ paused: true });
      continue;
    }
    if (status.step === "wallet") {
      const crashed = await next("bob", {
        fixtureCrash: "before-guide-result",
      });
      assert.equal(crashed.expectedCrash, true);
      continue;
    }
    if (status.step === "input-scan") {
      bobAddress = status.railgunAddress;
      break;
    }
    await next("bob");
  }
  assert.ok(bobAddress);
  let retainedCrash = false,
    poiCrash = false,
    shieldCrash = false,
    shieldDeclined = false;
  for (let i = 0; i < 65; i++) {
    const status = await actor("alice", "journey-status");
    if (status.step === "complete") {
      transferHash = status.transferTransaction;
      break;
    }
    if (status.step === "shield" && !shieldDeclined) {
      await next("alice", {
        refusePreparation: true,
        expectedSends: 0,
        expectedRefusal: "RAILGUN_KOHAKU_REFUSED",
      });
      shieldDeclined = true;
      continue;
    }
    if (status.step === "shield" && !shieldCrash) {
      const crashed = await next("alice", {
        fixtureCrash: "before-guide-result",
        crashExpectedSends: 1,
      });
      assert.equal(crashed.expectedCrash, true);
      await chain.mine();
      shieldCrash = true;
      continue;
    }
    if (status.step === "payment" && !retainedCrash) {
      const crashed = await next("alice", { fixtureCrash: "after-prepared" });
      assert.equal(crashed.expectedCrash, true);
      retainedCrash = true;
      continue;
    }
    if (timingBaseline && status.step === "payment-submit") {
      const sends = baselineReadDelayMs === 0 ? 1 : 0;
      const result = await next("alice", { expectedSends: sends }, baselineReadDelayMs);
      assert.equal(result.step, "payment-observe");
      if (sends) assert.equal(result.result.outcome.status, "acknowledged");
      else assert.deepEqual(result.result.outcome, {status: "recovery-required", stage: "preflight"});
      assert.equal(chain.state().transactions.length, 1 + sends);
      write("GUIDED-STEPS.json", traces);
      return {passed: true, variant: "guided-timing-baseline", installation,
        control: sends ? "zero-delay cold submission succeeds" : "cold submission refuses at preflight with 1250ms reads",
        coldReadDelayMs: baselineReadDelayMs,
        transactions: 1 + sends, coldBroadcastRequests: sends,
        scope: "synthetic latency control of the pinned previous tar; not an end-to-end pass"};
    }
    if (status.step === "payment-submit") server.dropNextSendResponse();
    if (status.step === "poi-submit" && !poiCrash) {
      const crashed = await next("alice", {
        fixtureCrash: "before-guide-result",
      });
      assert.equal(crashed.expectedCrash, true);
      poiCrash = true;
      continue;
    }
    await next("alice");
  }
  assert.ok(transferHash);
  assert.ok(retainedCrash && poiCrash);
  assert.equal(chain.state().transactions.length, 2);
  // Bob discovers the transaction with his own scan and credentials in subsequent
  // cold processes. Nothing is copied from Alice's store.
  let stagingRefused = false, retainedBobPayment = false;
  for (let i = 0; i < 40; i++) {
    const status = await actor("bob", "journey-status");
    if (status.step === "complete") break;
    if (status.step === "payment" && !stagingRefused) {
      server.refuseNextTxid();
      await next("bob", {
        expectedRefusal: "RAILGUN_KOHAKU_PRIVATE_ADAPTER_REFUSED",
        expectedSends: 0,
      });
      assert.equal((await actor("bob", "journey-status")).step, "hold-find");
      stagingRefused = true;
      continue;
    }
    if (
      status.step === "hold-find" &&
      stagingRefused &&
      !traces.bob.some((t) => t.historyUnavailable)
    ) {
      await next("bob", {
        expectedRefusal: "RAILGUN_PRIVATE_RECOVERY_HISTORY_REFUSED",
        expectedSends: 0,
      });
      assert.equal((await actor("bob", "journey-status")).step, "payment-recheck");
      traces.bob.push({ historyUnavailable: true });
      continue;
    }
    if (timing && status.step === "payment" && stagingRefused &&
        !status.interrupted && !retainedBobPayment) {
      // Retain the Transact-input proof before broadcast as well. Both actors'
      // cold submissions must succeed under the same network latency.
      const crashed = await next("bob", { fixtureCrash: "after-prepared" });
      assert.equal(crashed.expectedCrash, true);
      retainedBobPayment = true;
      continue;
    }
    await next("bob");
  }
  assert.equal((await actor("bob", "journey-status")).step, "complete");
  assert.ok(traces.bob.some(t => t.historyUnavailable));
  assert.equal(traces.bob.filter(t => t.before === "payment").length, timing ? 3 : 2);
  if (timing) {
    assert.ok(retainedBobPayment);
    assert.equal(traces.bob.filter(t => t.before === "payment-submit").length, 1);
  }
  for (const name of ["alice", "bob"])
    assert.equal(
      (await actor(name, "notes")).notes.filter((n) => n.spentTxid === false)
        .length,
      0,
    );
  // The unrelated independently initialized account must discover no received note.
  await actor("charlie", "account-create");
  await actor("charlie", "scan");
  await actor("charlie", "wallet-rebuild");
  assert.equal((await actor("charlie", "notes")).notes.length, 0);
  chain.assertClean();
  assert.equal(chain.state().transactions.length, 3);
  assert.equal(
    server.methods.filter((m) => m === "eth_sendRawTransaction").length,
    3,
  );
  assert.ok(chain.report().poiVerification.verified >= 1);
  assert.ok(server.counts.peakRequests <= 8);
  write("GUIDED-STEPS.json", traces);
  return {
    passed: true,
    variant: timing ? "guided-timing" : "guided",
    ...(timing ? { timing: { publicReadDelayMs: 1250, shieldHumanReviewDelayMs: 45000,
      delayedSteps: ['shield', 'payment', 'payment-submit'], signingTail: 'real encrypted custody and signer; unchanged evidence ages' } } : {}),
    installation,
    transactions: 3,
    broadcastRequests: 3,
    independentActors: 3,
    peakConcurrentRequests: server.counts.peakRequests,
    poiVerification: chain.report().poiVerification,
    interruptions: {
      pausedScan: true,
      lostWalletResult: true,
      declinedShield: true,
      lostShieldResult: shieldCrash,
      retainedPayment: true,
      unknownDelivery: true,
      lostPoiResult: true,
      stagingRefusal: stagingRefused,
      ...(timing ? { retainedBobPayment } : {}),
    },
    scope:
      "synthetic chain/list over loopback SOCKS/TLS; genuine installed guide, owners, encrypted custody and current-circuit proof verification; no live claim",
  };
}
module.exports = { runGuided };
