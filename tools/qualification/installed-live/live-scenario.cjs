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
const { pauseMargin } = require('./vault-lifetime.cjs');
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
// The schedule's window end for a window starting at `start`.
function windowEnd(start) {
  const size = start < DENSE_FROM ? RANGE : NARROW;
  const to = start - (start % size) + size - 1;
  return start < DENSE_FROM ? Math.min(to, DENSE_FROM - 1) : to;
}
function rangesTo(from, anchor) {
  assert.ok(Number.isSafeInteger(from) && from >= 0);
  const result = [];
  for (let start = from; start <= anchor.number; ) {
    const to = Math.min(windowEnd(start), anchor.number);
    result.push(Object.freeze({ to, anchor: Object.freeze({ ...anchor }) }));
    start = to + 1;
  }
  return result;
}
const RANGE_SPACING_MS = 1000;
// Advances the public scan range by range from the coordinator's checkpoint.
// Each window is budgeted before it is invoked; each returned checkpoint is
// recorded durably, so a later resume starts from an exact lower bound.
// Plans targets only: the coordinator recovers its own checkpoint and chooses
// each window's start. A fixed first target, when given, precedes the schedule.
// A rebuild stops starting windows before its vault lifetime ends (and, on the
// third resume link, at its fixed admission deadline): a clean pause leaves
// exact progress and no window in flight. Synthetic runs may disable it to
// exercise a real vault expiry mid-scan.
function pauseDue(context) {
  if (!['live-rebuild', 'live-upgrade-rebuild', 'live-reproof-rebuild'].includes(context.mode)) return false;
  if (!(context.synthetic && context.params.noScanPause === true)) {
    const { unlockedAt, lifetimeMs } = context.vault;
    if (performance.now() - unlockedAt >= lifetimeMs - pauseMargin(lifetimeMs)) return true;
  }
  const deadline = ledger.resumeDeadline(context.profile, context.header) ?? ledger.upgradeDeadline(context.profile, context.header);
  return deadline !== null && Date.now() >= deadline;
}
async function scanTo(context, session, from, anchor, firstTarget = null) {
  // Synthetic only: the stopped continuation's runner (100000-block windows
  // from 0, no targets or checkpoints recorded), to reproduce its state.
  const legacy = context.params.legacyPlan === true;
  if (legacy) assert.equal(context.synthetic, true, 'The legacy plan is synthetic only');
  let ranges;
  if (firstTarget !== null) {
    assert.ok(!legacy && firstTarget <= anchor.number);
    ranges = [Object.freeze({ to: firstTarget, anchor: Object.freeze({ ...anchor }) }), ...rangesTo(firstTarget + 1, anchor)];
  } else ranges = legacy ? legacyRangesTo(from, anchor) : rangesTo(from, anchor);
  const statuses = {};
  const returned = [];
  for (const [index, range] of ranges.entries()) {
    if (index > 0 && !context.synthetic) await sleep(RANGE_SPACING_MS, context.signal);
    if (pauseDue(context))
      throw Object.assign(new Error('Scan paused before the vault lifetime or resume deadline'), { code: 'LIVE_SCAN_PAUSED' });
    const reservation = budget(context, 'scan-range', legacy ? undefined : { target: range.to });
    const result = await session.advancePublic(range);
    assert.equal(result.to?.number, range.to);
    if (returned.length < 2) returned.push(result.to.number);
    fault(context, 'exit-after-advance', range.to);
    // A lower bound for a later resume, not a refreshed canonical checkpoint.
    if (!legacy) ledger.progress(context.profile, context.header, result.to.number, result.to.hash, reservation);
    statuses[result.status] = (statuses[result.status] || 0) + 1;
  }
  return { ranges: ranges.length, statuses, firstReturned: returned };
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
// The resume candidates. After the last recorded checkpoint L (a lower bound),
// the last window attempted beyond it (target T) may or may not have been
// applied; before any checkpoint, the launcher-verified claim supplies L and T.
// The first attempt targets the schedule's next window after L; the second,
// separately budgeted, the schedule's next window after T. For adjacent 20000-
// block windows the first target is T itself. A wider T (the earlier runner's
// 100000-block windows) is never retried whole: it may exceed the scan
// source's per-window bounds. If an attempt fails the outcome is unknown. The
// coordinator recovers its own checkpoint and chooses each start, so neither
// target can skip a block: one too far is refused at acquisition. If both
// fail, the resume stops. Without a window beyond L the plan is exact.
function resumePlan(context) {
  const state = ledger.inspect(context.profile, context.header);
  const last = state.progress.at(-1);
  const claim = context.header.binding.resumeFrom;
  const lower = last ? last.to : claim.checkpoint;
  const windows = (state.budgets['scan-range'] ?? []).filter((row) => Number.isSafeInteger(row.target));
  const attempted = windows.at(-1);
  const upper = last ? (attempted && attempted.target > last.to ? attempted.target : null) : claim.failedTarget;
  if (upper === null) return { mode: 'exact', from: lower + 1, firstTarget: null };
  const tried = state.attempts.filter((row) => row.lower === lower && row.upper === upper);
  assert.ok(tried.length < 2, 'Both resume targets were tried');
  const mode = tried.length === 0 ? 'first' : 'second';
  // Synthetic only: the earlier first-target rule (exactly T), to reproduce it.
  const legacyRule = context.params.legacyResumeRule === true;
  if (legacyRule) assert.equal(context.synthetic, true, 'The legacy resume rule is synthetic only');
  const target = mode === 'first' ? (legacyRule ? upper : windowEnd(lower + 1)) : windowEnd(upper + 1);
  return { mode, lower, upper, from: null, firstTarget: target };
}
// A later stage's scan continues from the last recorded checkpoint, which may
// already lie beyond its lineage anchor after an interrupted attempt of the
// same stage, but never behind it. The coordinator still chooses each start.
// The active generation's progress: on an upgrade link, only what its own
// started phase recorded; every earlier checkpoint is historical.
function activeProgress(context) {
  const state = ledger.inspect(context.profile, context.header);
  if (!ledger.UPGRADES.includes(context.header.name)) return { state, progress: state.progress };
  assert.ok(state.phase, 'The upgrade generation has not started');
  return { state, progress: state.progress.slice(state.phase.progressFrom) };
}
// The upgrade generation's plan, with the resume target rules scoped to its
// own phase: its last returned checkpoint (or none) and its attempted window.
function upgradePlan(context) {
  const { state, progress } = activeProgress(context);
  const last = progress.at(-1);
  const lower = last ? last.to : -1;
  const windows = (state.budgets['scan-range'] ?? []).slice(state.phase.rangesFrom).filter((row) => Number.isSafeInteger(row.target));
  const attempted = windows.at(-1);
  const upper = attempted && attempted.target > lower ? attempted.target : null;
  if (upper === null) return { mode: 'exact', lower, upper: null, from: lower + 1, firstTarget: null };
  const tried = state.attempts.filter((row) => row.lower === lower && row.upper === upper);
  assert.ok(tried.length < 2, 'Both resume targets were tried');
  const mode = tried.length === 0 ? 'first' : 'second';
  return { mode, lower, upper, from: null, firstTarget: mode === 'first' ? windowEnd(lower + 1) : windowEnd(upper + 1) };
}
function scanStart(context, number, anchor) {
  const last = activeProgress(context).progress.at(-1);
  if (!last) return number + 1;
  assert.ok(last.to >= number, 'Scan checkpoint behind the lineage anchor');
  // Never downgrade a stored checkpoint to an older provider head.
  assert.ok(last.to <= anchor.number, 'Scan checkpoint beyond the finalized anchor');
  assert.match(last.hash, /^0x[0-9a-f]{64}$/);
  return last.to + 1;
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
const FAULTS = Object.freeze([
  'exit-before-finish',
  'exit-before-report',
  'history-unavailable-after-send',
  'exit-after-advance',
  'exit-after-poi-retry-reserve',
  'exit-after-poi-reproof-reserve',
  'exit-after-prepare',
]);
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
// A predecessor report belongs to this ledger, or, on the post-send link only,
// is one its exactly bound predecessor recorded: same producer header, same
// digest and mode as a report row of that predecessor. Nothing is relabelled.
function assertChained(context, previous) {
  if (previous.ledgerHeaderSha256 === sha(JSON.stringify(context.header))) return;
  assert.ok([ledger.JOURNEY2, ...ledger.UPGRADES, ledger.JOURNEY5, ledger.JOURNEY6].includes(context.header.name), 'Report from another campaign');
  if (context.header.name === ledger.JOURNEY2)
    assert.equal(previous.ledgerHeaderSha256, context.header.binding.predecessor.headerSha256, 'Report from another campaign');
  // Exact producer header, digest and mode as one ancestor recorded them.
  const rows = ledger.predecessorReports(context.profile, context.header);
  assert.ok(
    rows.some(
      (row) =>
        row.headerSha256 === previous.ledgerHeaderSha256 &&
        row.sha256 === previous.reportSha256 &&
        row.mode === previous.reportMode
    ),
    'Report not recorded by its producing ancestor'
  );
}
// Rebuild public and wallet generations for the current package policy, then
// establish the exact held state without any send.
async function rebuild(context) {
  const { facade, signal, milestone, owner, readFinalized, params } = context;
  const publicCache = params.publicCache ?? 'new';
  assert.ok(['new', 'pending'].includes(publicCache));
  // A resume plans its candidates before spending an opener, and records the
  // attempt only once the opener is reserved (see resumePlan).
  let from = 0,
    resume = null;
  if ([ledger.RESUME, ledger.RESUME2, ledger.RESUME3].includes(context.header.name)) {
    assert.equal(publicCache, 'pending');
    resume = resumePlan(context);
    from = resume.from;
  }
  budget(context, 'scan-open:' + publicCache);
  if (resume && resume.mode !== 'exact')
    ledger.resumeAttempt(context.profile, context.header, resume.mode, resume.lower, resume.upper, resume.firstTarget);
  const seen = [];
  let session, lane;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal, publicCache });
    const anchor = await readFinalized();
    const { ranges, statuses, firstReturned } = await scanTo(context, session, from, anchor, resume?.firstTarget ?? null);
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
      resume,
      firstReturnedCheckpoints: firstReturned,
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
// TXID synchronization to the service's validated tip, one budgeted page per
// call, sharing the campaign's page total. Capacity before the tip is a stop.
async function syncTxid(context, session, accept) {
  const txid = [];
  for (let call = 0; ; call++) {
    const mode = call === 0 ? 'initialize' : 'advance';
    budget(context, 'txid-page');
    const result = await session
      .synchronizeTxid({ mode, signal: context.signal, reviewDisclosure: accept('txid-' + mode) })
      .then((value) => ({ value }), (error) => ({ code: error?.code ?? 'unknown-error' }));
    txid.push(result.value ? { count: result.value.count, latest: result.value.serviceLatestIndex } : { code: result.code });
    if (result.code) throw Object.assign(Error('TXID synchronization refused'), { code: result.code });
    assert.equal(result.value.capacityReached, false, 'TXID capacity reached');
    if (result.value.serviceLatestIndex !== null && result.value.count === result.value.serviceLatestIndex + 1) return txid;
  }
}
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
    const { ranges } = await scanTo(context, session, scanStart(context, rebuildReport.anchor.number, anchor), anchor);
    milestone('public-advanced:' + ranges);
    const notes = await readNotes(session, signal, 'advance');
    const { input, output } = transferJoin(notes, transactionHash);
    assert.equal(output.spentTxid, false);
    const txid = await syncTxid(context, session, accept);
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
  assert.ok(
    [
      'railgun-installed-live-poi-v1',
      'railgun-installed-live-poi-status-v1',
      'railgun-installed-live-poi-retry-v1',
      'railgun-installed-live-poi-reproof-v1',
    ].includes(previous.schema)
  );
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
  const { facade, signal, milestone, owner, profile, header, params } = context;
  const mark = context.mark ?? (() => {});
  // Journey-6: each further attempt follows a completed custody verification
  // of the previous refused attempt (the previous report); the allValid status
  // read is a lineage report instead.
  const attempting = header.name === ledger.JOURNEY6;
  let custody = null;
  if (attempting) {
    custody = context.previous;
    assertCustodyAdmits(context, custody);
  }
  const previous = attempting ? context.lineage.poi : context.previous;
  assert.ok(previous, 'The allValid status read');
  // A genuine allValid status read: a status report, or a retry or
  // replacement report whose own fresh read was already allValid and
  // therefore skipped the handoff.
  assert.ok(
    previous.schema === 'railgun-installed-live-poi-status-v1' ||
      (['railgun-installed-live-poi-retry-v1', 'railgun-installed-live-poi-reproof-v1'].includes(previous.schema) &&
        previous.skipped === true)
  );
  assertChained(context, previous);
  assert.equal(previous.continuable, true);
  assert.equal(previous.owned.allValid, true);
  // Freshness may only tighten, never loosen beyond six hours.
  const freshness = Math.min(params.poiStatusMaxAgeMs ?? 6 * 3600 * 1000, 6 * 3600 * 1000);
  assert.ok(Date.now() - previous.observedAt <= freshness, 'POI status is stale');
  if (custody) assert.equal(custody.outputNoteIdSha256, previous.outputNoteIdSha256);
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
    // The amendment's one further unshield: the same output, recipient, amount
    // and asset as the refused reservation, and no held operation since it.
    if (header.name === ledger.JOURNEY5) {
      const { amendment } = header.binding;
      const sends = ledger.inspect(profile, header).sends;
      assert.equal(sends.length, 2, 'The amendment admits one further unshield only');
      const unsent = sends[1];
      assert.equal(unsent.pending.attemptId, amendment.attemptId);
      assert.equal(previous.outputNoteIdSha256, amendment.unsent.outputNoteIdSha256);
      assert.deepEqual({ amount: String(output.amount), recipient: owner, asset: WETH }, amendment.unsent.unshield);
      assert.deepEqual(
        [...beforeIds].map(sha).sort(),
        unsent.pending.binding.holdIdsBeforeSha256,
        'A held operation appeared after the refused reservation'
      );
    }
    // Journey-6: the same output, recipient, amount and asset as the bound
    // refused attempt, and the original before-set: no held operation since.
    if (attempting) {
      const { attempts } = header.binding;
      const sends = ledger.inspect(profile, header).sends;
      assert.ok(sends.length >= 3 && sends.length < ledger.ATTEMPT_RESERVATIONS, 'Further reservations exhausted');
      assert.equal(sends.at(-1).pending.attemptId, custody.attemptId);
      assert.equal(previous.outputNoteIdSha256, attempts.previous.unsent.outputNoteIdSha256);
      assert.deepEqual({ amount: String(output.amount), recipient: owner, asset: WETH }, attempts.previous.unsent.unshield);
      assert.deepEqual(
        [...beforeIds].map(sha).sort(),
        attempts.previous.holdIdsBeforeSha256,
        'A held operation appeared after the refused reservation'
      );
    }
    // The pre-existing holds, hashed, let a later reconcile find the new one.
    const attemptId = ledger.reserve(profile, header, 'unshield', {
      outputNoteIdSha256: previous.outputNoteIdSha256,
      holdIdsBeforeSha256: [...beforeIds].map(sha).sort(),
      unshield: { amount: String(output.amount), recipient: owner, asset: WETH },
    });
    milestone('ledger-reserved:unshield');
    mark('open-private:start');
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
    mark('open-private:end');
    let outcome,
      failure = null,
      stage = 'prepare';
    try {
      mark('prepare:start');
      const prepared = await lane.prepareUnshield({ asset: { __type: 'erc20', contract: WETH }, amount: output.amount, noteId: output.id }, owner);
      mark('prepare:end');
      // Synthetic: a durable hold exists and nothing was broadcast.
      fault(context, 'exit-after-prepare');
      stage = 'broadcast';
      mark('broadcast:start');
      outcome = await lane.broadcast(prepared.handle);
      mark('broadcast:end');
    } catch (error) {
      mark(stage + ':refused');
      failure = typeof error?.code === 'string' ? error.code : 'unknown-error';
    }
    const immediate = failure ? { classification: 'not-acknowledged', error: failure } : classify(outcome);
    milestone('unshield-attempt:' + (failure ?? 'returned'));
    fault(context, 'exit-before-finish');
    // A known hash finishes the attempt at once; its readback is best effort.
    if (immediate.transactionHash) ledger.finish(profile, header, attemptId, immediate);
    fault(context, 'exit-before-report');
    await closeLane(lane).catch(() => milestone('lane-close-uncertain'));
    lane = null;
    let after = null,
      added;
    // Without the new hold's binding a hash cannot be observed: the report is
    // deferred to live-reconcile, which finds the hold by set difference. A
    // failure here keeps the attempt's own outcome as its primary refusal.
    try {
      mark('history:start');
      fault(context, 'history-unavailable-after-send');
      added = (await holds(session, signal, owner, milestone)).filter((record) => !beforeIds.has(record.holdId));
      mark('history:end');
    } catch (error) {
      mark('history:failed');
      try {
        Object.defineProperty(error, 'primaryRefusal', { value: failure ?? 'returned' });
      } catch {
        /* The later failure still propagates unchanged. */
      }
      throw error;
    }
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
// The report row each send's finish was immediately followed by, across the
// fixed chain and this ledger, keyed by attempt id. Read-only.
function sendReports(context) {
  const fs = require('fs');
  const chain = ledger.chainRecords(context.profile, context.header);
  const own = fs
    .readFileSync(ledger.ledgerFile(context.profile, context.header.name), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => JSON.parse(line));
  const result = {};
  for (const records of [...Object.values(chain), own])
    records.forEach((record, index) => {
      if (record.type !== 'send-finished') return;
      const next = records[index + 1];
      if (next?.type === 'report') result[record.attemptId] = { mode: next.mode, sha256: next.sha256 };
    });
  return result;
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
  const {
    transfer,
    poi: poiReport,
    scan,
    rebuild: rebuildReport,
    upgrade = null,
    retry = null,
    reproofRebuild = null,
    reproof = null,
    unsent = null,
  } = lineage;
  // The send amendment and the bounded-attempts link continue the circuit
  // link's generation and lineage.
  const attemptsLink = context.header.name === ledger.JOURNEY6;
  const amended = context.header.name === ledger.JOURNEY5 || attemptsLink;
  const upgraded = ledger.UPGRADES.includes(context.header.name) || amended;
  const circuit = context.header.name === ledger.JOURNEY4 || amended;
  assert.equal(upgrade !== null, upgraded);
  // The amendment's refused reservation stays in the lineage, unsent: its own
  // reconcile report, exactly as the ledger and launcher bound it.
  assert.equal(unsent !== null, amended);
  // Every unshield reservation's own report row, as its ledger recorded it.
  const rows = attemptsLink ? sendReports(context) : null;
  const sendsNow = attemptsLink ? ledger.inspect(context.profile, context.header).sends : null;
  if (amended) {
    const { reconcile, unsent: bound } = attemptsLink
      ? {
          reconcile: { reportSha256: rows[sendsNow[1].pending.attemptId]?.sha256 },
          unsent: context.header.binding.attempts.previous.unsent,
        }
      : context.header.binding.amendment;
    assertChained(context, unsent);
    assert.equal(unsent.reportSha256, reconcile.reportSha256);
    assert.equal(unsent.reportMode, 'live-reconcile');
    assert.equal(unsent.schema, 'railgun-installed-live-unshield-v1');
    assert.equal(unsent.reconciled, 'finished');
    assert.deepEqual(unsent.outcome, { ...ledger.UNSENT });
    assert.equal(unsent.holdIdSha256, null);
    assert.equal(unsent.g1, null);
    assert.equal(unsent.outputNoteIdSha256, bound.outputNoteIdSha256);
    // The actual unshield is a different, journaled operation with its own hash.
    assert.notEqual(previous.holdIdSha256, null);
    assert.ok(previous.transactionHash);
  }
  // Journey-6: every further refused attempt, journey-5's bound one first,
  // stays unsent with its own report; the last reservation is the actual one.
  const refusedAttempts = [];
  if (attemptsLink) {
    assert.ok(sendsNow.length >= 4 && sendsNow.length <= ledger.ATTEMPT_RESERVATIONS);
    const actual = sendsNow.at(-1);
    assert.equal(actual.finished?.outcome?.transactionHash, previous.transactionHash, 'The actual unshield');
    sendsNow.slice(2, -1).forEach((send, index) => {
      const report = lineage['refused' + (index + 1)];
      assert.ok(report, 'Refused attempt report');
      assertChained(context, report);
      const row = rows[send.pending.attemptId];
      assert.ok(row && row.mode === 'live-unshield' && row.sha256 === report.reportSha256, 'Refused attempt report row');
      assert.equal(report.schema, 'railgun-installed-live-unshield-v1');
      assert.deepEqual(report.outcome, send.finished.outcome);
      assert.equal(report.outcome.classification, ledger.REFUSED);
      assert.equal(report.holdIdSha256, null);
      assert.equal(report.g1, null);
      refusedAttempts.push({ attemptId: send.pending.attemptId, outcome: report.outcome, reportSha256: report.reportSha256 });
    });
    assert.equal(lineage['refused' + (sendsNow.length - 2)], undefined);
  }
  // The circuit link's lineage: the consumed retry, its own rebuild and its
  // own replacement report.
  assert.equal(reproofRebuild !== null, circuit);
  assert.equal(reproof !== null, circuit);
  if (circuit) assert.notEqual(retry, null);
  for (const report of [transfer, poiReport, scan, rebuildReport, upgrade, retry, reproofRebuild, reproof].filter(Boolean))
    assertChained(context, report);
  assert.equal(rebuildReport.schema, 'railgun-installed-live-rebuild-v1');
  assert.equal(transfer.schema, 'railgun-installed-live-submit-v1');
  assert.ok(['acknowledged', 'unknown'].includes(transfer.outcome.classification));
  assert.equal(scan.schema, 'railgun-installed-live-poi-v1');
  assert.ok(
    poiReport.schema === 'railgun-installed-live-poi-status-v1' ||
      (['railgun-installed-live-poi-retry-v1', 'railgun-installed-live-poi-reproof-v1'].includes(poiReport.schema) &&
        poiReport.skipped === true)
  );
  assert.equal(poiReport.continuable, true);
  if (upgraded) {
    assert.equal(upgrade.schema, 'railgun-installed-live-upgrade-rebuild-v1');
    assert.equal(upgrade.outputNoteIdSha256, scan.outputNoteIdSha256);
    if (retry) assert.equal(retry.schema, 'railgun-installed-live-poi-retry-v1');
  } else assert.equal(retry, null);
  if (circuit) {
    assert.equal(retry.skipped, false);
    assert.equal(reproofRebuild.schema, 'railgun-installed-live-reproof-rebuild-v1');
    assert.equal(reproofRebuild.outputNoteIdSha256, scan.outputNoteIdSha256);
    assert.equal(reproof.schema, 'railgun-installed-live-poi-reproof-v1');
    assert.equal(reproof.outputNoteIdSha256, scan.outputNoteIdSha256);
  }
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
    const { ranges } = await scanTo(
      context,
      session,
      scanStart(context, (circuit ? reproofRebuild : upgraded ? upgrade : scan).anchor.number, anchor),
      anchor
    );
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
      // Each POI handoff's own response, never merged; the final status decided.
      poi: {
        first: scan.poi?.submitted?.response ?? null,
        second: retry && !retry.skipped ? retry.retry?.response ?? null : null,
        secondSkipped: retry ? retry.skipped === true : null,
        // The circuit link's replacement proof: a new proof, never the same bytes.
        ...(circuit
          ? {
              replacement: reproof.skipped ? null : reproof.reproof?.submitted?.response ?? null,
              replacementSkipped: reproof.skipped === true,
            }
          : {}),
        finalStatus: poiReport.owned,
      },
      ...(upgraded ? { upgrade: { anchor: upgrade.anchor, ranges: upgrade.ranges, identity: upgrade.upgrade } } : {}),
      ...(circuit
        ? { circuit: { anchor: reproofRebuild.anchor, ranges: reproofRebuild.ranges, identity: reproofRebuild.upgrade } }
        : {}),
      // Every operator reservation, two chain transactions: each refused one
      // stays recorded as unsent and has no receipt or fee.
      ...(attemptsLink
        ? {
            reservations: {
              operator: sendsNow.length,
              unshieldReservations: sendsNow.length - 1,
              chainTransactions: 2,
              unsent: [
                { attemptId: sendsNow[1].pending.attemptId, outcome: unsent.outcome, reportSha256: unsent.reportSha256 },
                ...refusedAttempts,
              ],
              unshield: { holdIdSha256: previous.holdIdSha256, transactionHash: previous.transactionHash },
            },
          }
        : amended
        ? {
            reservations: {
              operator: ledger.AMENDMENT_RESERVATIONS,
              chainTransactions: 2,
              unsent: {
                attemptId: context.header.binding.amendment.attemptId,
                outcome: unsent.outcome,
                reportSha256: unsent.reportSha256,
              },
              unshield: { holdIdSha256: previous.holdIdSha256, transactionHash: previous.transactionHash },
            },
          }
        : {}),
    });
  } finally {
    await closeSession(session);
  }
}
// The upgrade link's post-transfer rebuild: fresh public and wallet
// generations for the new package policy, with the old ones kept. It binds
// the original held input and the transfer output through recorded evidence,
// re-observes the matched journal resolution, and never resumes a proof,
// prepares or releases anything. A separate checkpoint, not a conservation
// baseline: the original pre-transfer rebuild report remains that.
async function upgradeRebuild(context) {
  const { previous, lineage, header } = context;
  assert.equal(header.name, ledger.JOURNEY3, 'The upgrade rebuild runs on the upgrade link only');
  assert.equal(previous.schema, 'railgun-installed-live-observe-v1');
  assertChained(context, previous);
  assert.equal(previous.send, 'transfer');
  assert.equal(previous.continuable, true);
  const { rebuild: rebuildReport, transfer } = lineage;
  for (const report of [rebuildReport, transfer]) assertChained(context, report);
  assert.equal(rebuildReport.schema, 'railgun-installed-live-rebuild-v1');
  assert.equal(transfer.schema, 'railgun-installed-live-submit-v1');
  assert.equal(transfer.holdIdSha256, rebuildReport.holdIdSha256);
  assert.equal(previous.transactionHash, transfer.outcome.transactionHash);
  const output0 = previous.resolution?.output ?? previous.final.output;
  assert.equal(output0.kind, 'shielded');
  return rebuildGeneration(context, {
    rebuildReport,
    transfer,
    outputNoteIdSha256: output0.noteIdSha256,
    schema: 'railgun-installed-live-upgrade-rebuild-v1',
    label: 'upgrade-public-rebuilt:',
  });
}
// The circuit link's rebuild, after the consumed retry: the same fresh public
// and wallet generations for the new package policy, binding the same input,
// output and matched journal. Before the replacement handoff only.
async function reproofRebuild(context) {
  const { previous, lineage, header, profile } = context;
  assert.equal(header.name, ledger.JOURNEY4, 'The circuit rebuild runs on the circuit link only');
  // The consumed retry's own report: its handoff left, and no status since
  // decided anything.
  assert.equal(previous.schema, 'railgun-installed-live-poi-retry-v1');
  assertChained(context, previous);
  assert.equal(previous.skipped, false);
  const state = ledger.inspect(profile, header);
  assert.ok(state.retry.pending && state.retry.finished, 'The retry is not consumed');
  assert.equal(state.reproof.pending, null, 'The replacement precedes no rebuild');
  const { rebuild: rebuildReport, transfer, upgrade } = lineage;
  for (const report of [rebuildReport, transfer, upgrade]) assertChained(context, report);
  assert.equal(rebuildReport.schema, 'railgun-installed-live-rebuild-v1');
  assert.equal(transfer.schema, 'railgun-installed-live-submit-v1');
  assert.equal(upgrade.schema, 'railgun-installed-live-upgrade-rebuild-v1');
  assert.equal(transfer.holdIdSha256, rebuildReport.holdIdSha256);
  assert.equal(previous.holdIdSha256, rebuildReport.holdIdSha256);
  assert.equal(previous.transactionHash, transfer.outcome.transactionHash);
  assert.equal(upgrade.transactionHash, transfer.outcome.transactionHash);
  assert.equal(previous.outputNoteIdSha256, upgrade.outputNoteIdSha256);
  return rebuildGeneration(context, {
    rebuildReport,
    transfer,
    outputNoteIdSha256: previous.outputNoteIdSha256,
    schema: 'railgun-installed-live-reproof-rebuild-v1',
    label: 'reproof-public-rebuilt:',
  });
}
// One upgrade link's generation rebuild over its own phase.
async function rebuildGeneration(context, { rebuildReport, transfer, outputNoteIdSha256, schema, label }) {
  const { facade, signal, milestone, owner, readFinalized, profile, header } = context;
  // One durable start; later sessions resume the same generation.
  let state = ledger.inspect(profile, header);
  const started = state.phase !== null;
  if (!started) ledger.startPhase(profile, header);
  const plan = started ? upgradePlan(context) : { mode: 'exact', lower: -1, upper: null, from: 0, firstTarget: null };
  state = ledger.inspect(profile, header);
  const begun = (state.budgets['scan-open:new'] ?? []).length > header.binding.phase.boundary.scanOpenNew;
  const publicCache = begun ? 'pending' : 'new';
  budget(context, 'scan-open:' + publicCache);
  if (plan.mode !== 'exact') ledger.resumeAttempt(profile, header, plan.mode, plan.lower, plan.upper, plan.firstTarget);
  const seen = [],
    held = [];
  let session, lane;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal, publicCache });
    const anchor = await readFinalized();
    const { ranges, statuses, firstReturned } = await scanTo(context, session, plan.from ?? 0, anchor, plan.firstTarget);
    milestone(label + ranges);
    const facts = heldFacts(context.heldReport, owner);
    lane = await session.openRead({ wallet: 'new', signal });
    const notes = await lane.notes(undefined, true);
    await closeLane(lane);
    lane = null;
    // The original input: the held report's Shield note, spent by the transfer.
    const inputs = notes.filter((note) => sha(note.id) === rebuildReport.heldBinding.inputNoteIdSha256);
    assert.equal(inputs.length, 1, 'The held input is in the rebuilt wallet');
    const input = inputs[0];
    assert.equal(bare(input.txid), bare(facts.shieldTransactionHash));
    assert.equal(bare(input.spentTxid), bare(transfer.outcome.transactionHash), 'The transfer spent the held input');
    // The transfer output: the resolved journal's note, owned and unspent, in full.
    const created = notes.filter((note) => note.txid !== undefined && bare(note.txid) === bare(transfer.outcome.transactionHash));
    assert.equal(created.length, 1, 'The transfer created exactly one owned output');
    const output = created[0];
    assert.equal(sha(output.id), outputNoteIdSha256);
    assert.equal(output.spentTxid, false);
    assert.equal(output.asset?.contract?.toLowerCase(), WETH);
    assert.equal(String(output.amount), rebuildReport.heldBinding.amount);
    assert.equal(String(input.amount), rebuildReport.heldBinding.amount);
    // The journal resolution stays matched for the bound hold.
    lane = await session.openRecovery({ ...recoveryOptions(owner, 'railgun-private-transfer', milestone, seen, false, context.expectedRpc), signal });
    const page = await lane.history();
    assert.equal(page.nextAfter, null);
    await closeLane(lane);
    lane = null;
    const hold = bound(page.records, 'railgun-private-transfer', rebuildReport.holdIdSha256);
    budget(context, 'observe:transfer');
    const observed = await withHeld(session, signal, heldReviews(owner, milestone, held, context.expectedRpc), (l) => l.observe(hold.holdId));
    assert.equal(observed.transactionHash, transfer.outcome.transactionHash);
    assert.equal(observed.resolved, true, 'The transfer journal is resolved');
    assert.equal(observed.transact?.status, 'matched', 'The transfer journal is matched');
    await closeSession(session);
    session = null;
    return finishReport(context, {
      schema,
      upgrade: header.binding.upgrade,
      publicCache,
      plan,
      anchor,
      firstReturnedCheckpoints: firstReturned,
      ranges,
      advanceStatuses: statuses,
      notes: noteSummary(notes),
      holdIdSha256: rebuildReport.holdIdSha256,
      transactionHash: transfer.outcome.transactionHash,
      inputNoteIdSha256: sha(input.id),
      inputAmount: String(input.amount),
      outputNoteIdSha256: sha(output.id),
      outputAmount: String(output.amount),
      journal: { resolved: true, transact: 'matched' },
      reviews: { recovery: seen, held },
    });
  } finally {
    await closeLane(lane);
    await closeSession(session);
  }
}
// The one explicit second POI handoff. A fresh owned status of the exact
// transfer output gates it inside the same session: Valid skips it, Missing
// admits it, anything else stops. The durable retry reservation precedes the
// lane; any failure after it is final.
async function poiRetry(context) {
  const { facade, signal, milestone, owner, readFinalized, previous, profile, header } = context;
  assert.equal(header.name, ledger.JOURNEY3, 'The retry runs on the upgrade link only');
  assert.equal(previous.schema, 'railgun-installed-live-upgrade-rebuild-v1');
  assertChained(context, previous);
  const state0 = ledger.inspect(profile, header);
  assert.ok(state0.poi.pending && state0.poi.finished, 'No first handoff to retry');
  assert.equal(state0.retry.pending, null, 'The retry is consumed: status only');
  const consents = [];
  const accept = (label) => (summary, review) => {
    assert.equal((review?.signal ?? review)?.aborted, false);
    consents.push({ label, purpose: summary?.purpose ?? null });
    return true;
  };
  let session, lane;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    const anchor = await readFinalized();
    const { ranges } = await scanTo(context, session, scanStart(context, previous.anchor.number, anchor), anchor);
    milestone('public-advanced:' + ranges);
    const txid = await syncTxid(context, session, accept);
    milestone('txid:' + JSON.stringify(txid.at(-1)));
    const notes = await readNotes(session, signal, 'advance');
    const created = notes.filter((note) => note.txid !== undefined && bare(note.txid) === bare(previous.transactionHash));
    assert.equal(created.length, 1);
    const output = created[0];
    assert.equal(sha(output.id), previous.outputNoteIdSha256);
    assert.equal(String(output.amount), previous.outputAmount);
    assert.equal(output.spentTxid, false);
    const unit = budget(context, 'poi-status');
    const owned = await session
      .observeOwnedPoi({ noteId: output.id, signal, reviewDisclosure: accept('owned-poi') })
      .then((value) => value, (error) => ({ code: error?.code ?? 'unknown-error' }));
    milestone('owned-poi:' + JSON.stringify(owned.statuses ?? owned.code));
    const base = {
      schema: 'railgun-installed-live-poi-retry-v1',
      holdIdSha256: previous.holdIdSha256,
      transactionHash: previous.transactionHash,
      outputNoteIdSha256: previous.outputNoteIdSha256,
      outputAmount: previous.outputAmount,
      inputAmount: previous.inputAmount,
      anchor,
      ranges,
      txid,
      unit,
      observedAt: Date.now(),
      owned: { statuses: owned.statuses ?? null, allValid: owned.allValid ?? false, inputType: owned.inputType ?? null, code: owned.code ?? null },
      original: state0.poi.finished.outcome,
    };
    const valid = owned.allValid === true && owned.inputType === 'Transact';
    const missing = !owned.code && owned.inputType === 'Transact' && JSON.stringify(owned.statuses) === JSON.stringify(['Missing']);
    if (!missing) {
      // Valid already: no second handoff. Anything else: no retry, a stop.
      await closeSession(session);
      session = null;
      return finishReport(context, { ...base, skipped: true, retry: null, continuable: valid, stop: !valid, consents });
    }
    const hold = bound(await holds(session, signal, owner, milestone), 'railgun-private-transfer', previous.holdIdSha256);
    const retryId = ledger.poiRetryReserve(profile, header, {
      holdIdSha256: previous.holdIdSha256,
      originalHandoffId: state0.poi.pending.handoffId,
      originalCapsuleDigestSha256: state0.poi.pending.binding.capsuleDigestSha256,
      originalPayloadSha256: state0.poi.pending.binding.payloadSha256,
    });
    milestone('ledger-reserved:poi-retry');
    fault(context, 'exit-after-poi-retry-reserve');
    lane = await session.openPoiRecovery({ signal, reviewDisclosures: accept('poi-retry') });
    const outcome = await lane.retryAttempted(hold.holdId).then(
      (value) => value,
      (error) => ({ status: 'error', code: error?.code ?? 'unknown-error' })
    );
    ledger.poiRetryFinish(profile, header, retryId, {
      status: outcome.status,
      stage: outcome.stage ?? null,
      classification: outcome.response?.classification ?? null,
      diagnostic: outcome.response?.diagnostic ?? null,
      code: outcome.code ?? null,
    });
    milestone('poi-retried:' + JSON.stringify({ status: outcome.status, classification: outcome.response?.classification ?? null }));
    await closeLane(lane);
    lane = null;
    await closeSession(session);
    session = null;
    return finishReport(context, {
      ...base,
      skipped: false,
      retry: { status: outcome.status, stage: outcome.stage ?? null, response: outcome.response ?? null, code: outcome.code ?? null },
      // A response is never acceptance: a later status read decides.
      continuable: false,
      stop: false,
      consents,
    });
  } finally {
    await closeLane(lane);
    await closeSession(session);
  }
}
// The circuit link's one replacement-proof handoff. Local preparation comes
// first: the lane proves a replacement for the same output with the current
// circuit (eligibility, fresh roots, proof; never a send), so a refused
// preparation spends no status read or handoff. One owned status read in the
// same session then gates the handoff and is its fresh evidence: Valid skips
// it, Missing admits it, anything else stops. The durable reservation precedes
// the handoff's lane; any failure after it is final.
async function poiReproof(context) {
  const { facade, signal, milestone, owner, readFinalized, previous, profile, header } = context;
  assert.equal(header.name, ledger.JOURNEY4, 'The replacement runs on the circuit link only');
  assert.equal(previous.schema, 'railgun-installed-live-reproof-rebuild-v1');
  assertChained(context, previous);
  const state0 = ledger.inspect(profile, header);
  assert.ok(state0.poi.pending && state0.poi.finished, 'No first handoff');
  assert.ok(state0.retry.pending && state0.retry.finished, 'The retry is not consumed');
  assert.equal(state0.reproof.pending, null, 'The replacement is consumed: status only');
  const consents = [];
  const accept = (label) => (summary, review) => {
    assert.equal((review?.signal ?? review)?.aborted, false);
    consents.push({ label, purpose: summary?.purpose ?? null });
    return true;
  };
  let session, lane;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    const anchor = await readFinalized();
    const { ranges } = await scanTo(context, session, scanStart(context, previous.anchor.number, anchor), anchor);
    milestone('public-advanced:' + ranges);
    const txid = await syncTxid(context, session, accept);
    milestone('txid:' + JSON.stringify(txid.at(-1)));
    const notes = await readNotes(session, signal, 'advance');
    const created = notes.filter((note) => note.txid !== undefined && bare(note.txid) === bare(previous.transactionHash));
    assert.equal(created.length, 1);
    const output = created[0];
    assert.equal(sha(output.id), previous.outputNoteIdSha256);
    assert.equal(String(output.amount), previous.outputAmount);
    assert.equal(output.spentTxid, false);
    const hold = bound(await holds(session, signal, owner, milestone), 'railgun-private-transfer', previous.holdIdSha256);
    lane = await session.openPoiRecovery({ signal, reviewDisclosures: accept('poi-reproof-prepare') });
    // The original handoff prepared through the Shield route (live-poi), so the
    // replacement uses the same route; a mismatch refuses in the membership owner.
    const prepared = await lane.reproveRetiredShield(hold.holdId).then(
      (value) => value,
      (error) => ({ status: 'error', code: error?.code ?? 'unknown-error' })
    );
    milestone('poi-reproof-prepared:' + JSON.stringify({ status: prepared.status, stage: prepared.stage ?? null }));
    await closeLane(lane);
    lane = null;
    const preparation =
      prepared.status === 'reproof-prepared'
        ? {
            status: prepared.status,
            capsuleDigestSha256: sha(prepared.capsuleDigest),
            payloadSha256: prepared.payloadSha256,
            reproofRevision: prepared.reproofRevision,
            circuit: prepared.circuit,
          }
        : { status: prepared.status, stage: prepared.stage ?? null, code: prepared.code ?? null };
    const base = {
      schema: 'railgun-installed-live-poi-reproof-v1',
      holdIdSha256: previous.holdIdSha256,
      transactionHash: previous.transactionHash,
      outputNoteIdSha256: previous.outputNoteIdSha256,
      outputAmount: previous.outputAmount,
      inputAmount: previous.inputAmount,
      anchor,
      ranges,
      txid,
      prepared: preparation,
      original: state0.poi.finished.outcome,
      retry: state0.retry.finished.outcome,
    };
    if (prepared.status !== 'reproof-prepared') {
      // Nothing reserved or read: a later run may prepare again.
      await closeSession(session);
      session = null;
      return finishReport(context, { ...base, unit: null, observedAt: null, owned: null, skipped: false, reproof: null, continuable: false, stop: true, consents });
    }
    const unit = budget(context, 'poi-status');
    const owned = await session
      .observeOwnedPoi({ noteId: output.id, signal, reviewDisclosure: accept('owned-poi') })
      .then((value) => value, (error) => ({ code: error?.code ?? 'unknown-error' }));
    milestone('owned-poi:' + JSON.stringify(owned.statuses ?? owned.code));
    const observed = {
      unit,
      observedAt: Date.now(),
      owned: { statuses: owned.statuses ?? null, allValid: owned.allValid ?? false, inputType: owned.inputType ?? null, code: owned.code ?? null },
    };
    const valid = owned.allValid === true && owned.inputType === 'Transact';
    const missing = !owned.code && owned.inputType === 'Transact' && JSON.stringify(owned.statuses) === JSON.stringify(['Missing']);
    if (!missing) {
      // Valid already: the prepared replacement stays local. Anything else: a stop.
      await closeSession(session);
      session = null;
      return finishReport(context, { ...base, ...observed, skipped: true, reproof: null, continuable: valid, stop: !valid, consents });
    }
    const reproofId = ledger.poiReproofReserve(profile, header, {
      holdIdSha256: previous.holdIdSha256,
      originalHandoffId: state0.poi.pending.handoffId,
      originalCapsuleDigestSha256: state0.poi.pending.binding.capsuleDigestSha256,
      originalPayloadSha256: state0.poi.pending.binding.payloadSha256,
      retryId: state0.retry.pending.retryId,
      replacementPayloadSha256: prepared.payloadSha256,
      circuit: prepared.circuit,
    });
    milestone('ledger-reserved:poi-reproof');
    fault(context, 'exit-after-poi-reproof-reserve');
    lane = await session.openPoiRecovery({ signal, reviewDisclosures: accept('poi-reproof') });
    const outcome = await lane.submitReproof(hold.holdId).then(
      (value) => value,
      (error) => ({ status: 'error', code: error?.code ?? 'unknown-error' })
    );
    ledger.poiReproofFinish(profile, header, reproofId, {
      status: outcome.status,
      stage: outcome.stage ?? null,
      classification: outcome.response?.classification ?? null,
      diagnostic: outcome.response?.diagnostic ?? null,
      code: outcome.code ?? null,
    });
    milestone('poi-reproof-submitted:' + JSON.stringify({ status: outcome.status, classification: outcome.response?.classification ?? null }));
    await closeLane(lane);
    lane = null;
    await closeSession(session);
    session = null;
    return finishReport(context, {
      ...base,
      ...observed,
      skipped: false,
      reproof: {
        prepared: preparation,
        submitted: { status: outcome.status, stage: outcome.stage ?? null, response: outcome.response ?? null, code: outcome.code ?? null },
      },
      // A response is never acceptance: a later status read decides.
      continuable: false,
      stop: false,
      consents,
    });
  } finally {
    await closeLane(lane);
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
// Journey-6 transport evidence, read from an attempt's own frozen telemetry.
// Qualifies only a refusal of prepareUnshield itself (no broadcast began) with
// at least one primary transport failure inside that preparation interval and
// before its refusal; aborts only as fallout after such a failure; no provider
// error, malformed answer, non-200 status or unclassified failure anywhere; a
// complete trace and an unexpired vault. Anything else stops: a transport
// failure outside the interval, abort-only, mixed or truncated evidence. A
// qualifying trace is eligibility evidence, not proof of no local defect.
const PRIMARY_TRANSPORT = Object.freeze({
  live: Object.freeze(['TOR_REQUEST_FAILED', 'TOR_REQUEST_TIMEOUT']),
  synthetic: Object.freeze(['SYNTHETIC_INJECTED_FAULT']),
});
function transportQualified(telemetry, transport) {
  const refuse = (reason) => Object.freeze({ qualified: false, reason });
  if (!telemetry || telemetry.version !== 1) return refuse('no-telemetry');
  if (telemetry.transport !== transport || !Object.hasOwn(PRIMARY_TRANSPORT, transport)) return refuse('transport');
  if (telemetry.complete !== true || telemetry.inflight !== 0) return refuse('incomplete');
  if (telemetry.lifecycle?.sessionAbortedAfterMs != null) return refuse('lifetime');
  const marks = telemetry.marks ?? [];
  const labels = marks.map((row) => row.label);
  const start = marks.find((row) => row.label === 'prepare:start');
  const refused = marks.find((row) => row.label === 'prepare:refused');
  if (!start || !refused || labels.filter((label) => label === 'prepare:start').length !== 1) return refuse('interval');
  if (labels.includes('prepare:end') || labels.includes('broadcast:start')) return refuse('not-a-preparation-refusal');
  if (!(start.seq <= refused.seq && start.at <= refused.at)) return refuse('ordering');
  const primary = PRIMARY_TRANSPORT[transport];
  const entries = telemetry.entries ?? [];
  const failed = (row) => row.code !== null || row.status !== 200 || row.rpcError !== null || row.shapeInvalid === true;
  // Integrity-class evidence anywhere: a provider error, malformed answer,
  // non-200 status or an unclassified error never qualifies a repetition.
  if (
    entries.some(
      (row) =>
        failed(row) &&
        !primary.includes(row.code) &&
        row.code !== 'PRIVACY_REQUEST_ABORTED'
    )
  )
    return refuse('non-transport-failure');
  // The interval: requests begun after the start mark and before the refusal,
  // and completed by it.
  const inside = (row) => row.seq > start.seq && row.seq <= refused.seq && row.startAt + row.ms <= refused.at;
  const transportFailures = entries.filter((row) => primary.includes(row.code));
  const primaryInside = transportFailures.filter(inside);
  if (primaryInside.length === 0)
    return refuse(transportFailures.length ? 'transport-outside-interval' : entries.some(failed) ? 'abort-only' : 'no-failure');
  const first = Math.min(...primaryInside.map((row) => row.startAt + row.ms));
  // Aborts: only after a primary transport failure, attributed to one.
  for (const row of entries.filter((value) => value.code === 'PRIVACY_REQUEST_ABORTED')) {
    if (!inside(row)) return refuse('abort-outside-interval');
    const after = entries.find((value) => value.seq === row.afterFailureSeq);
    if (!after || !primary.includes(after.code) || row.startAt + row.ms < first) return refuse('abort-provenance');
  }
  return Object.freeze({
    qualified: true,
    reason: 'transport-in-preparation',
    primaryFailures: primaryInside.length,
    aborts: entries.filter((value) => value.code === 'PRIVACY_REQUEST_ABORTED').length,
  });
}
// Journey-6: the custody report a further unshield follows, as it stands.
function assertCustodyAdmits(context, custody) {
  assert.ok(custody, 'No custody verification');
  assert.equal(custody.schema, 'railgun-installed-live-custody-v1');
  assertChained(context, custody);
  assert.equal(custody.verdict, 'no-hold', 'Custody not established');
  assert.ok(['first-instrumented', 'transport-qualified'].includes(custody.eligibility), 'No eligibility');
  assert.equal(custody.stop, false);
  const sends = ledger.inspect(context.profile, context.header).sends;
  const last = sends.at(-1);
  assert.ok(last?.finished, 'A pending reservation: observation only');
  assert.equal(last.pending.attemptId, custody.attemptId);
  assert.equal(last.finished.outcome.classification, ledger.REFUSED);
  assert.equal(Object.hasOwn(last.finished.outcome, 'transactionHash'), false);
}
// Journey-6's observation-only custody verification of the previous refused
// attempt: its own report as it stands, its eligibility (the bound journey-5
// attempt is an instrumented first attempt; a later one needs qualifying
// transport evidence in its own telemetry), then one bounded read of the
// exact output and the complete authenticated hold inventory against the
// original before-set. It never finishes, changes or re-reports a reservation.
async function custodyVerify(context) {
  const { facade, signal, milestone, owner, previous, profile, header } = context;
  const mark = context.mark ?? (() => {});
  assert.equal(header.name, ledger.JOURNEY6, 'Custody verification runs on the bounded-attempts link only');
  const { attempts } = header.binding;
  const state = ledger.inspect(profile, header);
  const last = state.sends.at(-1);
  assert.ok(last?.finished, 'A pending reservation: observation only');
  assert.equal(last.pending.send, 'unshield');
  assert.equal(last.finished.outcome.classification, ledger.REFUSED);
  assert.equal(Object.hasOwn(last.finished.outcome, 'transactionHash'), false);
  // The attempt's own recorded report, exactly: never a reconcile report.
  assert.equal(previous.schema, 'railgun-installed-live-unshield-v1');
  assert.equal(previous.reportMode, 'live-unshield');
  assertChained(context, previous);
  assert.deepEqual(previous.outcome, last.finished.outcome);
  assert.equal(previous.holdIdSha256, null);
  assert.equal(previous.g1, null);
  assert.equal(previous.stop, true);
  assert.equal(previous.outputNoteIdSha256, attempts.previous.unsent.outputNoteIdSha256);
  assert.deepEqual(previous.unshield, attempts.previous.unsent.unshield);
  let eligibility = null,
    evidence;
  if (state.sends.length === 3) {
    assert.equal(last.pending.attemptId, attempts.previous.attemptId);
    assert.equal(previous.reportSha256, attempts.previous.report.reportSha256);
    // L60 recorded no telemetry: an explicitly instrumented, bounded attempt,
    // not a proven transport retry.
    eligibility = 'first-instrumented';
    evidence = { reason: 'bound-refusal-without-telemetry' };
  } else {
    evidence = transportQualified(previous.telemetry, context.synthetic ? 'synthetic' : 'live');
    if (evidence.qualified) eligibility = 'transport-qualified';
  }
  const base = {
    schema: 'railgun-installed-live-custody-v1',
    attemptId: last.pending.attemptId,
    attemptReportSha256: previous.reportSha256,
    eligibility,
    evidence,
    outputNoteIdSha256: attempts.previous.unsent.outputNoteIdSha256,
    unshield: attempts.previous.unsent.unshield,
  };
  // Not eligible: no read, no budget; the batch stops here.
  if (!eligibility) return finishReport(context, { ...base, verdict: 'not-eligible', unit: null, stop: true });
  const unit = budget(context, 'custody-verify', { attemptId: last.pending.attemptId });
  let session;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    const notes = await readNotes(session, signal, 'advance');
    const outputs = notes.filter((note) => sha(note.id) === attempts.previous.unsent.outputNoteIdSha256);
    assert.equal(outputs.length, 1, 'The exact output');
    assert.equal(String(outputs[0].amount), attempts.previous.unsent.unshield.amount);
    assert.equal(outputs[0].spentTxid, false, 'The output is unspent');
    assert.equal(outputs[0].asset?.contract?.toLowerCase(), attempts.previous.unsent.unshield.asset);
    // A failed or incomplete history read throws: it never means no hold.
    mark('custody-history:start');
    const records = await holds(session, signal, owner, milestone);
    mark('custody-history:end');
    const current = records.map((record) => sha(record.holdId)).sort();
    const matched = JSON.stringify(current) === JSON.stringify(attempts.previous.holdIdsBeforeSha256);
    await closeSession(session);
    session = null;
    return finishReport(context, {
      ...base,
      verdict: matched ? 'no-hold' : 'hold-present',
      holdCount: current.length,
      beforeSetMatched: matched,
      unit,
      observedAt: Date.now(),
      stop: !matched,
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
  'live-upgrade-rebuild': upgradeRebuild,
  'live-poi-retry': poiRetry,
  'live-reproof-rebuild': reproofRebuild,
  'live-poi-reproof': poiReproof,
  'live-custody-verify': custodyVerify,
});
module.exports = {
  MODES,
  rangesTo,
  windowEnd,
  resumePlan,
  upgradePlan,
  assertChained,
  scanStart,
  sha,
  transportQualified,
  assertCustodyAdmits,
};
