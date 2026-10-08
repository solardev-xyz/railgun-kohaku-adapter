/** Journey recipes over the genuine installed public facade only. The synthetic
 * chain handle is harness control (mining), never passed to an owner.
 */
'use strict';
const assert = require('assert/strict');
const { publicFixture, ranges, SOURCE_SHA256 } = require('./read-scenario.cjs');
const { ENDPOINT, SUBMITTER, TOKEN, POI_URL } = require('./journey-chain.cjs');
const HEX = /^[0-9a-f]{64}$/;
const TX_HASH = /^0x[0-9a-f]{64}$/;
const DIGEST = /^0x[0-9a-f]{64}$/;
const PREPARED = 'railgun-journey-prepared-v1';
const GAS_LIMIT = 1500000n;
const MAX_GAS_FEE = 2000000000000000n;
async function closeOriginal(lane, session) {
  try {
    if (lane) {
      lane.close();
      await lane.closed;
    }
  } finally {
    if (session) {
      session.close();
      await session.closed;
    }
  }
}
function singleProof(page, holdId, localState = 'proof-present') {
  assert.deepEqual(Object.keys(page).sort(), ['nextAfter', 'records', 'totalSigning']);
  assert.equal(page.nextAfter, null);
  assert.equal(page.totalSigning, 1);
  assert.equal(page.records.length, 1);
  const record = page.records[0];
  assert.match(record.holdId, HEX);
  if (holdId !== undefined) assert.equal(record.holdId, holdId);
  assert.equal(record.kind, 'railgun-private-transfer');
  assert.equal(record.localState, localState);
  return record.holdId;
}
function present(value, holdId) {
  assert.equal(value.status, 'proof-present');
  assert.equal(value.holdId, holdId);
  assert.match(value.transactionDigest, DIGEST);
  assert.equal(value.submissionEnabled, false);
  return value.transactionDigest;
}
const keys = (value) => Object.keys(value).sort();
async function prepare({ facade, sourceBytes, signal, milestone }) {
  const fixture = publicFixture(sourceBytes);
  let session,
    lane,
    reviews = 0;
  try {
    session = await facade.createAccount({ accountIndex: 0, signal });
    assert.equal(session.describe().instanceId, fixture.instanceId);
    for (const range of ranges()) await session.advancePublic(range);
    milestone('public-advanced');
    lane = await session.openPrivate({
      wallet: 'new',
      signal,
      gasLimit: GAS_LIMIT,
      maxGasFee: MAX_GAS_FEE,
      reviewPreparation(summary, context) {
        assert.equal(++reviews, 1);
        assert.equal(context.signal.aborted, false);
        assert.equal(summary.purpose, 'railgun-private-preparation');
        assert.equal(summary.operation, 'railgun-private-transfer');
        assert.equal(summary.inputType, 'Shield');
        assert.equal(summary.amount, '2000');
        assert.equal(summary.recipient, fixture.instanceId);
        assert.equal(summary.submitter, SUBMITTER);
        assert.equal(summary.selection.noteId, '0:1');
        assert.equal(summary.broadcastsTransaction, false);
        return true;
      },
      reviewTransaction() {
        throw Error('Broadcast is withheld in preparation');
      },
    });
    const selected = (await lane.notes()).filter((note) => note.id === '0:1');
    assert.equal(selected.length, 1);
    assert.equal(selected[0].amount, 2000n);
    assert.equal(selected[0].spentTxid, false);
    milestone('prepare-called');
    const prepared = await lane.prepareTransfer(
      { asset: { __type: 'erc20', contract: TOKEN }, amount: 2000n, noteId: '0:1' },
      fixture.instanceId
    );
    milestone('prepare-returned');
    assert.deepEqual(Object.keys(prepared), ['handle']);
    lane.close();
    await lane.closed;
    lane = null;
    lane = await session.openRecovery({
      signal,
      gasLimit: GAS_LIMIT,
      maxGasFee: MAX_GAS_FEE,
      reviewDisclosures() {
        throw Error('No submission disclosure in preparation');
      },
      reviewTransaction() {
        throw Error('No transaction in preparation');
      },
    });
    const holdId = singleProof(await lane.history());
    const transactionDigest = present(await lane.resumeProof(holdId), holdId);
    await closeOriginal(lane, session);
    lane = session = null;
    milestone('original-closed');
    return Object.freeze({
      schema: PREPARED,
      sourceSha256: SOURCE_SHA256,
      status: 'prepared-unbroadcast',
      holdId,
      transactionDigest,
      preparationReviews: reviews,
      publicRanges: ranges().length,
    });
  } finally {
    await closeOriginal(lane, session);
  }
}
function submissionReviews(milestone) {
  const seen = { disclosures: [], transactions: [] };
  return {
    seen,
    reviewDisclosures(summary, signal) {
      milestone('disclosure-review:' + JSON.stringify({ keys: keys(summary), purpose: summary.purpose ?? null }));
      assert.equal(signal.aborted, false);
      seen.disclosures.push({ keys: keys(summary), purpose: summary.purpose ?? null });
      return true;
    },
    reviewTransaction(summary) {
      milestone('transaction-review:' + JSON.stringify(keys(summary)));
      seen.transactions.push({
        keys: keys(summary),
        operation: summary.operation ?? null,
        maxGasFee: summary.maxGasFee === undefined ? null : String(summary.maxGasFee),
        chainStateVerified: summary.chainStateVerified ?? null,
      });
      return true;
    },
  };
}
function heldReviews() {
  const seen = [];
  return {
    seen,
    reviewDisclosures(summary, context) {
      assert.equal(context.signal.aborted, false);
      assert.equal(summary.chainId, 11155111);
      assert.equal(summary.retryEnabled, false);
      if (summary.purpose === 'railgun-held-submission-observation-v1') {
        assert.equal(summary.submitter, SUBMITTER);
        assert.equal(summary.sendEnabled, false);
        assert.equal(summary.holdReleaseEnabled, false);
      } else {
        assert.equal(summary.purpose, 'railgun-held-submission-resolution-v1');
        assert.equal(summary.releasesHold, false);
        assert.equal(summary.minimumConfirmations, 12);
      }
      seen.push({ purpose: summary.purpose, keys: keys(summary) });
      return true;
    },
  };
}
async function observeHeld(session, signal, holdId, reviews) {
  let lane;
  try {
    lane = await session.openSubmissionRecovery({ signal, reviewDisclosures: reviews.reviewDisclosures });
    return await lane.observe(holdId);
  } finally {
    if (lane) {
      lane.close();
      await lane.closed;
    }
  }
}
async function resolveHeld(session, signal, holdId, reviews) {
  let lane;
  try {
    lane = await session.openSubmissionRecovery({ signal, reviewDisclosures: reviews.reviewDisclosures });
    return await lane.resolve(holdId, { minimumConfirmations: 12 });
  } finally {
    if (lane) {
      lane.close();
      await lane.closed;
    }
  }
}
function assertPrepared(previous) {
  assert.equal(previous.schema, PREPARED);
  assert.equal(previous.status, 'prepared-unbroadcast');
  assert.equal(previous.sourceSha256, SOURCE_SHA256);
  assert.match(previous.holdId, HEX);
  if (previous.transactionDigest !== null) assert.match(previous.transactionDigest, DIGEST);
}
// Cold held submission: the hold is unjournaled before the send, the
// original stored proof and signature are submitted once, a repeat refuses,
// and the exact journaled attempt is then observed by hold id alone.
async function submitStored({ signal, facade, previous, chain, milestone }, unknown, existing) {
  assertPrepared(previous);
  const holdId = previous.holdId;
  const held = heldReviews(),
    submission = submissionReviews(milestone);
  let session, lane;
  try {
    // A fence-marked account opens once per process: reuse a supplied session.
    session = existing ?? (await facade.openAccount({ accountIndex: 0, signal }));
    const beforeSend = await observeHeld(session, signal, holdId, held);
    assert.deepEqual(beforeSend, {
      status: 'unjournaled',
      holdId,
      kind: 'railgun-private-transfer',
      transactionHash: null,
      submissionEnabled: false,
      retryEnabled: false,
    });
    milestone('unjournaled-observed');
    lane = await session.openRecovery({
      signal,
      gasLimit: GAS_LIMIT,
      maxGasFee: MAX_GAS_FEE,
      reviewDisclosures: submission.reviewDisclosures,
      reviewTransaction: submission.reviewTransaction,
    });
    singleProof(await lane.history(), holdId);
    const digest = present(await lane.resumeProof(holdId), holdId);
    if (previous.transactionDigest !== null) assert.equal(digest, previous.transactionDigest);
    milestone('proof-present:' + digest);
    milestone('submit-called');
    const outcome = await lane.submitStored(holdId);
    milestone('submit-returned:' + JSON.stringify(outcome));
    let transactionHash;
    if (unknown) {
      assert.deepEqual(keys(outcome), ['submissionStatus', 'transactionHash']);
      assert.equal(outcome.submissionStatus, 'unknown');
      transactionHash = outcome.transactionHash;
    } else {
      assert.equal(outcome.from.toLowerCase(), SUBMITTER);
      assert.equal(outcome.chainId, 11155111);
      assert.equal(outcome.nonce, 0);
      transactionHash = outcome.hash;
    }
    assert.match(transactionHash, TX_HASH);
    const repeat = await lane.submitStored(holdId).then(
      (value) => ({ settled: 'fulfilled', keys: keys(value), status: value.status ?? null }),
      (error) => ({ settled: 'rejected', code: error?.code ?? null })
    );
    assert.ok(
      repeat.settled === 'rejected' ||
        (['recovery-required', 'refused'].includes(repeat.status) && !repeat.keys.includes('hash'))
    );
    milestone('repeat-refused');
    lane.close();
    await lane.closed;
    lane = null;
    const pending = await observeHeld(session, signal, holdId, held);
    assert.equal(pending.status, 'journaled');
    assert.equal(pending.transactionHash, transactionHash);
    assert.equal(pending.observation.status, 'pending');
    assert.equal(pending.transact, null);
    assert.equal(pending.output, null);
    assert.equal(pending.resolved, false);
    const mined = await chain.mine();
    assert.deepEqual(mined.included, [transactionHash]);
    milestone('mined');
    const included = await observeHeld(session, signal, holdId, held);
    assert.equal(included.status, 'journaled');
    assert.equal(included.observation.status, 'included');
    assert.equal(included.observation.blockNumber, mined.block);
    assert.equal(included.observation.confirmations, 20);
    assert.deepEqual(included.transact, {
      status: 'matched',
      operation: 'railgun-private-transfer',
      blockNumber: mined.block,
      blockHash: included.observation.blockHash,
    });
    assert.equal(included.output.kind, 'shielded');
    assert.match(included.output.noteId, /^0:\d+$/);
    assert.equal(included.trust, 'unverified-rpc');
    milestone('included-observed');
    let resolution = null;
    if (unknown) {
      resolution = await resolveHeld(session, signal, holdId, held);
      assert.deepEqual(resolution, {
        status: 'resolved',
        holdId,
        kind: 'railgun-private-transfer',
        transactionHash,
        outcome: 'matched',
        finalizedBlockNumber: resolution.finalizedBlockNumber,
        output: included.output,
        releasesHold: false,
        retryEnabled: false,
        trust: 'unverified-rpc',
      });
      assert.ok(resolution.finalizedBlockNumber >= mined.block);
      const reopened = await observeHeld(session, signal, holdId, held);
      assert.equal(reopened.resolved, true);
      milestone('resolved');
    }
    if (!existing) await closeOriginal(null, session);
    session = null;
    return Object.freeze({
      schema: unknown ? 'railgun-journey-submit-unknown-v1' : 'railgun-journey-submitted-v1',
      sourceSha256: SOURCE_SHA256,
      holdId,
      transactionDigest: previous.transactionDigest,
      transactionHash,
      submission: unknown ? 'unknown-after-delivery' : 'acknowledged',
      repeat,
      inclusionBlock: mined.block,
      output: included.output,
      resolution,
      reviews: { held: held.seen, submission: submission.seen },
      originalLaneAndSessionClosed: true,
    });
  } finally {
    await closeOriginal(lane, existing ? null : session);
  }
}
const bareHex = (value) => String(value).replace(/^0x/, '').toLowerCase();
function continuation(finalized) {
  const result = [];
  let from = ranges().at(-1).to + 1;
  const anchor = Object.freeze({ number: finalized, hash: '0x' + BigInt(finalized + 1000).toString(16).padStart(64, '0') });
  while (from <= finalized) {
    const to = Math.min(from + 99999, finalized);
    result.push(Object.freeze({ to, anchor }));
    from = to + 1;
  }
  return result;
}
function accept(milestone, label) {
  return (summary, context) => {
    milestone(label + ':' + JSON.stringify({ purpose: summary?.purpose ?? null, keys: keys(summary ?? {}) }));
    assert.equal((context?.signal ?? context)?.aborted, false);
    return true;
  };
}
// Cold receive and retained POI for the mined transfer output. The scan and
// list data remain synthetic and unverified-RPC; membership is the synthetic
// list node's, not production list trust.
async function coldOutput({ facade, signal, previous, chain, milestone }) {
  assert.equal(previous.schema, 'railgun-journey-submitted-v1');
  const { holdId, transactionHash } = previous;
  const outputId = previous.output.noteId;
  let session, lane;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    const extra = continuation(chain.state().finalized);
    for (const range of extra) await session.advancePublic(range);
    milestone('public-advanced:' + extra.length);
    lane = await session.openRead({ wallet: 'advance', signal });
    const notes = await lane.notes(undefined, true);
    lane.close();
    await lane.closed;
    lane = null;
    const view = (note) => ({
      id: note.id,
      amount: String(note.amount),
      txid: note.txid === undefined ? null : bareHex(note.txid),
      spentTxid: note.spentTxid === false ? false : bareHex(note.spentTxid),
      tag: note.tag,
    });
    milestone('notes:' + JSON.stringify(notes.map(view)));
    const input = notes.find((note) => note.id === '0:1'),
      output = notes.find((note) => note.id === outputId);
    assert.ok(input && output);
    assert.equal(bareHex(input.spentTxid), bareHex(transactionHash));
    assert.equal(bareHex(output.txid), bareHex(transactionHash));
    assert.equal(output.spentTxid, false);
    assert.equal(output.amount, 2000n);
    const txid = await session.synchronizeTxid({
      mode: 'initialize',
      signal,
      reviewDisclosure: accept(milestone, 'txid-review'),
    });
    milestone('txid:' + JSON.stringify(txid));
    // Negative control: an unresolved own submission blocks POI capture. The
    // transfer spent a Shield note, so its POI route is the Shield creator.
    lane = await session.openPoiRecovery({ signal, reviewDisclosures: accept(milestone, 'poi-review') });
    const blocked = await lane.prepareShield(holdId);
    milestone('poi-blocked:' + JSON.stringify(blocked));
    assert.deepEqual(blocked, { status: 'refused', stage: 'membership:preflight:capture:journal' });
    lane.close();
    await lane.closed;
    lane = null;
    const held = heldReviews();
    const resolution = await resolveHeld(session, signal, holdId, held);
    milestone('resolved:' + JSON.stringify(resolution));
    assert.equal(resolution.status, 'resolved');
    assert.equal(resolution.outcome, 'matched');
    assert.equal(resolution.transactionHash, transactionHash);
    assert.deepEqual(resolution.output, previous.output);
    lane = await session.openPoiRecovery({ signal, reviewDisclosures: accept(milestone, 'poi-review') });
    const prepared = await lane.prepareShield(holdId);
    milestone('poi-prepared:' + JSON.stringify(prepared));
    assert.equal(prepared.status, 'prepared');
    const recovered = await lane.recoverOutput(prepared.capsuleDigest);
    milestone('poi-recovered:' + JSON.stringify(recovered));
    assert.equal(recovered.status, 'matched');
    const submitted = await lane.submit(prepared.capsuleDigest);
    milestone('poi-submitted:' + JSON.stringify(submitted));
    lane.close();
    await lane.closed;
    lane = null;
    lane = await session.openPoiRecovery({ signal, reviewDisclosures: accept(milestone, 'poi-review') });
    const attempted = await lane.recoverAttemptedOutput(prepared.capsuleDigest);
    milestone('poi-attempted:' + JSON.stringify(attempted));
    lane.close();
    await lane.closed;
    lane = null;
    const owned = await session.observeOwnedPoi({
      noteId: outputId,
      signal,
      reviewDisclosure: accept(milestone, 'owned-poi-review'),
    });
    milestone('owned-poi:' + JSON.stringify(owned));
    assert.equal(owned.inputType, 'Transact');
    assert.equal(owned.allValid, true);
    await closeOriginal(null, session);
    session = null;
    return Object.freeze({
      schema: 'railgun-journey-cold-output-v1',
      sourceSha256: SOURCE_SHA256,
      holdId,
      transactionHash,
      outputNoteId: outputId,
      publicRanges: extra.length,
      notes: { input: view(input), output: view(output) },
      txid,
      unresolvedPoiRefusal: blocked,
      resolution,
      poi: { prepared, recovered, submitted, attempted },
      owned,
      originalLaneAndSessionClosed: true,
    });
  } finally {
    await closeOriginal(lane, session);
  }
}
// Spend the POI-valid Transact output to the fixed submitter EOA with the
// genuine private lane, then observe/resolve that exact unshield with G1.
async function transactUnshield({ facade, signal, previous, chain, milestone }) {
  assert.equal(previous.schema, 'railgun-journey-cold-output-v1');
  assert.equal(previous.owned.allValid, true);
  const outputId = previous.outputNoteId;
  const submission = submissionReviews(milestone);
  let session, lane, reviews = 0;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal });
    lane = await session.openPrivate({
      wallet: 'advance',
      signal,
      gasLimit: GAS_LIMIT,
      maxGasFee: MAX_GAS_FEE,
      reviewPreparation(summary, context) {
        reviews++;
        milestone('unshield-preparation-review:' + JSON.stringify({
          keys: keys(summary),
          operation: summary.operation,
          inputType: summary.inputType,
          amount: summary.amount,
          recipient: summary.recipient,
        }));
        assert.equal(context.signal.aborted, false);
        assert.equal(summary.operation, 'railgun-token-unshield');
        assert.equal(summary.inputType, 'Transact');
        assert.equal(summary.recipient.toLowerCase(), SUBMITTER);
        return true;
      },
      reviewTransaction: submission.reviewTransaction,
    });
    const selected = (await lane.notes()).filter((note) => note.id === outputId);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].amount, 2000n);
    milestone('unshield-prepare-called');
    const prepared = await lane.prepareUnshield(
      { asset: { __type: 'erc20', contract: TOKEN }, amount: 2000n, noteId: outputId },
      SUBMITTER
    );
    milestone('unshield-prepared');
    const outcome = await lane.broadcast(prepared.handle);
    milestone('unshield-broadcast:' + JSON.stringify(outcome));
    assert.equal(outcome.from.toLowerCase(), SUBMITTER);
    const transactionHash = outcome.hash;
    lane.close();
    await lane.closed;
    lane = null;
    lane = await session.openRecovery({
      signal,
      gasLimit: GAS_LIMIT,
      maxGasFee: MAX_GAS_FEE,
      reviewDisclosures() {
        throw Error('No recovery submission');
      },
      reviewTransaction() {
        throw Error('No recovery submission');
      },
    });
    const page = await lane.history();
    milestone('history:' + JSON.stringify(page));
    lane.close();
    await lane.closed;
    lane = null;
    const unshieldHolds = page.records.filter((record) => record.kind === 'railgun-token-unshield');
    assert.equal(unshieldHolds.length, 1);
    const holdId = unshieldHolds[0].holdId;
    const held = heldReviews();
    const pending = await observeHeld(session, signal, holdId, held);
    assert.equal(pending.transactionHash, transactionHash);
    assert.equal(pending.observation.status, 'pending');
    const mined = await chain.mine();
    assert.deepEqual(mined.included, [transactionHash]);
    const included = await observeHeld(session, signal, holdId, held);
    milestone('unshield-included:' + JSON.stringify(included));
    assert.equal(included.observation.status, 'included');
    assert.equal(included.transact.status, 'matched');
    assert.equal(included.transact.operation, 'railgun-token-unshield');
    assert.deepEqual(included.output, {
      kind: 'unshield',
      recipient: SUBMITTER,
      amount: '2000',
      received: '1995',
      fee: '5',
      feeDeviation: false,
    });
    const resolution = await resolveHeld(session, signal, holdId, held);
    milestone('unshield-resolved:' + JSON.stringify(resolution));
    assert.equal(resolution.outcome, 'matched');
    assert.deepEqual(resolution.output, included.output);
    await closeOriginal(null, session);
    session = null;
    return Object.freeze({
      schema: 'railgun-journey-transact-unshield-v1',
      sourceSha256: SOURCE_SHA256,
      spentNoteId: outputId,
      holdId,
      transactionHash,
      inclusionBlock: mined.block,
      output: included.output,
      resolution,
      preparationReviews: reviews,
      reviews: { held: held.seen, submission: submission.seen },
      originalLaneAndSessionClosed: true,
    });
  } finally {
    await closeOriginal(lane, session);
  }
}
// G4 and current-package policy change: an existing hold created under another
// public source policy (legacy 843c0cfc code, or an earlier package build).
// The active-only opening refuses; an explicit publicCache rescan follows, and
// incomplete public state must not authorize submission, preparation or POI.
async function rebuildRecover(options, legacy) {
  const { facade, signal, previous, chain, milestone, profileDirectory } = options;
  const { inventoryProfile, diffInventory } = require('./profile-inventory.cjs');
  const { createHash } = require('crypto');
  if (legacy) {
    assert.equal(previous.schema, 'railgun-journey-legacy-hold-v1');
    assert.equal(previous.liveness, 'proved-unsent');
  } else assertPrepared(previous);
  const holdId = previous.holdId;
  const before = inventoryProfile(profileDirectory);
  const outcome = (promise) =>
    promise.then(
      (value) => ({ settled: 'fulfilled', keys: value && typeof value === 'object' ? keys(value) : null, status: value?.status ?? null, stage: value?.stage ?? null, hash: typeof value?.hash === 'string' }),
      (error) => ({ settled: 'rejected', code: error?.code ?? null })
    );
  // A refused opener keeps single-account exclusion until its acquired owners
  // drain; no handle exposes that drain, so wait for release (bounded).
  const waits = [];
  const openReleased = async (publicCache) => {
    const codes = [];
    for (let attempt = 1; ; attempt++) {
      try {
        const session = await facade.openAccount({ accountIndex: 0, signal, ...(publicCache ? { publicCache } : {}) });
        waits.push({ publicCache: publicCache ?? 'active', attempts: attempt, codes });
        return session;
      } catch (error) {
        codes.push(error?.code ?? null);
        // Facade key and (cooperative) writer-fence release of the refused opener.
        if (!['RAILGUN_ACCOUNT_FACADE_REFUSED', 'RAILGUN_ACCOUNT_ENROLLMENT_REFUSED'].includes(error?.code) || attempt >= 50)
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  };
  const withSession = async (publicCache, use) => {
    let session;
    try {
      session = await openReleased(publicCache);
      return await use(session);
    } finally {
      if (session) {
        session.close();
        await session.closed.catch(() => {});
      }
    }
  };
  const recoveryOptions = (submission) => ({
    signal,
    gasLimit: GAS_LIMIT,
    maxGasFee: MAX_GAS_FEE,
    reviewDisclosures: submission ? submission.reviewDisclosures : () => true,
    reviewTransaction: submission ? submission.reviewTransaction : () => true,
  });
  const lane = async (session, open, use) => {
    const opened = await open(session);
    try {
      return await use(opened);
    } finally {
      opened.close();
      await opened.closed.catch(() => {});
    }
  };
  // 1. The unchanged active-only opening refuses the foreign-policy generation.
  const active = await outcome(facade.openAccount({ accountIndex: 0, signal }).then(async (session) => {
    session.close();
    await session.closed;
    return { status: 'opened' };
  }));
  milestone('active-open:' + JSON.stringify(active));
  assert.deepEqual(active, { settled: 'rejected', code: 'RAILGUN_ACCOUNT_PUBLIC_REFUSED' });
  // 2. publicCache "new" begins a fresh generation; before any advance nothing
  // dependent may proceed. Each control runs in its own resumed session.
  const controls = {};
  controls.open = await outcome(withSession('new', async () => ({ status: 'opened' })));
  milestone('public-cache-new:' + JSON.stringify(controls.open));
  assert.equal(controls.open.settled, 'fulfilled');
  controls.history = await outcome(withSession('pending', (session) => lane(session, (s) => s.openRecovery(recoveryOptions()), (l) => l.history())));
  controls.resumeProof = await outcome(withSession('pending', (session) => lane(session, (s) => s.openRecovery(recoveryOptions()), (l) => l.resumeProof(holdId))));
  controls.submitStored = await outcome(withSession('pending', (session) => lane(session, (s) => s.openRecovery(recoveryOptions()), (l) => l.submitStored(holdId))));
  controls.prepareTransfer = await outcome(
    withSession('pending', (session) =>
      lane(
        session,
        (s) =>
          s.openPrivate({
            wallet: 'new',
            signal,
            gasLimit: GAS_LIMIT,
            maxGasFee: MAX_GAS_FEE,
            reviewPreparation: () => true,
            reviewTransaction: () => true,
          }),
        (l) => l.prepareTransfer({ asset: { __type: 'erc20', contract: TOKEN }, amount: 2000n, noteId: '0:1' }, SUBMITTER)
      )
    )
  );
  controls.poiPrepare = await outcome(withSession('pending', (session) => lane(session, (s) => s.openPoiRecovery({ signal, reviewDisclosures: () => true }), (l) => l.prepareShield(holdId))));
  controls.ownedPoi = await outcome(withSession('pending', (session) => session.observeOwnedPoi({ noteId: '0:1', signal, reviewDisclosure: () => true })));
  milestone('incomplete-public-controls:' + JSON.stringify(controls));
  assert.equal(chain.state().transactions.length, 0, 'No send while public state is incomplete');
  for (const name of ['submitStored', 'prepareTransfer', 'poiPrepare'])
    assert.ok(controls[name].settled === 'rejected' || ['refused', 'recovery-required'].includes(controls[name].status), name);
  assert.ok(!controls.submitStored.hash);
  // 3. Complete the explicit rescan through the resumed candidate.
  await withSession('pending', async (session) => {
    for (const range of ranges()) await session.advancePublic(range);
  });
  milestone('rescan-complete');
  // The private wallet generation is policy-bound too: rebuild it explicitly
  // over the completed public generation and check the held input.
  const wallet = await withSession(undefined, (session) =>
    lane(
      session,
      (s) => s.openRead({ wallet: 'new', signal }),
      async (read) => {
        const notes = await read.notes(undefined, true);
        const input = notes.find((note) => note.id === '0:1');
        assert.ok(input && input.amount === 2000n && input.spentTxid === false);
        return { notes: notes.length, inputUnspent: true };
      }
    )
  );
  milestone('wallet-rebuilt:' + JSON.stringify(wallet));
  // 4. The active opening now works; continue the ordinary held submission.
  const result = await submitStored(
    {
      ...options,
      previous: legacy
        ? { schema: PREPARED, status: 'prepared-unbroadcast', sourceSha256: SOURCE_SHA256, holdId, transactionDigest: null }
        : previous,
    },
    false
  );
  const sent = chain.state().transactions.find((tx) => tx.hash === result.transactionHash);
  const sentDataSha256 = createHash('sha256').update(Buffer.from(sent.input.slice(2), 'hex')).digest('hex');
  if (legacy) {
    assert.equal(sentDataSha256, previous.continuity.provedDataSha256, 'Sent calldata differs from the legacy proof');
    milestone('legacy-calldata-identical');
  }
  const after = inventoryProfile(profileDirectory);
  return Object.freeze({
    ...result,
    rebuild: {
      origin: legacy ? 'legacy-843c0cfc' : 'earlier-package-build',
      activeOpening: active,
      incompletePublicControls: controls,
      exclusionReleaseAttempts: waits,
      walletRebuild: wallet,
      sentDataSha256,
      calldataMatchesOrigin: legacy ? true : null,
      inventory: {
        ...(legacy ? { sinceOrigin: diffInventory(previous.profileInventory, before) } : {}),
        thisRun: diffInventory(before, after),
      },
    },
  });
}
// Current-package policy change on a fence-marked (cooperative) account, which
// keeps its writer connection until process exit: one session per process.
async function policyProbe({ facade, signal, previous }) {
  assertPrepared(previous);
  const active = await facade.openAccount({ accountIndex: 0, signal }).then(
    async (session) => {
      session.close();
      await session.closed;
      return { settled: 'fulfilled' };
    },
    (error) => ({ settled: 'rejected', code: error?.code ?? null })
  );
  assert.deepEqual(active, { settled: 'rejected', code: 'RAILGUN_ACCOUNT_PUBLIC_REFUSED' });
  return Object.freeze({ ...previous, policyProbe: { activeOpening: active } });
}
async function policyRecover(options) {
  const { facade, signal, previous, milestone } = options;
  assertPrepared(previous);
  assert.deepEqual(previous.policyProbe?.activeOpening, { settled: 'rejected', code: 'RAILGUN_ACCOUNT_PUBLIC_REFUSED' });
  let session, lane;
  try {
    session = await facade.openAccount({ accountIndex: 0, signal, publicCache: 'new' });
    for (const range of ranges()) await session.advancePublic(range);
    milestone('rescan-complete');
    lane = await session.openRead({ wallet: 'new', signal });
    const notes = await lane.notes(undefined, true);
    lane.close();
    await lane.closed;
    lane = null;
    const input = notes.find((note) => note.id === '0:1');
    assert.ok(input && input.amount === 2000n && input.spentTxid === false);
    const result = await submitStored(options, false, session);
    await closeOriginal(null, session);
    session = null;
    return Object.freeze({
      ...result,
      rebuild: { origin: 'earlier-package-build', policyProbe: previous.policyProbe, walletNotes: notes.length },
    });
  } finally {
    await closeOriginal(lane, session);
  }
}
// publicCache "pending" resumes only an existing current-policy candidate.
async function pendingNegative({ facade, signal, previous }) {
  const pending = await facade.openAccount({ accountIndex: 0, signal, publicCache: 'pending' }).then(
    async (session) => {
      session.close();
      await session.closed;
      return { settled: 'fulfilled' };
    },
    (error) => ({ settled: 'rejected', code: error?.code ?? null })
  );
  assert.equal(pending.settled, 'rejected');
  assert.ok(['RAILGUN_PUBLIC_CATALOG_REFUSED', 'RAILGUN_ACCOUNT_PUBLIC_REFUSED'].includes(pending.code));
  return Object.freeze({ ...previous, pendingWithoutCandidate: pending });
}
async function run(mode, options) {
  if (mode === 'pending-negative') return pendingNegative(options);
  if (mode === 'policy-probe') return policyProbe(options);
  if (mode === 'legacy-recover') return rebuildRecover(options, true);
  if (mode === 'policy-recover') return policyRecover(options);
  if (mode === 'transact-unshield') return transactUnshield(options);
  if (mode === 'cold-output') return coldOutput(options);
  if (mode === 'prepare') return prepare(options);
  if (mode === 'submit-stored') return submitStored(options, false);
  if (mode === 'submit-stored-unknown') return submitStored(options, true);
  throw Error('Unknown journey mode');
}
module.exports = Object.freeze({ run, ENDPOINT, POI_URL });
