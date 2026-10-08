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
function rangesTo(from, anchor) {
  const result = [];
  for (let start = from; start <= anchor.number; ) {
    const to = Math.min(start + RANGE - 1 - (start % RANGE), anchor.number);
    result.push(Object.freeze({ to, anchor: Object.freeze({ ...anchor }) }));
    start = to + 1;
  }
  return result;
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
function budget(context, kind) {
  const caps = context.header.caps;
  const policy =
    kind.startsWith('observe:') ? caps.observePerSend
    : kind === 'poi-status' ? caps.poiStatus
    : kind.startsWith('readback:') ? caps.readbackPerSend
    : kind === 'scan-open:new' ? { max: caps.rebuildNew }
    : kind === 'scan-open:pending' ? { max: caps.scanResumes }
    : kind === 'scan-range' ? { max: caps.scanRanges }
    : kind === 'txid-page' ? { max: caps.txidPages }
    : null;
  assert.ok(policy, 'Unbudgeted unit');
  return ledger.consume(context.profile, context.header, kind, policy);
}
function heldReviews(owner, milestone, seen) {
  return {
    reviewDisclosures(summary, context) {
      assert.equal(context.signal.aborted, false);
      assert.equal(summary.chainId, CHAIN_ID);
      assert.equal(summary.retryEnabled, false);
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
function recoveryOptions(owner, kind, milestone, seen, send) {
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
  const lane = await session.openRecovery({ ...recoveryOptions(owner, null, milestone, [], false), signal });
  try {
    const page = await lane.history();
    assert.equal(page.nextAfter, null);
    return page.records;
  } finally {
    await closeLane(lane);
  }
}
function only(records, kind) {
  const rows = records.filter((record) => record.kind === kind);
  assert.equal(rows.length, 1, 'Exactly one held operation of this kind');
  return rows[0];
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
    const ranges = rangesTo(0, anchor);
    const statuses = {};
    for (const range of ranges) {
      budget(context, 'scan-range');
      const result = await session.advancePublic(range);
      statuses[result.status] = (statuses[result.status] || 0) + 1;
    }
    milestone('public-rebuilt:' + ranges.length);
    lane = await session.openRead({ wallet: 'new', signal });
    const notes = await lane.notes(undefined, true);
    await closeLane(lane);
    lane = null;
    lane = await session.openRecovery({ ...recoveryOptions(owner, 'railgun-private-transfer', milestone, seen, false), signal });
    const page = await lane.history();
    assert.equal(page.nextAfter, null);
    const hold = only(page.records, 'railgun-private-transfer');
    assert.equal(hold.localState, 'proof-present');
    const proof = await lane.resumeProof(hold.holdId);
    assert.equal(proof.status, 'proof-present');
    await closeLane(lane);
    lane = null;
    const held = [];
    budget(context, 'readback:transfer');
    const observed = await withHeld(session, signal, heldReviews(owner, milestone, held), (l) => l.observe(hold.holdId));
    await closeSession(session);
    session = null;
    return finishReport(context, {
      schema: 'railgun-installed-live-rebuild-v1',
      publicCache,
      anchor,
      ranges: ranges.length,
      advanceStatuses: statuses,
      notes: noteSummary(notes),
      holds: page.records.length,
      holdIdSha256: sha(hold.holdId),
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
  if (result.classification === 'not-acknowledged') return { ...result, classification: 'refused-before-send' };
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
    const hold = only(await holds(session, signal, owner, milestone), 'railgun-private-transfer');
    assert.equal(sha(hold.holdId), previous.holdIdSha256);
    budget(context, 'readback:transfer');
    const before = await withHeld(session, signal, heldReviews(owner, milestone, held), (l) => l.observe(hold.holdId));
    assert.equal(before.status, 'unjournaled', 'A journaled attempt exists: observation only');
    const attemptId = ledger.reserve(profile, header, 'transfer', { holdIdSha256: previous.holdIdSha256 });
    milestone('ledger-reserved:transfer');
    lane = await session.openRecovery({ ...recoveryOptions(owner, 'railgun-private-transfer', milestone, seen, true), signal });
    let outcome,
      failure = null;
    try {
      outcome = await lane.submitStored(hold.holdId);
    } catch (error) {
      failure = typeof error?.code === 'string' ? error.code : 'unknown-error';
    }
    await closeLane(lane);
    lane = null;
    budget(context, 'readback:transfer');
    const after = await withHeld(session, signal, heldReviews(owner, milestone, held), (l) => l.observe(hold.holdId));
    const result = readback(failure ? { classification: 'not-acknowledged', error: failure } : classify(outcome), after);
    const sends = ledger.finish(profile, header, attemptId, result);
    milestone('ledger-finished:transfer:' + result.classification);
    await closeSession(session);
    session = null;
    return finishReport(context, {
      schema: 'railgun-installed-live-submit-v1',
      send: 'transfer',
      holdIdSha256: previous.holdIdSha256,
      outcome: result,
      g1: { status: after.status, observation: after.observation ?? null, transact: after.transact ?? null },
      ledgerSends: sends.length,
      stop: result.classification === 'refused-before-send',
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
    const hold = only(await holds(session, signal, owner, milestone), kind);
    assert.equal(sha(hold.holdId), previous.holdIdSha256);
    for (;;) {
      attempts++;
      budget(context, 'observe:' + send);
      observation = await withHeld(session, signal, heldReviews(owner, milestone, held), (l) => l.observe(hold.holdId));
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
        const tried = await withHeld(session, signal, heldReviews(owner, milestone, held), (l) =>
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
    const matched =
      (resolution?.outcome === 'matched') ||
      (observation.resolved === true && observation.transact?.status === 'matched');
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
      stop: !matched && (observation.observation?.status === 'reverted' || observation.transact?.status === 'anomaly' || observation.observation?.status === 'nonce-consumed'),
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
    const ranges = rangesTo(rebuildReport.anchor.number + 1, anchor);
    for (const range of ranges) {
      budget(context, 'scan-range');
      await session.advancePublic(range);
    }
    milestone('public-advanced:' + ranges.length);
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
    const hold = only(await holds(session, signal, owner, milestone), 'railgun-private-transfer');
    assert.equal(sha(hold.holdId), previous.holdIdSha256);
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
      ranges: ranges.length,
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
  const freshness = params.poiStatusMaxAgeMs ?? 6 * 3600 * 1000;
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
    const attemptId = ledger.reserve(profile, header, 'unshield', { outputNoteIdSha256: previous.outputNoteIdSha256 });
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
    await closeLane(lane);
    lane = null;
    const added = (await holds(session, signal, owner, milestone)).filter((record) => !beforeIds.has(record.holdId));
    assert.ok(added.length <= 1, 'More than one new held operation');
    let after = null;
    if (added.length === 1) {
      assert.equal(added[0].kind, 'railgun-token-unshield');
      budget(context, 'readback:unshield');
      after = await withHeld(session, signal, heldReviews(owner, milestone, held), (l) => l.observe(added[0].holdId));
    }
    const result = readback(failure ? { classification: 'not-acknowledged', error: failure } : classify(outcome), after);
    const sends = ledger.finish(profile, header, attemptId, result);
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
      stop: result.classification === 'refused-before-send',
      reviews: { lane: seen, held },
    });
  } finally {
    await closeLane(lane);
    await closeSession(session);
  }
}
// Read-only conservation account of the completed journey.
async function summary(context) {
  const { facade, signal, previous, lineage, readReceipt, readFinalized, milestone } = context;
  assert.equal(previous.schema, 'railgun-installed-live-observe-v1');
  assertChained(context, previous);
  assert.equal(previous.send, 'unshield');
  const transfer = lineage.transfer,
    poiReport = lineage.poi,
    scan = lineage.scan;
  for (const report of [transfer, poiReport, scan]) assertChained(context, report);
  assert.equal(scan.schema, 'railgun-installed-live-poi-v1');
  let session;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    // Advance through the unshield so residual notes reflect its spend.
    const anchor = await readFinalized();
    const ranges = rangesTo(scan.anchor.number + 1, anchor);
    for (const range of ranges) {
      budget(context, 'scan-range');
      await session.advancePublic(range);
    }
    milestone('public-advanced:' + ranges.length);
    const notes = await readNotes(session, signal, 'advance');
    const spentOutput = notes.filter((note) => note.spentTxid !== false && bare(note.spentTxid) === bare(previous.transactionHash));
    assert.equal(spentOutput.length, 1, 'The unshield spent exactly the transfer output');
    assert.equal(sha(spentOutput[0].id), scan.outputNoteIdSha256);
    await closeSession(session);
    session = null;
    const output = previous.resolution?.output ?? previous.final.output;
    assert.equal(output.kind, 'unshield');
    const receipts = {};
    assert.equal(transfer.schema, 'railgun-installed-live-submit-v1');
    for (const [name, hash] of [['transfer', transfer.outcome.transactionHash], ['unshield', previous.transactionHash]])
      receipts[name] = await readReceipt(hash);
    const gasWei = Object.values(receipts).reduce((sum, r) => sum + BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice), 0n);
    return finishReport(context, {
      schema: 'railgun-installed-live-summary-v1',
      trust: 'unverified-rpc',
      input: { amount: poiReport.inputAmount, spentBy: transfer.outcome.transactionHash },
      transferOutput: { amount: poiReport.outputAmount, spentBy: previous.transactionHash },
      unshield: { amount: output.amount, received: output.received, fee: output.fee, recipient: output.recipient },
      gas: { transfer: receipts.transfer, unshield: receipts.unshield, totalWei: gasWei.toString(), withinCap: gasWei <= 4000000000000000n },
      conservation: {
        transferFullValue: poiReport.inputAmount === poiReport.outputAmount,
        unshieldFullOutput: output.amount === poiReport.outputAmount,
        receivedPlusFee: (BigInt(output.received) + BigInt(output.fee)).toString() === output.amount,
      },
      scanAnchor: anchor,
      residualNotes: noteSummary(notes),
    });
  } finally {
    await closeSession(session);
  }
}
const MODES = Object.freeze({
  'live-rebuild': rebuild,
  'live-submit': submit,
  'live-observe': observe,
  'live-poi': poi,
  'live-poi-status': poiStatus,
  'live-unshield': unshield,
  'live-summary': summary,
});
module.exports = { MODES, rangesTo, sha };
