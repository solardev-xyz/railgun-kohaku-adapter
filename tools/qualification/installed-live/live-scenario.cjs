/** Installed-package live journey modes over the genuine public owner facade
 * only. One mode per process. Reports are aggregate-only: transaction hashes
 * are public chain data; hold, note and capsule identities appear only as
 * sha256. There is no resend, retry of a send or POI submission, fallback
 * endpoint or loosened freshness. Every bounded read/disclosure unit is
 * reserved durably in the campaign ledger before it is invoked.
 */
'use strict';
const assert = require('assert/strict');
const { createHash } = require('crypto');
const ledger = require('./live-ledger.cjs');
const CHAIN_ID = 11155111;
const WETH = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';
const GAS_LIMIT = 1500000n;
const MAX_GAS_FEE = 2000000000000000n;
const MIN_CONFIRMATIONS = 12;
const RANGE = 100000;
const sha = (value) => createHash('sha256').update(String(value)).digest('hex');
const keys = (value) => Object.keys(value ?? {}).sort();
const bare = (value) => String(value).replace(/^0x/, '').toLowerCase();
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(Object.assign(Error('Live journey cancelled'), { code: 'LIVE_JOURNEY_CANCELLED' }));
      },
      { once: true }
    );
  });
async function closeLane(lane) {
  if (!lane) return;
  lane.close();
  await lane.closed;
}
async function closeSession(session) {
  if (!session) return;
  session.close();
  await session.closed;
}
// The fixed schedule the legacy live qualifier proved (843c0cfc
// qualify-railgun-live.js): 100000-block windows below block 5700000, where
// Railgun Sepolia is sparse, and 20000-block windows from there. Windows are
// aligned to their size from any cursor and capped at the anchor.
const DENSE_FROM = 5700000,
  NARROW = 20000;
function rangesTo(from, anchor) {
  assert.ok(Number.isSafeInteger(from) && from >= 0);
  const result = [];
  for (let start = from; start <= anchor.number; ) {
    const size = start < DENSE_FROM ? RANGE : NARROW;
    let to = start - (start % size) + size - 1;
    if (start < DENSE_FROM) to = Math.min(to, DENSE_FROM - 1);
    to = Math.min(to, anchor.number);
    result.push(Object.freeze({ to, anchor: Object.freeze({ ...anchor }) }));
    start = to + 1;
  }
  return result;
}
const RANGE_SPACING_MS = 1000;
// Advances the public scan range by range from the coordinator's checkpoint.
// Each window is budgeted before it is invoked; each returned checkpoint is
// recorded durably, so a later resume starts from an exact lower bound.
async function scanTo(context, session, from, anchor) {
  // Synthetic only: the stopped continuation's runner (100000-block windows
  // from 0, no targets or checkpoints recorded), to reproduce its state.
  const legacy = context.params.legacyPlan === true;
  if (legacy) assert.equal(context.synthetic, true, 'The legacy plan is synthetic only');
  const ranges = legacy ? legacyRangesTo(from, anchor) : rangesTo(from, anchor);
  const statuses = {};
  for (const [index, range] of ranges.entries()) {
    if (index > 0 && !context.synthetic) await sleep(RANGE_SPACING_MS, context.signal);
    budget(context, 'scan-range', legacy ? undefined : { target: range.to });
    const result = await session.advancePublic(range);
    assert.equal(result.to?.number, range.to);
    fault(context, 'exit-after-advance', range.to);
    if (!legacy) ledger.progress(context.profile, context.header, result.to.number, result.to.hash);
    statuses[result.status] = (statuses[result.status] || 0) + 1;
  }
  return { ranges: ranges.length, statuses };
}
function legacyRangesTo(from, anchor) {
  const result = [];
  for (let start = from; start <= anchor.number; ) {
    const to = Math.min(start + RANGE - 1 - (start % RANGE), anchor.number);
    result.push(Object.freeze({ to, anchor: Object.freeze({ ...anchor }) }));
    start = to + 1;
  }
  return result;
}
// The exact resume candidates. After the last recorded checkpoint L, the last
// window attempted (target T) either committed nothing (A: continue from
// L + 1) or was applied without a recorded checkpoint (B: continue from
// T + 1). Before any checkpoint the launcher-verified claim supplies L and T.
// A comes first; B only after a recorded A attempt made no progress. A
// wrong guess is refused by the coordinator before any request or write.
function resumePlan(context) {
  const state = ledger.inspect(context.profile, context.header);
  const last = state.progress.at(-1);
  const claim = context.header.binding.resumeFrom;
  const lower = last ? last.to : claim.checkpoint;
  const windows = (state.budgets['scan-range'] ?? []).filter((row) => Number.isSafeInteger(row.target));
  const attempted = windows.at(-1);
  const upper = last ? (attempted && attempted.target > last.to ? attempted.target : null) : claim.failedTarget;
  if (upper === null) return { mode: 'exact', from: lower + 1 };
  const tried = state.attempts.filter((row) => row.lower === lower && row.upper === upper);
  assert.ok(tried.length < 2, 'Both resume candidates were tried');
  const mode = tried.length === 0 ? 'A' : 'B';
  ledger.resumeAttempt(context.profile, context.header, mode, lower, upper);
  return { mode, from: mode === 'A' ? lower + 1 : upper + 1, lower, upper };
}
// The scan continues exactly where the last recorded checkpoint ended.
function assertCheckpoint(context, number) {
  const last = ledger.inspect(context.profile, context.header).progress.at(-1);
  if (last) assert.equal(last.to, number, 'Scan checkpoint');
}
// Report projections: hold and note identities leave only as sha256.
function publicOutput(output) {
  if (!output) return null;
  if (output.kind === 'shielded') return { kind: 'shielded', noteIdSha256: sha(output.noteId) };
  if (output.kind === 'partial-unshield') {
    const { changeNoteId, ...rest } = output;
    return { ...rest, changeNoteIdSha256: sha(changeNoteId) };
  }
  return { ...output };
}
function publicResolution(resolution) {
  if (!resolution) return null;
  return {
    status: resolution.status,
    kind: resolution.kind,
    holdIdSha256: sha(resolution.holdId),
    transactionHash: resolution.transactionHash,
    outcome: resolution.outcome,
    finalizedBlockNumber: resolution.finalizedBlockNumber,
    output: publicOutput(resolution.output),
    releasesHold: resolution.releasesHold,
    retryEnabled: resolution.retryEnabled,
    trust: resolution.trust,
  };
}
function noteSummary(notes) {
  const unspent = notes.filter((note) => note.spentTxid === false);
  return {
    count: notes.length,
    unspent: unspent.length,
    unspentAmount: unspent.reduce((sum, note) => sum + BigInt(note.amount), 0n).toString(),
    weth: notes.filter((note) => note.asset?.contract?.toLowerCase() === WETH).length,
  };
}
// Synthetic-only crash points for the reconcile path; a live run refuses any.
const FAULTS = Object.freeze(['exit-before-finish', 'exit-before-report', 'history-unavailable-after-send', 'exit-after-advance']);
function fault(context, point, target) {
  const requested = context.params.fault ?? null;
  if (requested === null) return;
  assert.ok(FAULTS.includes(requested));
  assert.equal(context.synthetic, true, 'Faults are synthetic only');
  if (requested !== point) return;
  if (point === 'exit-after-advance' && target !== context.params.faultAt) return;
  if (point === 'history-unavailable-after-send')
    throw Object.assign(Error('Synthetic history read failure'), { code: 'LIVE_SYNTHETIC_HISTORY_UNAVAILABLE' });
  context.crash();
}
function budget(context, kind, extra) {
  return ledger.consume(context.profile, context.header, kind, ledger.policyFor(context.header.caps, kind), Date.now(), extra);
}
function heldReviews(owner, milestone, seen, expectedRpc) {
  assert.equal(typeof expectedRpc, 'string');
  return {
    reviewDisclosures(summary, context) {
      assert.equal(context.signal.aborted, false);
      assert.equal(summary.chainId, CHAIN_ID);
      assert.equal(summary.retryEnabled, false);
      // The one fixed campaign endpoint over the wallet Tor transport.
      assert.deepEqual(Object.keys(summary.destination).sort(), ['transport', 'url']);
      assert.equal(new URL(summary.destination.url).href, expectedRpc);
      assert.equal(summary.destination.transport, 'tor-experimental');
      if (summary.purpose === 'railgun-held-submission-observation-v1') {
        assert.equal(summary.submitter, owner);
        assert.equal(summary.sendEnabled, false);
        assert.equal(summary.signingEnabled, false);
        assert.equal(summary.holdReleaseEnabled, false);
      } else {
        assert.equal(summary.purpose, 'railgun-held-submission-resolution-v1');
        assert.equal(summary.releasesHold, false);
        assert.equal(summary.minimumConfirmations, MIN_CONFIRMATIONS);
      }
      seen.push({ purpose: summary.purpose, destination: summary.destination ?? null });
      milestone('held-review:' + summary.purpose);
      return true;
    },
  };
}
async function withHeld(session, signal, reviews, use) {
  const lane = await session.openSubmissionRecovery({ signal, reviewDisclosures: reviews.reviewDisclosures });
  try {
    return await use(lane);
  } finally {
    await closeLane(lane);
  }
}
function assertDestinations(destinations, expectedRpc) {
  assert.ok(destinations && typeof destinations === 'object');
  for (const key of ['retainedSource', 'protocolRpc', 'transactionRpc'])
    if (Object.hasOwn(destinations, key)) assert.equal(new URL(destinations[key]).href, expectedRpc);
  assert.ok(Object.hasOwn(destinations, 'transactionRpc'));
}
function recoveryOptions(owner, kind, milestone, seen, send, expectedRpc) {
  return {
    gasLimit: GAS_LIMIT,
    maxGasFee: MAX_GAS_FEE,
    reviewDisclosures(summary, signal) {
      assert.equal(signal.aborted, false);
      seen.push({ disclosure: summary.purpose ?? null, keys: keys(summary) });
      milestone('recovery-disclosure:' + (summary.purpose ?? 'none'));
      if (!send) throw Error('No submission disclosure is authorized in this mode');
      assert.equal(summary.purpose, 'railgun-recovered-private-submission');
      assert.equal(summary.operation, kind);
      assertDestinations(summary.destinations, expectedRpc);
      assert.equal(summary.automaticRetry, false);
      assert.equal(summary.newSpendingSignature, false);
      return true;
    },
    reviewTransaction(summary) {
      seen.push({ transaction: summary.operation ?? null, keys: keys(summary) });
      if (!send) throw Error('No transaction is authorized in this mode');
      assert.equal(summary.from.toLowerCase(), owner);
      assert.equal(summary.operation, kind);
      assert.equal(String(summary.maxGasFee), MAX_GAS_FEE.toString());
      assert.equal(summary.chainStateVerified, false);
      return true;
    },
  };
}
async function holds(session, signal, owner, milestone) {
  const lane = await session.openRecovery({ ...recoveryOptions(owner, null, milestone, [], false, 'unused'), signal });
  try {
    const page = await lane.history();
    assert.equal(page.nextAfter, null);
    return page.records;
  } finally {
    await closeLane(lane);
  }
}
// The one hold of this kind whose id hash was bound earlier in the campaign.
function bound(records, kind, holdIdSha256) {
  assert.match(holdIdSha256, /^[0-9a-f]{64}$/);
  const rows = records.filter((record) => sha(record.holdId) === holdIdSha256);
  assert.equal(rows.length, 1, 'The bound held operation');
  assert.equal(rows[0].kind, kind);
  return rows[0];
}
// The original held report's facts, normalized from the live L-A report or
// the synthetic legacy harness report. Identity comes from the report bytes
// the launcher verified against the campaign binding.
function heldFacts(report, owner) {
  const facts =
    report.journey !== undefined
      ? {
          owner: report.owner,
          mode: report.mode,
          spendRequest: report.spendRequest,
          attempted: report.spend.attempted,
          journaled: report.spend.journaled,
          state: report.liveness.state,
          inputHeld: report.liveness.inputHeld,
          shieldTransactionHash: report.chain.shieldTransactionHash,
        }
      : {
          owner: report.scenario.continuity.submitter,
          mode: 'transfer',
          spendRequest: report.scenario.heldInput.spendRequest,
          attempted: report.scenario.spend.attempted,
          journaled: report.scenario.spend.journaled,
          state: report.scenario.liveness,
          inputHeld: true,
          shieldTransactionHash: report.scenario.heldInput.shieldTransactionHash,
        };
  assert.equal(facts.owner.toLowerCase(), owner);
  assert.equal(facts.mode, 'transfer');
  assert.equal(facts.spendRequest.kind, 'railgun-private-transfer');
  assert.equal(facts.spendRequest.recipient, 'self');
  assert.equal(facts.spendRequest.fullInputValue, true);
  assert.equal(facts.attempted, false);
  assert.equal(facts.journaled, false);
  assert.equal(facts.state, 'proved-unsent');
  assert.equal(facts.inputHeld, true);
  assert.match(facts.shieldTransactionHash, /^0x[0-9a-f]{64}$/);
  return facts;
}
function finishReport(context, value) {
  return { ...value, ledgerHeaderSha256: sha(JSON.stringify(context.header)) };
}
function assertChained(context, previous) {
  assert.equal(previous.ledgerHeaderSha256, sha(JSON.stringify(context.header)), 'Report from another campaign');
}
// Rebuild public and wallet generations for the current package policy, then
// establish the exact held state without any send.
async function rebuild(context) {
  const { facade, signal, milestone, owner, readFinalized, params } = context;
  const publicCache = params.publicCache ?? 'new';
  assert.ok(['new', 'pending'].includes(publicCache));
  budget(context, 'scan-open:' + publicCache);
  const seen = [];
  let session, lane;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal, publicCache });
    const anchor = await readFinalized();
    // A resume starts after its exact lower bound: the last recorded
    // checkpoint, else the evidence-bound claim the launcher verified. The
    // first window is the schedule's next one; if the failed window had in
    // fact been applied, the coordinator refuses it before any request.
    let from = 0,
      resume = null;
    if (context.header.name === ledger.RESUME) {
      assert.equal(publicCache, 'pending');
      resume = resumePlan(context);
      from = resume.from;
    }
    const { ranges, statuses } = await scanTo(context, session, from, anchor);
    milestone('public-rebuilt:' + ranges);
    const facts = heldFacts(context.heldReport, owner);
    lane = await session.openRead({ wallet: 'new', signal });
    const notes = await lane.notes(undefined, true);
    await closeLane(lane);
    lane = null;
    lane = await session.openRecovery({ ...recoveryOptions(owner, 'railgun-private-transfer', milestone, seen, false, context.expectedRpc), signal });
    const page = await lane.history();
    assert.equal(page.nextAfter, null);
    await closeLane(lane);
    lane = null;
    // Bind the original held report to exactly one current hold: its
    // authenticated input note must be the note that report's Shield created,
    // unspent in this wallet scan, spent in full to the account's own instance.
    // Never by amount, position or the only visible hold.
    const candidates = page.records.filter((record) => record.kind === 'railgun-private-transfer');
    const descriptors = await withHeld(session, signal, heldReviews(owner, milestone, [], context.expectedRpc), async (l) => {
      const rows = [];
      for (const record of candidates) rows.push(await l.describe(record.holdId));
      return rows;
    });
    const matches = descriptors.filter((descriptor) => {
      const inputs = notes.filter((note) => note.id === descriptor.input.noteId);
      return inputs.length === 1 && bare(inputs[0].txid) === bare(facts.shieldTransactionHash);
    });
    assert.equal(matches.length, 1, 'Exactly one hold spends the held report input');
    const descriptor = matches[0];
    const input = notes.filter((note) => note.id === descriptor.input.noteId)[0];
    assert.equal(input.spentTxid, false, 'The held input is spent in this scan');
    assert.equal(input.asset?.contract?.toLowerCase(), WETH);
    assert.deepEqual(descriptor.transfer, { recipient: 'own-instance', amount: String(input.amount) });
    const hold = page.records.find((record) => record.holdId === descriptor.holdId);
    assert.equal(hold.localState, 'proof-present');
    lane = await session.openRecovery({ ...recoveryOptions(owner, 'railgun-private-transfer', milestone, seen, false, context.expectedRpc), signal });
    const proof = await lane.resumeProof(hold.holdId);
    assert.equal(proof.status, 'proof-present');
    await closeLane(lane);
    lane = null;
    const held = [];
    budget(context, 'readback:transfer');
    const observed = await withHeld(session, signal, heldReviews(owner, milestone, held, context.expectedRpc), (l) => l.observe(hold.holdId));
    await closeSession(session);
    session = null;
    return finishReport(context, {
      schema: 'railgun-installed-live-rebuild-v1',
      publicCache,
      anchor,
      resumedFrom: from,
      resume,
      ranges,
      advanceStatuses: statuses,
      notes: noteSummary(notes),
      holds: page.records.length,
      holdIdSha256: sha(hold.holdId),
      heldBinding: {
        heldReportSha256: context.heldReportSha256,
        shieldTransactionHash: facts.shieldTransactionHash,
        inputNoteIdSha256: sha(descriptor.input.noteId),
        recipient: descriptor.transfer.recipient,
        amount: descriptor.transfer.amount,
        fullInputValue: true,
        unspentThrough: { anchor, source: 'wallet-scan', trust: 'unverified-rpc' },
      },
      holdState: hold.localState,
      transactionDigest: proof.transactionDigest,
      g1: { status: observed.status, transactionHash: observed.transactionHash ?? null },
      continuable: observed.status === 'unjournaled',
      reviews: { recovery: seen, held },
    });
  } finally {
    await closeLane(lane);
    await closeSession(session);
  }
}
function classify(outcome) {
  if (typeof outcome?.hash === 'string') return { classification: 'acknowledged', transactionHash: outcome.hash.toLowerCase() };
  if (outcome?.submissionStatus === 'unknown')
    return { classification: 'unknown', transactionHash: outcome.transactionHash.toLowerCase() };
  return { classification: 'not-acknowledged', status: outcome?.status ?? null, stage: outcome?.stage ?? null };
}
// The journal alone decides whether a not-acknowledged attempt was sent.
function readback(result, after) {
  if (result.classification === 'not-acknowledged' && after?.status === 'journaled')
    return { classification: 'unknown', transactionHash: after.transactionHash, readback: 'journal' };
  // Not a proof that nothing was sent: only that no attempt is journaled.
  if (result.classification === 'not-acknowledged') return { ...result, classification: 'unjournaled-after-refusal' };
  assert.equal(after?.transactionHash, result.transactionHash);
  return result;
}
// Send 1: the held transfer's original proof and signature, submitted once.
async function submit(context) {
  const { facade, signal, milestone, owner, previous, profile, header } = context;
  assert.equal(previous.schema, 'railgun-installed-live-rebuild-v1');
  assertChained(context, previous);
  assert.equal(previous.continuable, true);
  const seen = [],
    held = [];
  let session, lane;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    const hold = bound(await holds(session, signal, owner, milestone), 'railgun-private-transfer', previous.holdIdSha256);
    // The same authenticated descriptor the rebuild bound, before any reservation.
    const described = await withHeld(session, signal, heldReviews(owner, milestone, [], context.expectedRpc), (l) => l.describe(hold.holdId));
    assert.equal(sha(described.input.noteId), previous.heldBinding.inputNoteIdSha256);
    assert.deepEqual(described.transfer, { recipient: previous.heldBinding.recipient, amount: previous.heldBinding.amount });
    budget(context, 'readback:transfer');
    const before = await withHeld(session, signal, heldReviews(owner, milestone, held, context.expectedRpc), (l) => l.observe(hold.holdId));
    assert.equal(before.status, 'unjournaled', 'A journaled attempt exists: observation only');
    const attemptId = ledger.reserve(profile, header, 'transfer', { holdIdSha256: previous.holdIdSha256 });
    milestone('ledger-reserved:transfer');
    lane = await session.openRecovery({ ...recoveryOptions(owner, 'railgun-private-transfer', milestone, seen, true, context.expectedRpc), signal });
    let outcome,
      failure = null;
    try {
      outcome = await lane.submitStored(hold.holdId);
    } catch (error) {
      failure = typeof error?.code === 'string' ? error.code : 'unknown-error';
    }
    const immediate = failure ? { classification: 'not-acknowledged', error: failure } : classify(outcome);
    fault(context, 'exit-before-finish');
    // A known hash finishes the attempt at once; its readback is best effort.
    if (immediate.transactionHash) ledger.finish(profile, header, attemptId, immediate);
    fault(context, 'exit-before-report');
    await closeLane(lane).catch(() => milestone('lane-close-uncertain'));
    lane = null;
    let after = null;
    try {
      budget(context, 'readback:transfer');
      after = await withHeld(session, signal, heldReviews(owner, milestone, held, context.expectedRpc), (l) => l.observe(hold.holdId));
    } catch (error) {
      milestone('readback-unavailable:' + (error?.code ?? 'error'));
      // Without a hash the journal must decide: leave the attempt pending.
      if (!immediate.transactionHash) throw error;
    }
    const result = immediate.transactionHash ? immediate : readback(immediate, after);
    if (after && immediate.transactionHash && after.status === 'journaled') assert.equal(after.transactionHash, immediate.transactionHash);
    if (!immediate.transactionHash) ledger.finish(profile, header, attemptId, result);
    const sends = ledger.inspect(profile, header).sends;
    milestone('ledger-finished:transfer:' + result.classification);
    await closeSession(session);
    session = null;
    return finishReport(context, {
      schema: 'railgun-installed-live-submit-v1',
      send: 'transfer',
      holdIdSha256: previous.holdIdSha256,
      outcome: result,
      g1: after ? { status: after.status, observation: after.observation ?? null, transact: after.transact ?? null } : null,
      ledgerSends: sends.length,
      stop: result.classification === 'unjournaled-after-refusal',
      reviews: { recovery: seen, held },
    });
  } finally {
    await closeLane(lane);
    await closeSession(session);
  }
}
// Bounded observation of one journaled send; resolution only for a matched,
// finalized outcome with the live confirmation threshold. Each observation
// and resolution attempt is a durable budget unit with enforced spacing.
async function observe(context) {
  const { facade, signal, milestone, owner, previous, params } = context;
  assert.ok(['railgun-installed-live-submit-v1', 'railgun-installed-live-unshield-v1'].includes(previous.schema));
  assertChained(context, previous);
  assert.ok(previous.outcome.transactionHash, 'No journaled attempt to observe');
  const send = previous.send;
  const kind = send === 'transfer' ? 'railgun-private-transfer' : 'railgun-token-unshield';
  const spacing = context.header.caps.observePerSend.minSpacingMs;
  const maxMs = params.maxMs ?? 30 * 60000;
  const held = [];
  const started = Date.now();
  let session,
    observation,
    resolution = null,
    attempts = 0;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    const hold = bound(await holds(session, signal, owner, milestone), kind, previous.holdIdSha256);
    for (;;) {
      attempts++;
      budget(context, 'observe:' + send);
      observation = await withHeld(session, signal, heldReviews(owner, milestone, held, context.expectedRpc), (l) => l.observe(hold.holdId));
      assert.equal(observation.transactionHash, previous.outcome.transactionHash);
      milestone('observed:' + JSON.stringify(observation.observation));
      const status = observation.observation?.status;
      if (observation.resolved) break;
      if (status === 'reverted' || status === 'nonce-consumed' || observation.transact?.status === 'anomaly') break;
      const ready =
        status === 'included' &&
        observation.transact?.status === 'matched' &&
        observation.observation.confirmations >= MIN_CONFIRMATIONS;
      if (Date.now() - started + spacing > maxMs) break;
      await sleep(spacing, signal);
      if (ready) {
        budget(context, 'observe:' + send);
        const tried = await withHeld(session, signal, heldReviews(owner, milestone, held, context.expectedRpc), (l) =>
          l.resolve(hold.holdId, { minimumConfirmations: MIN_CONFIRMATIONS })
        ).then(
          (value) => ({ value }),
          (error) => ({ code: error?.code ?? 'unknown-error' })
        );
        milestone('resolve:' + JSON.stringify(tried.value ? tried.value.outcome : tried.code));
        if (tried.value) {
          resolution = tried.value;
          break;
        }
        if (Date.now() - started + spacing > maxMs) break;
        await sleep(spacing, signal);
      }
    }
    await closeSession(session);
    session = null;
    // An earlier resolution counts only with the same live evidence policy.
    const matched =
      resolution?.outcome === 'matched' ||
      (observation.resolved === true &&
        observation.observation?.status === 'included' &&
        observation.transact?.status === 'matched' &&
        observation.observation.confirmations >= MIN_CONFIRMATIONS);
    return finishReport(context, {
      schema: 'railgun-installed-live-observe-v1',
      send,
      holdIdSha256: previous.holdIdSha256,
      transactionHash: previous.outcome.transactionHash,
      attempts,
      final: {
        observation: observation.observation,
        transact: observation.transact,
        output: publicOutput(observation.output),
        resolved: observation.resolved || !!resolution,
      },
      resolution: publicResolution(resolution),
      continuable: matched,
      stop:
        !matched &&
        (resolution?.outcome === 'reverted' ||
          observation.observation?.status === 'reverted' ||
          observation.transact?.status === 'anomaly' ||
          observation.observation?.status === 'nonce-consumed'),
      unshield: send === 'unshield' ? previous.unshield ?? null : undefined,
      reviews: { held },
    });
  } finally {
    await closeSession(session);
  }
}
async function readNotes(session, signal, wallet) {
  const lane = await session.openRead({ wallet, signal });
  try {
    return await lane.notes(undefined, true);
  } finally {
    await closeLane(lane);
  }
}
function transferJoin(notes, transactionHash) {
  const spent = notes.filter((note) => note.spentTxid !== false && bare(note.spentTxid) === bare(transactionHash));
  const created = notes.filter((note) => note.txid !== undefined && bare(note.txid) === bare(transactionHash));
  assert.equal(spent.length, 1, 'Exactly one input spent by the transfer');
  assert.equal(created.length, 1, 'Exactly one output created by the transfer');
  return { input: spent[0], output: created[0] };
}
// Cold receive, TXID, then exactly one retained POI submission for the
// transfer, reserved durably before it can leave. No resend after loss.
async function poi(context) {
  const { facade, signal, milestone, owner, previous, rebuildReport, readFinalized, profile, header } = context;
  assert.equal(previous.schema, 'railgun-installed-live-observe-v1');
  assertChained(context, previous);
  assertChained(context, rebuildReport);
  assert.equal(previous.send, 'transfer');
  assert.equal(previous.continuable, true);
  const handed = ledger.inspect(profile, header).poi;
  assert.equal(handed.pending, null, 'A POI submission was already handed off: status/recovery only');
  const transactionHash = previous.transactionHash;
  let session, lane;
  const consents = [];
  const accept = (label) => (summary, review) => {
    assert.equal((review?.signal ?? review)?.aborted, false);
    consents.push({ label, purpose: summary?.purpose ?? null });
    return true;
  };
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    const anchor = await readFinalized();
    assertCheckpoint(context, rebuildReport.anchor.number);
    const { ranges } = await scanTo(context, session, rebuildReport.anchor.number + 1, anchor);
    milestone('public-advanced:' + ranges);
    const notes = await readNotes(session, signal, 'advance');
    const { input, output } = transferJoin(notes, transactionHash);
    assert.equal(output.spentTxid, false);
    const txid = [];
    for (let call = 0; ; call++) {
      const mode = call === 0 ? 'initialize' : 'advance';
      budget(context, 'txid-page');
      const result = await session
        .synchronizeTxid({ mode, signal, reviewDisclosure: accept('txid-' + mode) })
        .then((value) => ({ value }), (error) => ({ code: error?.code ?? 'unknown-error' }));
      txid.push(result.value ? { count: result.value.count, latest: result.value.serviceLatestIndex } : { code: result.code });
      if (result.code) throw Object.assign(Error('TXID synchronization refused'), { code: result.code });
      // Never truncate: reaching capacity before the transfer is a stop.
      assert.equal(result.value.capacityReached, false, 'TXID capacity reached');
      if (result.value.serviceLatestIndex !== null && result.value.count === result.value.serviceLatestIndex + 1) break;
    }
    milestone('txid:' + JSON.stringify(txid.at(-1)));
    // One companion lane at a time: identify the hold before the POI lane.
    const hold = bound(await holds(session, signal, owner, milestone), 'railgun-private-transfer', previous.holdIdSha256);
    lane = await session.openPoiRecovery({ signal, reviewDisclosures: accept('poi') });
    // The transfer spent a Shield note: the Shield creator route. The owner
    // reauthenticates the actual creator and refuses any mismatch.
    const prepared = await lane.prepareShield(hold.holdId);
    milestone('poi-prepared:' + prepared.status);
    assert.equal(prepared.status, 'prepared');
    const recovered = await lane.recoverOutput(prepared.capsuleDigest);
    assert.equal(recovered.status, 'matched');
    const handoffId = ledger.poiReserve(profile, header, {
      capsuleDigestSha256: sha(prepared.capsuleDigest),
      payloadSha256: prepared.payloadSha256,
    });
    const submitted = await lane.submit(prepared.capsuleDigest).then(
      (value) => value,
      (error) => ({ status: 'error', code: error?.code ?? 'unknown-error' })
    );
    ledger.poiFinish(profile, header, handoffId, {
      status: submitted.status,
      stage: submitted.stage ?? null,
      classification: submitted.response?.classification ?? null,
      code: submitted.code ?? null,
    });
    milestone('poi-submitted:' + JSON.stringify({ status: submitted.status, classification: submitted.response?.classification ?? null }));
    await closeLane(lane);
    lane = null;
    lane = await session.openPoiRecovery({ signal, reviewDisclosures: accept('poi-attempted') });
    const attempted = await lane.recoverAttemptedOutput(prepared.capsuleDigest);
    await closeLane(lane);
    lane = null;
    await closeSession(session);
    session = null;
    return finishReport(context, {
      schema: 'railgun-installed-live-poi-v1',
      holdIdSha256: previous.holdIdSha256,
      transactionHash,
      anchor,
      ranges,
      inputAmount: String(input.amount),
      outputNoteIdSha256: sha(output.id),
      outputAmount: String(output.amount),
      txid,
      poi: {
        prepared: { status: prepared.status, capsuleDigestSha256: sha(prepared.capsuleDigest), payloadSha256: prepared.payloadSha256 },
        recovered: recovered.status,
        submitted: { status: submitted.status, stage: submitted.stage ?? null, response: submitted.response ?? null, code: submitted.code ?? null },
        attempted: attempted.status,
      },
      consents,
    });
  } finally {
    await closeLane(lane);
    await closeSession(session);
  }
}
// One budgeted list-status observation of the exact transfer output.
async function poiStatus(context) {
  const { facade, signal, milestone, previous } = context;
  assert.ok(['railgun-installed-live-poi-v1', 'railgun-installed-live-poi-status-v1'].includes(previous.schema));
  assertChained(context, previous);
  const consents = [];
  let session;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    const notes = await readNotes(session, signal, 'advance');
    const created = notes.filter((note) => note.txid !== undefined && bare(note.txid) === bare(previous.transactionHash));
    assert.equal(created.length, 1);
    assert.equal(sha(created[0].id), previous.outputNoteIdSha256);
    const unit = budget(context, 'poi-status');
    const owned = await session
      .observeOwnedPoi({
        noteId: created[0].id,
        signal,
        reviewDisclosure: (summary, review) => {
          assert.equal(review.signal.aborted, false);
          consents.push(summary?.purpose ?? null);
          return true;
        },
      })
      .then((value) => value, (error) => ({ code: error?.code ?? 'unknown-error' }));
    milestone('owned-poi:' + JSON.stringify(owned.statuses ?? owned.code));
    await closeSession(session);
    session = null;
    return finishReport(context, {
      schema: 'railgun-installed-live-poi-status-v1',
      holdIdSha256: previous.holdIdSha256,
      transactionHash: previous.transactionHash,
      outputNoteIdSha256: previous.outputNoteIdSha256,
      outputAmount: previous.outputAmount,
      inputAmount: previous.inputAmount,
      unit,
      observedAt: Date.now(),
      owned: { statuses: owned.statuses ?? null, allValid: owned.allValid ?? false, inputType: owned.inputType ?? null, code: owned.code ?? null },
      continuable: owned.allValid === true && owned.inputType === 'Transact',
      consents,
    });
  } finally {
    await closeSession(session);
  }
}
// Send 2: the full POI-valid transfer output to the enrolled EOA. The new
// hold is identified by set difference over authenticated history, never by
// position, and its G1 outcome must name the approved recipient and amount.
async function unshield(context) {
  const { facade, signal, milestone, owner, previous, profile, header, params } = context;
  assert.equal(previous.schema, 'railgun-installed-live-poi-status-v1');
  assertChained(context, previous);
  assert.equal(previous.continuable, true);
  // Freshness may only tighten, never loosen beyond six hours.
  const freshness = Math.min(params.poiStatusMaxAgeMs ?? 6 * 3600 * 1000, 6 * 3600 * 1000);
  assert.ok(Date.now() - previous.observedAt <= freshness, 'POI status is stale');
  const transactionHash = previous.transactionHash;
  const seen = [],
    held = [];
  let session, lane, preparations = 0;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    const notes = await readNotes(session, signal, 'advance');
    const created = notes.filter((note) => note.txid !== undefined && bare(note.txid) === bare(transactionHash));
    assert.equal(created.length, 1);
    const output = created[0];
    assert.equal(sha(output.id), previous.outputNoteIdSha256);
    assert.equal(String(output.amount), previous.outputAmount);
    assert.equal(output.spentTxid, false);
    assert.equal(output.asset?.contract?.toLowerCase(), WETH);
    const beforeIds = new Set((await holds(session, signal, owner, milestone)).map((record) => record.holdId));
    // The pre-existing holds, hashed, let a later reconcile find the new one.
    const attemptId = ledger.reserve(profile, header, 'unshield', {
      outputNoteIdSha256: previous.outputNoteIdSha256,
      holdIdsBeforeSha256: [...beforeIds].map(sha).sort(),
      unshield: { amount: String(output.amount), recipient: owner, asset: WETH },
    });
    milestone('ledger-reserved:unshield');
    lane = await session.openPrivate({
      wallet: 'advance',
      signal,
      gasLimit: GAS_LIMIT,
      maxGasFee: MAX_GAS_FEE,
      reviewPreparation(summary, review) {
        preparations++;
        assert.equal(review.signal.aborted, false);
        assert.equal(summary.operation, 'railgun-token-unshield');
        assert.equal(summary.inputType, 'Transact');
        assert.equal(summary.recipient.toLowerCase(), owner);
        assert.equal(summary.amount, String(output.amount));
        assert.deepEqual(summary.asset, { __type: 'erc20', contract: WETH });
        assert.equal(summary.automaticRetry, false);
        assertDestinations(summary.destinations, context.expectedRpc);
        seen.push({ preparation: summary.operation, keys: keys(summary) });
        return true;
      },
      reviewTransaction(summary) {
        assert.equal(summary.from.toLowerCase(), owner);
        assert.equal(summary.operation, 'railgun-token-unshield');
        assert.equal(String(summary.maxGasFee), MAX_GAS_FEE.toString());
        assert.equal(summary.chainStateVerified, false);
        seen.push({ transaction: summary.operation, keys: keys(summary) });
        return true;
      },
    });
    let outcome,
      failure = null;
    try {
      const prepared = await lane.prepareUnshield({ asset: { __type: 'erc20', contract: WETH }, amount: output.amount, noteId: output.id }, owner);
      outcome = await lane.broadcast(prepared.handle);
    } catch (error) {
      failure = typeof error?.code === 'string' ? error.code : 'unknown-error';
    }
    const immediate = failure ? { classification: 'not-acknowledged', error: failure } : classify(outcome);
    fault(context, 'exit-before-finish');
    // A known hash finishes the attempt at once; its readback is best effort.
    if (immediate.transactionHash) ledger.finish(profile, header, attemptId, immediate);
    fault(context, 'exit-before-report');
    await closeLane(lane).catch(() => milestone('lane-close-uncertain'));
    lane = null;
    let after = null,
      added;
    // Without the new hold's binding a hash cannot be observed: the report is
    // deferred to live-reconcile, which finds the hold by set difference.
    fault(context, 'history-unavailable-after-send');
    added = (await holds(session, signal, owner, milestone)).filter((record) => !beforeIds.has(record.holdId));
    assert.ok(added.length <= 1, 'More than one new held operation');
    if (immediate.transactionHash) assert.equal(added.length, 1, 'A sent unshield without its hold');
    if (added.length === 1) {
      assert.equal(added[0].kind, 'railgun-token-unshield');
      try {
        budget(context, 'readback:unshield');
        after = await withHeld(session, signal, heldReviews(owner, milestone, held, context.expectedRpc), (l) => l.observe(added[0].holdId));
      } catch (error) {
        milestone('readback-unavailable:' + (error?.code ?? 'error'));
        if (!immediate.transactionHash) throw error;
      }
    }
    const result = immediate.transactionHash ? immediate : readback(immediate, after);
    if (after && immediate.transactionHash && after.status === 'journaled') assert.equal(after.transactionHash, immediate.transactionHash);
    if (!immediate.transactionHash) ledger.finish(profile, header, attemptId, result);
    const sends = ledger.inspect(profile, header).sends;
    milestone('ledger-finished:unshield:' + result.classification);
    await closeSession(session);
    session = null;
    return finishReport(context, {
      schema: 'railgun-installed-live-unshield-v1',
      send: 'unshield',
      holdIdSha256: added.length === 1 ? sha(added[0].holdId) : null,
      outputNoteIdSha256: previous.outputNoteIdSha256,
      unshield: { amount: String(output.amount), recipient: owner, asset: WETH },
      outcome: result,
      g1: after && { status: after.status, observation: after.observation ?? null },
      preparationReviews: preparations,
      ledgerSends: sends.length,
      stop: result.classification === 'unjournaled-after-refusal',
      reviews: { lane: seen, held },
    });
  } finally {
    await closeLane(lane);
    await closeSession(session);
  }
}
// Read-only conservation account of the completed journey.
async function summary(context) {
  const { facade, signal, previous, lineage, readReceipt, readFinalized, milestone, owner } = context;
  assert.equal(previous.schema, 'railgun-installed-live-observe-v1');
  assertChained(context, previous);
  assert.equal(previous.send, 'unshield');
  // The unshield must be matched, included, resolved and (below) finalized.
  assert.equal(previous.continuable, true);
  assert.equal(previous.final.resolved, true);
  assert.equal(previous.final.observation?.status, 'included');
  assert.ok(Number.isSafeInteger(previous.final.observation.blockNumber));
  if (previous.resolution) assert.equal(previous.resolution.outcome, 'matched');
  const { transfer, poi: poiReport, scan, rebuild: rebuildReport } = lineage;
  for (const report of [transfer, poiReport, scan, rebuildReport]) assertChained(context, report);
  assert.equal(rebuildReport.schema, 'railgun-installed-live-rebuild-v1');
  assert.equal(transfer.schema, 'railgun-installed-live-submit-v1');
  assert.ok(['acknowledged', 'unknown'].includes(transfer.outcome.classification));
  assert.equal(scan.schema, 'railgun-installed-live-poi-v1');
  assert.equal(poiReport.schema, 'railgun-installed-live-poi-status-v1');
  assert.equal(poiReport.continuable, true);
  assert.equal(transfer.holdIdSha256, rebuildReport.holdIdSha256);
  // Exact value lineage: full input to the transfer output to the unshield.
  assert.equal(poiReport.inputAmount, rebuildReport.heldBinding.amount);
  assert.equal(poiReport.outputAmount, poiReport.inputAmount);
  assert.deepEqual(previous.unshield, { amount: poiReport.outputAmount, recipient: owner, asset: WETH });
  const output = previous.resolution?.output ?? previous.final.output;
  assert.equal(output.kind, 'unshield');
  assert.equal(output.recipient.toLowerCase(), owner);
  assert.equal(output.amount, poiReport.outputAmount);
  assert.equal((BigInt(output.received) + BigInt(output.fee)).toString(), output.amount);
  let session;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    // Advance through the unshield so residual notes reflect its spend.
    const anchor = await readFinalized();
    assert.ok(previous.final.observation.blockNumber <= anchor.number, 'The unshield is finalized');
    assertCheckpoint(context, scan.anchor.number);
    const { ranges } = await scanTo(context, session, scan.anchor.number + 1, anchor);
    milestone('public-advanced:' + ranges);
    const notes = await readNotes(session, signal, 'advance');
    const spentOutput = notes.filter((note) => note.spentTxid !== false && bare(note.spentTxid) === bare(previous.transactionHash));
    assert.equal(spentOutput.length, 1, 'The unshield spent exactly the transfer output');
    assert.equal(sha(spentOutput[0].id), scan.outputNoteIdSha256);
    const spentInput = notes.filter((note) => sha(note.id) === rebuildReport.heldBinding.inputNoteIdSha256);
    assert.equal(spentInput.length, 1);
    assert.equal(bare(spentInput[0].spentTxid), bare(transfer.outcome.transactionHash), 'The transfer spent the held input');
    await closeSession(session);
    session = null;
    // The lineage leaves nothing spendable: residual unspent value is exactly
    // what the account held besides the input when it was rebuilt.
    const before = rebuildReport.notes,
      residual = noteSummary(notes);
    assert.equal(residual.unspent, before.unspent - 1);
    assert.equal(residual.unspentAmount, (BigInt(before.unspentAmount) - BigInt(poiReport.inputAmount)).toString());
    const receipts = {};
    for (const [name, hash] of [['transfer', transfer.outcome.transactionHash], ['unshield', previous.transactionHash]]) {
      receipts[name] = await readReceipt(hash);
      assert.equal(receipts[name].status, '0x1', 'Receipt status of ' + name);
    }
    const fees = Object.fromEntries(
      Object.entries(receipts).map(([name, r]) => [name, BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice)])
    );
    for (const fee of Object.values(fees)) assert.ok(fee <= MAX_GAS_FEE, 'Per-send fee cap');
    const gasWei = fees.transfer + fees.unshield;
    assert.ok(gasWei <= 2n * MAX_GAS_FEE, 'Total fee cap');
    return finishReport(context, {
      schema: 'railgun-installed-live-summary-v1',
      trust: 'unverified-rpc',
      input: { amount: poiReport.inputAmount, spentBy: transfer.outcome.transactionHash },
      transferOutput: { amount: poiReport.outputAmount, spentBy: previous.transactionHash },
      unshield: { amount: output.amount, received: output.received, fee: output.fee, recipient: output.recipient },
      gas: {
        transfer: receipts.transfer,
        unshield: receipts.unshield,
        feesWei: { transfer: fees.transfer.toString(), unshield: fees.unshield.toString() },
        totalWei: gasWei.toString(),
        withinCap: true,
      },
      conservation: { transferFullValue: true, unshieldFullOutput: true, receivedPlusFee: true, residualAsExpected: true },
      scanAnchor: anchor,
      residualNotes: residual,
    });
  } finally {
    await closeSession(session);
  }
}
const SEND_REPORT_MODES = Object.freeze(['live-submit', 'live-unshield', 'live-reconcile']);
// Recovers a send without a recorded report: observation only, no signing or
// sending. An unfinished record (a crash after the reservation) is finished
// from the journal: the journal write precedes transport admission, so a
// journaled attempt finishes as unknown with its hash and anything else as
// unjournaled-after-refusal (a stop). A finished record whose report was lost
// is reissued from the ledger alone, with no G1 read.
async function reconcile(context) {
  const { facade, signal, milestone, owner, profile, header } = context;
  const state = ledger.inspect(profile, header);
  const last = state.sends.at(-1);
  assert.ok(last, 'No send to reconcile');
  const reported = state.reports.filter((row) => SEND_REPORT_MODES.includes(row.mode)).length;
  assert.ok(reported < state.sends.length, 'Every send is already reported');
  const send = last.pending.send;
  const kind = send === 'transfer' ? 'railgun-private-transfer' : 'railgun-token-unshield';
  const held = [];
  let session;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    const records = await holds(session, signal, owner, milestone);
    let holdId = null;
    if (send === 'transfer') {
      holdId = bound(records, kind, last.pending.binding.holdIdSha256).holdId;
    } else {
      // The new hold is the set difference against the reservation's binding.
      const before = new Set(last.pending.binding.holdIdsBeforeSha256);
      const rows = records.filter((record) => !before.has(sha(record.holdId)));
      assert.ok(rows.length <= 1, 'More than one new held operation');
      if (rows.length) assert.equal(rows[0].kind, kind);
      holdId = rows[0]?.holdId ?? null;
    }
    let after = null,
      result,
      sends;
    if (last.finished) {
      result = last.finished.outcome;
      sends = state.sends;
      if (result.transactionHash) assert.ok(holdId, 'A journaled send without its hold');
      milestone('ledger-reissued:' + send + ':' + result.classification);
    } else {
      if (holdId) {
        budget(context, 'readback:' + send);
        after = await withHeld(session, signal, heldReviews(owner, milestone, held, context.expectedRpc), (l) => l.observe(holdId));
      }
      result =
        after?.status === 'journaled'
          ? { classification: 'unknown', transactionHash: after.transactionHash, readback: 'reconcile' }
          : { classification: 'unjournaled-after-refusal', readback: 'reconcile' };
      sends = ledger.finish(profile, header, last.pending.attemptId, result);
      milestone('ledger-reconciled:' + send + ':' + result.classification);
    }
    await closeSession(session);
    session = null;
    return finishReport(context, {
      schema: send === 'transfer' ? 'railgun-installed-live-submit-v1' : 'railgun-installed-live-unshield-v1',
      send,
      holdIdSha256: holdId ? sha(holdId) : null,
      ...(send === 'unshield'
        ? { outputNoteIdSha256: last.pending.binding.outputNoteIdSha256, unshield: last.pending.binding.unshield }
        : {}),
      outcome: result,
      reconciled: last.finished ? 'reissued' : 'finished',
      g1: after && { status: after.status, observation: after.observation ?? null },
      ledgerSends: sends.length,
      stop: !['acknowledged', 'unknown'].includes(result.classification),
      reviews: { held },
    });
  } finally {
    await closeSession(session);
  }
}
const MODES = Object.freeze({
  'live-reconcile': reconcile,
  'live-rebuild': rebuild,
  'live-submit': submit,
  'live-observe': observe,
  'live-poi': poi,
  'live-poi-status': poiStatus,
  'live-unshield': unshield,
  'live-summary': summary,
});
module.exports = { MODES, rangesTo, resumePlan, sha };
