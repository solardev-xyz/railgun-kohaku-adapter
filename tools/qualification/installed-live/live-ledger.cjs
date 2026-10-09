/** One explicit installed-journey continuation, append-only and fail-closed.
 * - Sends: at most the held transfer, then one distinct unshield. Each is
 *   reserved durably before any signing and finished exactly once. A known
 *   pre-send refusal of the transfer stops the campaign: no unshield follows.
 * - Budgets: every bounded read/disclosure unit (observations, POI status,
 *   scan openings, TXID pages) is reserved durably before its invocation,
 *   across restarts, with maximum, spacing and window rules. Exhaustion stops.
 * - POI: at most one submission handoff, reserved before it can leave.
 * The campaign directory is a NEW profile sibling; earlier consumed campaign
 * ledgers are never read, written or moved. Any torn, foreign or extra record
 * refuses. It is no anti-tampering control.
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  { randomBytes, createHash } = require('crypto');
const NAME = 'installed-journey-1.jsonl';
// The one reviewed continuation: the stopped first ledger's endpoint could not
// serve the scan windows. It binds that ledger's exact bytes and header, carries
// its consumed budgets forward and never allows a further continuation.
const FIRST = 'installed-journey-1';
const CONTINUATION = 'installed-journey-sentio-1';
// The one reviewed resume of the Sentio continuation, after its scan stopped
// part-way: same endpoint, exact predecessor chain, carried budgets.
const RESUME = 'installed-journey-sentio-resume-1';
// The one reviewed second link: the first resume's runner targeted a whole
// earlier 100000-block window, which can exceed the scan source's per-window
// bounds; its successor changes only the target rule.
const RESUME2 = 'installed-journey-sentio-resume-2';
// The one reviewed third link: transient failures ended sessions that were
// progressing. Its openers are admitted by progress, not by a flat count.
const RESUME3 = 'installed-journey-sentio-resume-3';
// The one reviewed post-send link: a runner fix after the transfer. It carries
// its predecessor's complete state (the send, reports, budgets, progress, POI)
// and changes only the runner identity; it grants no new allowance.
const JOURNEY2 = 'installed-journey-sentio-journey-2';
// The one reviewed upgrade link: a new package (one explicit POI retry) and
// host after the transfer and its first POI handoff. It carries the complete
// state and adds only these bounded phase allowances to the boundary counts.
const JOURNEY3 = 'installed-journey-sentio-journey-3';
// The one reviewed circuit link: Railgun rotated its POI circuits, so every
// proof from the retired POI_3x3 key is refused. A new package and host prove
// one replacement for the same output. It carries the complete state (the
// consumed first handoff and retry included) and adds the same bounded phase
// allowances to its own boundary counts, plus one replacement handoff.
const JOURNEY4 = 'installed-journey-sentio-journey-4';
const CHAIN = Object.freeze([FIRST, CONTINUATION, RESUME, RESUME2, RESUME3, JOURNEY2, JOURNEY3, JOURNEY4]);
// The links that start a new generation under a phase of their own.
const UPGRADES = Object.freeze([JOURNEY3, JOURNEY4]);
const UPGRADE_ADDITIONS = Object.freeze({
  scanRanges: 400,
  txidPages: 60,
  scanOpenNew: 1,
  scanOpenPending: 11,
  poiStatus: 4,
});
const UPGRADE_STATUS = Object.freeze({ minSpacingMs: 10 * 60 * 1000, windowMs: 24 * 3600 * 1000 });
// The upgrade phase admits openers within one fixed window from its first.
const UPGRADE_WINDOW_MS = 8 * 3600 * 1000;
// The circuit link's additions: the upgrade phase's, exactly.
const REPROOF_ADDITIONS = UPGRADE_ADDITIONS;
// The POI_3x3 artifact identities the circuit link moves between: the retired
// wallet 5c9d04c bundle and the bundle wallet 11.2.0 selects (QmZ2MyM6...).
const pin = (bytes, sha256) => Object.freeze({ bytes, sha256 });
const RETIRED_POI_3X3 = Object.freeze({
  wasm: pin(4520908, '831aad53c05d19f9854ed27429610da724fbdf9e1e7023aa7a90666f50b0da78'),
  zkey: pin(13605800, '667984c51df2122956107c11c3c606e4e4688f70fb25515b9388cbd5140e48b3'),
  vkey: pin(4207, '2f4dcbf58d383204e09240863a6f6eff249071849e5161801ebfe83691037b23'),
});
const CURRENT_POI_3X3 = Object.freeze({
  wasm: pin(4588991, 'b82a6d545d94cb774592b652b3d6b3d73f032eac946119b5de631d0609da7cbe'),
  zkey: pin(14192542, 'a128e273f8a7b9fa9e04e17da079b89a57e416db845864d0d5c88570564a2066'),
  vkey: pin(4206, 'b7ca7ba048666fb0e17efd0af1e407a8dcb0906bfaf2f20e362ed40cbec6f4d8'),
});
const NO_PROGRESS_SESSIONS = 2;
// The third link admits openers within one fixed window from its first opener.
const RESUME3_WINDOW_MS = 4 * 3600 * 1000;
// Resume sessions of one ledger with no returned checkpoint at its end: the
// trailing openers not followed by any scan-progress record.
function trailingNoProgress(records) {
  let count = 0;
  for (const record of records) {
    if (record?.type === 'budget' && record.kind === 'scan-open:pending') count++;
    else if (record?.type === 'scan-progress') count = 0;
  }
  return count;
}
const SENTIO = 'https://sepolia.rpc.sentio.xyz';
const PREDECESSOR_KINDS = Object.freeze(['scan-open:new', 'scan-open:pending', 'scan-range']);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const DIRECTORY_SUFFIX = '.installed-journey-ledger';
const MAX_BYTES = 1024 * 1024;
const SENDS = Object.freeze(['transfer', 'unshield']);
const CONTINUING = Object.freeze(['acknowledged', 'unknown']);
const fail = (reason) =>
  Object.assign(new Error('Installed journey ledger refused: ' + reason), {
    code: 'INSTALLED_JOURNEY_LEDGER_REFUSED',
    reason,
  });
const check = (value, reason) => {
  if (!value) throw fail(reason);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Key order is not identity: a spec may list an object's fields in any order.
const canonical = (value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const id = (value) => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
// The one mapping from a budget kind to its campaign cap.
function policyFor(caps, kind) {
  const policy =
    kind.startsWith('observe:') ? caps.observePerSend
    : kind === 'poi-status' ? caps.poiStatus
    : kind.startsWith('readback:') ? caps.readbackPerSend
    : kind === 'scan-open:new' ? { max: caps.rebuildNew }
    : kind === 'scan-open:pending' ? { max: caps.scanResumes }
    : kind === 'scan-range' ? { max: caps.scanRanges }
    : kind === 'txid-page' ? { max: caps.txidPages }
    : null;
  check(policy && Number.isSafeInteger(policy.max) && policy.max > 0, 'budget-kind:' + kind);
  return policy;
}
function ledgerFile(profile, name = FIRST) {
  check(path.isAbsolute(profile) && fs.realpathSync(profile) === profile, 'profile');
  check(CHAIN.includes(name), 'name');
  return path.join(profile + DIRECTORY_SUFFIX, name + '.jsonl');
}
// Read-only: a later ledger's predecessor must be exactly the bound, stopped
// ledger before it in the fixed chain, of the same scope, holding scan budgets
// only, itself admitted the same way. Returns the chain's aggregate budgets.
function predecessor(directory, header) {
  const index = CHAIN.indexOf(header.name);
  check(index > 0, 'predecessor-name');
  const bound = header.binding?.predecessor;
  check(
    bound &&
      bound.name === CHAIN[index - 1] &&
      /^[0-9a-f]{64}$/.test(bound.ledgerSha256) &&
      /^[0-9a-f]{64}$/.test(bound.headerSha256) &&
      typeof bound.reason === 'string' &&
      bound.reason.length > 0,
    'predecessor-binding'
  );
  let bytes;
  try {
    const file = path.join(directory, bound.name + '.jsonl');
    const stat = fs.lstatSync(file);
    check(stat.isFile() && stat.size <= MAX_BYTES, 'predecessor');
    bytes = fs.readFileSync(file);
  } catch (error) {
    if (error?.code === 'INSTALLED_JOURNEY_LEDGER_REFUSED') throw error;
    throw fail('predecessor');
  }
  check(sha256(bytes) === bound.ledgerSha256, 'predecessor-sha256');
  let records;
  try {
    const lines = bytes.toString('utf8').split('\n');
    check(lines.pop() === '', 'predecessor-torn');
    records = lines.map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'INSTALLED_JOURNEY_LEDGER_REFUSED') throw error;
    throw fail('predecessor');
  }
  const previous = records[0];
  check(sha256(JSON.stringify(previous)) === bound.headerSha256 && previous.name === bound.name, 'predecessor-header');
  // Same profile, artifact, host, transport and held operation. Only the
  // first continuation changes the endpoint; the resume keeps it.
  // Only the upgrade links change the host and artifact, under their binding.
  for (const key of ['type', 'version', 'transport', 'profile', 'freedomCommit', 'packageTarSha256'])
    if (!UPGRADES.includes(header.name) || !['freedomCommit', 'packageTarSha256'].includes(key))
      check(same(previous[key], header[key]), 'predecessor-scope:' + key);
  check(previous.binding?.heldTransferReportSha256 === header.binding.heldTransferReportSha256, 'predecessor-held');
  if ([RESUME, RESUME2, RESUME3, JOURNEY2, JOURNEY3, JOURNEY4].includes(header.name))
    check(same(previous.binding?.rpc?.url, header.binding?.rpc?.url), 'predecessor-endpoint');
  const carried = index - 1 > 0 ? predecessor(directory, previous) : {};
  const state = replay(records, previous, carried);
  if (header.name === JOURNEY4) {
    check(previous.name === JOURNEY3, 'predecessor-circuit');
    const identity = (value) => ({
      freedomCommit: value.freedomCommit,
      packageCommit: value.packageCommit,
      packageTarSha256: value.packageTarSha256,
      runnerSha256: value.runnerSha256,
    });
    const upgrade = header.binding?.upgrade;
    // Old and new host, package and runner identities, and the POI artifact
    // move from the retired circuit to the current one, exactly.
    check(
      upgrade &&
        same(Object.keys(upgrade).sort(), ['artifacts', 'from', 'reason', 'to']) &&
        same(upgrade.from, identity(previous)) &&
        same(upgrade.to, identity(header)) &&
        same(canonical(upgrade.artifacts), canonical({ from: { POI_3x3: RETIRED_POI_3X3 }, to: { POI_3x3: CURRENT_POI_3X3 } })) &&
        typeof upgrade.reason === 'string' &&
        upgrade.reason.length > 0,
      'predecessor-circuit'
    );
    // Exactly the resolved transfer, the consumed first handoff and the
    // consumed, finished retry; nothing after them.
    check(
      state.sends.length === 1 &&
        state.sends[0].pending.send === 'transfer' &&
        CONTINUING.includes(state.sends[0].finished?.outcome?.classification),
      'predecessor-circuit-send'
    );
    check(state.poi.pending && state.poi.finished, 'predecessor-circuit-poi');
    check(state.retry.pending && state.retry.finished, 'predecessor-circuit-retry');
    check(state.reproof.pending === null, 'predecessor-circuit-reproof');
    const count = (kind) => (state.budgets[kind] ?? []).length;
    const boundary = {
      scanRanges: count('scan-range'),
      txidPages: count('txid-page'),
      scanOpenNew: count('scan-open:new'),
      scanOpenPending: count('scan-open:pending'),
      poiStatus: count('poi-status'),
    };
    const phase = header.binding?.phase;
    check(
      phase && same(phase.boundary, boundary) && same(phase.additions, REPROOF_ADDITIONS),
      'predecessor-boundary'
    );
    const caps = header.caps;
    check(
      caps.scanRanges === boundary.scanRanges + REPROOF_ADDITIONS.scanRanges &&
        caps.txidPages === boundary.txidPages + REPROOF_ADDITIONS.txidPages &&
        caps.rebuildNew === boundary.scanOpenNew + REPROOF_ADDITIONS.scanOpenNew &&
        caps.scanResumes === boundary.scanOpenPending + REPROOF_ADDITIONS.scanOpenPending &&
        caps.poiReproofs === 1 &&
        same(caps.poiStatus, {
          max: boundary.poiStatus + REPROOF_ADDITIONS.poiStatus,
          ...UPGRADE_STATUS,
          phaseFrom: boundary.poiStatus,
        }),
      'predecessor-circuit-caps'
    );
    // Every other cap is the predecessor's, exactly: the consumed retry
    // allowance stays one, never replenished or repurposed.
    const rest = (value) =>
      Object.fromEntries(
        Object.entries(value).filter(
          ([key]) => !['scanRanges', 'txidPages', 'rebuildNew', 'scanResumes', 'poiStatus', 'poiReproofs'].includes(key)
        )
      );
    check(same(rest(caps), rest(previous.caps)) && caps.poiRetries === 1, 'predecessor-circuit-caps');
    return state;
  }
  if (header.name === JOURNEY3) {
    check(previous.name === JOURNEY2, 'predecessor-upgrade');
    const identity = (value) => ({
      freedomCommit: value.freedomCommit,
      packageCommit: value.packageCommit,
      packageTarSha256: value.packageTarSha256,
      runnerSha256: value.runnerSha256,
    });
    const upgrade = header.binding?.upgrade;
    check(
      upgrade &&
        same(Object.keys(upgrade).sort(), ['from', 'reason', 'to']) &&
        same(upgrade.from, identity(previous)) &&
        same(upgrade.to, identity(header)) &&
        typeof upgrade.reason === 'string' &&
        upgrade.reason.length > 0,
      'predecessor-upgrade'
    );
    // Exactly the resolved transfer and the consumed first POI handoff.
    check(
      state.sends.length === 1 &&
        state.sends[0].pending.send === 'transfer' &&
        CONTINUING.includes(state.sends[0].finished?.outcome?.classification),
      'predecessor-upgrade-send'
    );
    check(state.poi.pending && state.poi.finished, 'predecessor-upgrade-poi');
    const count = (kind) => (state.budgets[kind] ?? []).length;
    const boundary = {
      scanRanges: count('scan-range'),
      txidPages: count('txid-page'),
      scanOpenNew: count('scan-open:new'),
      scanOpenPending: count('scan-open:pending'),
      poiStatus: count('poi-status'),
    };
    const phase = header.binding?.phase;
    check(
      phase && same(phase.boundary, boundary) && same(phase.additions, UPGRADE_ADDITIONS),
      'predecessor-boundary'
    );
    const caps = header.caps;
    check(
      caps.scanRanges === boundary.scanRanges + UPGRADE_ADDITIONS.scanRanges &&
        caps.txidPages === boundary.txidPages + UPGRADE_ADDITIONS.txidPages &&
        caps.rebuildNew === boundary.scanOpenNew + UPGRADE_ADDITIONS.scanOpenNew &&
        caps.scanResumes === boundary.scanOpenPending + UPGRADE_ADDITIONS.scanOpenPending &&
        caps.poiRetries === 1 &&
        same(caps.poiStatus, {
          max: boundary.poiStatus + UPGRADE_ADDITIONS.poiStatus,
          ...UPGRADE_STATUS,
          phaseFrom: boundary.poiStatus,
        }),
      'predecessor-upgrade-caps'
    );
    // Every other cap is the predecessor's, exactly.
    const rest = (value) =>
      Object.fromEntries(
        Object.entries(value).filter(
          ([key]) => !['scanRanges', 'txidPages', 'rebuildNew', 'scanResumes', 'poiStatus', 'poiRetries'].includes(key)
        )
      );
    check(same(rest(caps), rest(previous.caps)), 'predecessor-upgrade-caps');
    return state;
  }
  if (header.name === JOURNEY2) {
    // Exactly the resolved transfer and nothing after it: one finished
    // continuing transfer, no unshield, no POI record; the same caps.
    check(previous.name === RESUME3 && same(previous.caps, header.caps), 'predecessor-journey');
    check(
      state.sends.length === 1 &&
        state.sends[0].pending.send === 'transfer' &&
        CONTINUING.includes(state.sends[0].finished?.outcome?.classification),
      'predecessor-journey-send'
    );
    check(state.poi.pending === null && state.poi.finished === null, 'predecessor-journey-poi');
    check(!records.slice(1).some((record) => record?.type?.startsWith('poi')), 'predecessor-journey-poi');
    return state;
  }
  // Scan budgets, and a resume's attempt records; never a checkpoint, send,
  // POI handoff or report.
  check(
    records
      .slice(1)
      .every(
        (record) =>
          (record?.type === 'budget' && PREDECESSOR_KINDS.includes(record.kind)) ||
          (record?.type === 'resume-attempt' && [RESUME, RESUME2].includes(previous.name)) ||
          (record?.type === 'scan-progress' && previous.name === RESUME2)
      ),
    'predecessor-events'
  );
  check(state.sends.length === 0 && state.poi.pending === null && state.reports.length === 0, 'predecessor-not-empty');
  // The second link binds the first resume exactly: one opener, one attempt
  // (first, at the claimed pair and the claimed failed target, the earlier
  // rule) and its windows, all at that target; no checkpoint.
  // The third link's claim is read from the second's own records: its last
  // returned checkpoint and the window it attempted beyond it.
  if (header.name === RESUME3) {
    const claim = header.binding.resumeFrom;
    const own = records.slice(1);
    const progress = own.filter((record) => record.type === 'scan-progress');
    const windows = own.filter((record) => record.kind === 'scan-range' && Number.isSafeInteger(record.target));
    check(progress.length > 0 && windows.length > 0, 'predecessor-progress');
    check(claim.checkpoint === progress.at(-1).to && claim.checkpointHash === progress.at(-1).hash, 'predecessor-claim');
    check(windows.at(-1).target > claim.checkpoint && claim.failedTarget === windows.at(-1).target, 'predecessor-claim');
  }
  if (header.name === RESUME2) {
    const claim = header.binding.resumeFrom;
    check(same(previous.binding?.resumeFrom, claim), 'predecessor-claim');
    const own = records.slice(1);
    const attempts = own.filter((record) => record.type === 'resume-attempt');
    check(
      attempts.length === 1 &&
        attempts[0].mode === 'first' &&
        attempts[0].lower === claim.checkpoint &&
        attempts[0].upper === claim.failedTarget &&
        attempts[0].target === claim.failedTarget,
      'predecessor-attempt'
    );
    check(own.filter((record) => record.kind === 'scan-open:pending').length === 1, 'predecessor-openers');
    const windows = own.filter((record) => record.kind === 'scan-range');
    check(windows.length >= 1 && windows.every((record) => record.target === claim.failedTarget), 'predecessor-windows');
  }
  // Scan-only links carry budgets alone.
  return { budgets: state.budgets };
}
// The report rows recorded by the post-send link's bound predecessor.
// Each row carries its producing ledger's exact header digest. The post-send
// link admits its bound predecessor's rows; the upgrade link admits the rows of
// every verified ancestor, each only with its own producer header.
function predecessorReports(profile, header) {
  if (![JOURNEY2, ...UPGRADES].includes(header.name)) return [];
  const directory = path.dirname(ledgerFile(profile, header.name));
  const rows = [];
  let current = header;
  while (CHAIN.indexOf(current.name) > 0) {
    predecessor(directory, current);
    const bytes = fs.readFileSync(path.join(directory, current.binding.predecessor.name + '.jsonl'), 'utf8');
    const records = bytes.trim().split('\n').map((line) => JSON.parse(line));
    const headerSha256 = sha256(JSON.stringify(records[0]));
    for (const record of records.slice(1))
      if (record.type === 'report') rows.push({ headerSha256, sha256: record.sha256, mode: record.mode });
    if (header.name === JOURNEY2) break;
    current = records[0];
  }
  return rows;
}
// The fixed chain's predecessor records, per ledger name, read-only.
function chainRecords(profile, header) {
  const directory = path.dirname(ledgerFile(profile, header.name));
  const result = {};
  let current = header;
  while (CHAIN.indexOf(current.name) > 0) {
    predecessor(directory, current);
    const bytes = fs.readFileSync(path.join(directory, current.binding.predecessor.name + '.jsonl'), 'utf8');
    const records = bytes.trim().split('\n').map((line) => JSON.parse(line));
    result[records[0].name] = records.slice(1);
    current = records[0];
  }
  return result;
}
// The fixed chain's per-ledger record counts of one kind, read-only.
function chainCounts(profile, header, kind) {
  const directory = path.dirname(ledgerFile(profile, header.name));
  const counts = {};
  let current = header;
  while (CHAIN.indexOf(current.name) > 0) {
    predecessor(directory, current);
    const bytes = fs.readFileSync(path.join(directory, current.binding.predecessor.name + '.jsonl'), 'utf8');
    const records = bytes.trim().split('\n').map((line) => JSON.parse(line));
    counts[records[0].name] = records.filter((record) => record.type === 'budget' && record.kind === kind).length;
    current = records[0];
  }
  return counts;
}
function syncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
// Replays and validates the whole ledger, from carried-forward budgets.
function replay(records, header, carried = {}) {
  const copy = (value) => JSON.parse(JSON.stringify(value));
  check(same(records[0], header), 'header');
  const sends = copy(carried.sends ?? []),
    budgets = Object.fromEntries(Object.entries(carried.budgets ?? {}).map(([kind, rows]) => [kind, [...rows]])),
    reports = copy(carried.reports ?? []),
    progress = copy(carried.progress ?? []),
    attempts = [],
    poi = copy(carried.poi ?? { pending: null, finished: null }),
    // Carried consumed handoffs stay consumed on every later link.
    retry = copy(carried.retry ?? { pending: null, finished: null }),
    reproof = copy(carried.reproof ?? { pending: null, finished: null });
  // The upgrade generation's scope: progress and openers after its one start.
  let phase = null;
  const ownSoFar = [];
  for (const record of records.slice(1)) {
    if (record?.type === 'send-pending') {
      check(sends.every((send) => send.finished), 'pending-attempt');
      const kind = SENDS[sends.length];
      check(kind && record.send === kind && id(record.attemptId), 'send-order');
      if (kind === 'unshield')
        check(CONTINUING.includes(sends[0].finished.outcome?.classification), 'transfer-not-continuable');
      sends.push({ pending: record, finished: null });
    } else if (record?.type === 'send-finished') {
      const last = sends.at(-1);
      check(last && !last.finished && last.pending.attemptId === record.attemptId, 'send-finished');
      last.finished = record;
    } else if (record?.type === 'budget') {
      check(typeof record.kind === 'string' && Number.isSafeInteger(record.at), 'budget');
      // A third-link opener needs progress since the previous one, allowing
      // at most two consecutive sessions without a returned checkpoint.
      if (header.name === RESUME3 && record.kind === 'scan-open:pending') {
        check(trailingNoProgress(ownSoFar) < NO_PROGRESS_SESSIONS, 'resume-no-progress');
        const first = ownSoFar.find((row) => row.type === 'budget' && row.kind === 'scan-open:pending');
        if (first) check(record.at - first.at <= RESUME3_WINDOW_MS, 'resume-window');
      }
      // An upgrade link scans and syncs only within its started generation.
      if (UPGRADES.includes(header.name) && ['scan-range', 'txid-page'].includes(record.kind)) check(phase, 'upgrade-phase');
      // Upgrade openers: only inside the started phase, admitted by progress
      // within one fixed window from the phase's first opener.
      if (UPGRADES.includes(header.name) && record.kind.startsWith('scan-open:')) {
        check(phase, 'upgrade-phase');
        const openers = ownSoFar.filter((row) => row.type === 'budget' && row.kind.startsWith('scan-open:'));
        let since = 0;
        for (const row of ownSoFar) {
          if (row.type === 'budget' && row.kind.startsWith('scan-open:')) since++;
          else if (row.type === 'scan-progress') since = 0;
        }
        check(since < NO_PROGRESS_SESSIONS, 'upgrade-no-progress');
        if (openers.length) check(record.at - openers[0].at <= UPGRADE_WINDOW_MS, 'upgrade-window');
      }
      // A scan window may name its planned target; nothing else carries extras.
      if (Object.hasOwn(record, 'target'))
        check(record.kind === 'scan-range' && Number.isSafeInteger(record.target) && record.target >= 0, 'budget-target');
      const used = (budgets[record.kind] ||= []);
      // Replay re-enforces the header's caps, not only the writer's checks.
      if (header.caps?.observePerSend) {
        const policy = policyFor(header.caps, record.kind);
        check(used.length < policy.max && record.n === used.length + 1, 'budget-replay:' + record.kind);
        if (used.length) {
          check(record.at - used.at(-1).at >= (policy.minSpacingMs ?? 0), 'budget-replay:' + record.kind);
          // A phased window starts at the phase's first unit, never earlier.
          const origin = used[policy.phaseFrom ?? 0];
          if (policy.windowMs != null && origin) check(record.at - origin.at <= policy.windowMs, 'budget-replay:' + record.kind);
        }
      }
      used.push(record);
    } else if (record?.type === 'phase-start') {
      // Once, on an upgrade link, before any of its own openers or progress.
      check(UPGRADES.includes(header.name) && !phase && record.phase === 'upgrade' && Number.isSafeInteger(record.at), 'phase-start');
      check(!ownSoFar.some((row) => row.type === 'scan-progress' || (row.type === 'budget' && row.kind.startsWith('scan-open:'))), 'phase-start');
      phase = { progressFrom: progress.length, rangesFrom: (budgets['scan-range'] ?? []).length, at: record.at };
    } else if (record?.type === 'poi-retry-pending') {
      // The one explicit second handoff, reserved before its lane opens, after
      // the consumed first one; never a second reservation.
      check(header.name === JOURNEY3 && header.caps?.poiRetries === 1, 'poi-retry');
      check(poi.finished && !retry.pending && id(record.retryId), 'poi-retry-pending');
      retry.pending = record;
    } else if (record?.type === 'poi-retry-finished') {
      check(retry.pending && !retry.finished && retry.pending.retryId === record.retryId, 'poi-retry-finished');
      retry.finished = record;
    } else if (record?.type === 'poi-reproof-pending') {
      // The one replacement-proof handoff, on the circuit link only, after the
      // consumed first handoff and the consumed retry; never a second.
      check(header.name === JOURNEY4 && header.caps?.poiReproofs === 1, 'poi-reproof');
      check(poi.finished && retry.pending && !reproof.pending && id(record.reproofId), 'poi-reproof-pending');
      reproof.pending = record;
    } else if (record?.type === 'poi-reproof-finished') {
      check(reproof.pending && !reproof.finished && reproof.pending.reproofId === record.reproofId, 'poi-reproof-finished');
      reproof.finished = record;
    } else if (record?.type === 'poi-pending') {
      check(!poi.pending && id(record.handoffId), 'poi-pending');
      check(sends[0]?.finished && CONTINUING.includes(sends[0].finished.outcome?.classification), 'poi-order');
      poi.pending = record;
    } else if (record?.type === 'poi-finished') {
      check(poi.pending && !poi.finished && poi.pending.handoffId === record.handoffId, 'poi-finished');
      poi.finished = record;
    } else if (record?.type === 'resume-attempt') {
      // At most a first then a second attempt per candidate pair, with no
      // checkpoint recorded between them. A failed attempt proves nothing
      // about the checkpoint; the coordinator alone decides.
      check(['first', 'second'].includes(record.mode) && Number.isSafeInteger(record.lower) && Number.isSafeInteger(record.upper), 'resume-attempt');
      check(record.lower < record.upper && Number.isSafeInteger(record.target) && record.target > record.lower, 'resume-attempt');
      const same = attempts.filter((row) => row.lower === record.lower && row.upper === record.upper);
      check(same.length === (record.mode === 'first' ? 0 : 1), 'resume-attempt-order');
      if (record.mode === 'second') check(same[0].progressAt === progress.length, 'resume-attempt-order');
      attempts.push({ ...record, progressAt: progress.length });
    } else if (record?.type === 'scan-progress') {
      // A durable public checkpoint the coordinator returned, strictly increasing.
      check(Number.isSafeInteger(record.to) && record.to >= 0 && /^0x[0-9a-f]{64}$/.test(record.hash), 'scan-progress');
      // Within the upgrade phase, order restarts with the new generation.
      const from = phase ? phase.progressFrom : 0;
      check(progress.length === from || record.to > progress.at(-1).to, 'scan-progress-order');
      if (UPGRADES.includes(header.name)) check(phase, 'upgrade-phase');
      // Bound to the window reservation it answers: the latest, with this target.
      const window = (budgets['scan-range'] ?? []).at(-1);
      check(window && window.n === record.reservation && window.target === record.to, 'scan-progress-reservation');
      progress.push(record);
    } else if (record?.type === 'report') {
      check(typeof record.mode === 'string' && /^[0-9a-f]{64}$/.test(record.sha256), 'report');
      check(!reports.some((row) => row.sha256 === record.sha256), 'report-duplicate');
      reports.push(record);
    } else throw fail('record');
    ownSoFar.push(record);
  }
  return { sends, budgets, poi, reports, progress, attempts, phase, retry, reproof };
}
function read(file, header, carried) {
  let records;
  try {
    const stat = fs.lstatSync(file);
    check(stat.isFile() && stat.size <= MAX_BYTES, 'ledger');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    check(lines.pop() === '', 'torn');
    records = lines.map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'INSTALLED_JOURNEY_LEDGER_REFUSED') throw error;
    throw fail('ledger');
  }
  return replay(records, header, carried);
}
// Read-only admission: the campaign is absent, or exactly this ledger.
function inspect(profile, header) {
  const index = CHAIN.indexOf(header.name);
  check(index >= 0, 'name');
  check(index > 0 || !Object.hasOwn(header.binding ?? {}, 'predecessor'), 'name');
  if (index > 0) check(header.transport === 'synthetic' || header.binding?.rpc?.url === SENTIO, 'continuation-endpoint');
  const file = ledgerFile(profile, header.name),
    directory = path.dirname(file);
  const empty = (carried) => ({
    file,
    sends: carried.sends ?? [],
    budgets: carried.budgets ?? {},
    reports: carried.reports ?? [],
    progress: carried.progress ?? [],
    attempts: [],
    poi: carried.poi ?? { pending: null, finished: null },
    phase: null,
    retry: carried.retry ?? { pending: null, finished: null },
    reproof: carried.reproof ?? { pending: null, finished: null },
  });
  let names;
  try {
    const stat = fs.lstatSync(directory);
    check(stat.isDirectory(), 'directory');
    names = fs.readdirSync(directory).sort();
  } catch (error) {
    if (error?.code === 'ENOENT' && index === 0) return empty({});
    if (error?.code === 'INSTALLED_JOURNEY_LEDGER_REFUSED') throw error;
    throw fail('directory');
  }
  // Exactly the predecessors, plus this ledger once it exists. A later ledger
  // closes every earlier one.
  const prefix = CHAIN.slice(0, index).map((name) => name + '.jsonl');
  const own = header.name + '.jsonl';
  check(prefix.every((name) => names.includes(name)), 'directory');
  check(names.every((name) => prefix.includes(name) || name === own), 'directory');
  const carried = index > 0 ? predecessor(directory, header) : {};
  if (!names.includes(own)) return empty(carried);
  return { file, ...read(file, header, carried) };
}
// Appends one record durably, then re-validates the whole ledger.
function append(profile, header, record) {
  const state = inspect(profile, header);
  const directory = path.dirname(state.file);
  const fresh = !fs.existsSync(state.file);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { mode: 0o700 });
    syncDirectory(path.dirname(directory));
  }
  check(fs.lstatSync(directory).isDirectory(), 'directory');
  // Validate the would-be ledger before writing anything.
  const existing = fresh ? [header] : fs.readFileSync(state.file, 'utf8').split('\n').slice(0, -1).map((line) => JSON.parse(line));
  replay([...existing, record], header, predecessorBudgets(profile, header));
  const lines = (fresh ? [JSON.stringify(header)] : []).concat(JSON.stringify(record));
  const fd = fs.openSync(state.file, fresh ? 'wx' : 'a', 0o600);
  try {
    const bytes = Buffer.from(lines.join('\n') + '\n');
    check(fs.writeSync(fd, bytes) === bytes.length, 'write');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  syncDirectory(directory);
  return inspect(profile, header);
}
function predecessorBudgets(profile, header) {
  return CHAIN.indexOf(header.name) > 0 ? predecessor(path.dirname(ledgerFile(profile, header.name)), header) : {};
}
function resumeAttempt(profile, header, mode, lower, upper, target) {
  return append(profile, header, { type: 'resume-attempt', mode, lower, upper, target, at: Date.now() }).attempts;
}
// A durable public checkpoint after a successful advance.
function progress(profile, header, to, hash, reservation) {
  return append(profile, header, { type: 'scan-progress', to, hash, reservation, at: Date.now() }).progress;
}
function reserve(profile, header, kind, binding) {
  const attemptId = randomBytes(16).toString('hex');
  const state = append(profile, header, {
    type: 'send-pending',
    send: kind,
    attemptId,
    reservedAt: new Date().toISOString(),
    pid: process.pid,
    binding,
  });
  check(state.sends.at(-1).pending.attemptId === attemptId, 'readback');
  return attemptId;
}
function finish(profile, header, attemptId, outcome) {
  return append(profile, header, { type: 'send-finished', attemptId, finishedAt: new Date().toISOString(), outcome })
    .sends;
}
// One bounded unit, reserved before its invocation: max total, minimum spacing
// from the previous unit of this kind and, optionally, a window from the first.
function consume(profile, header, kind, { max, minSpacingMs = 0, windowMs = null, phaseFrom = 0 }, now = Date.now(), extra = {}) {
  check(Number.isSafeInteger(max) && max > 0, 'budget-policy');
  const used = inspect(profile, header).budgets[kind] ?? [];
  check(used.length < max, 'budget-exhausted:' + kind);
  if (used.length) {
    check(now - used.at(-1).at >= minSpacingMs, 'budget-spacing:' + kind);
    const origin = used[phaseFrom];
    if (windowMs !== null && origin) check(now - origin.at <= windowMs, 'budget-window:' + kind);
  }
  append(profile, header, { type: 'budget', kind, n: used.length + 1, at: now, ...extra });
  return used.length + 1;
}
// The upgrade generation's single durable start, before its first opener.
function startPhase(profile, header) {
  return append(profile, header, { type: 'phase-start', phase: 'upgrade', at: Date.now() }).phase;
}
function poiRetryReserve(profile, header, binding) {
  const retryId = randomBytes(16).toString('hex');
  append(profile, header, { type: 'poi-retry-pending', retryId, reservedAt: new Date().toISOString(), binding });
  return retryId;
}
function poiRetryFinish(profile, header, retryId, outcome) {
  return append(profile, header, { type: 'poi-retry-finished', retryId, finishedAt: new Date().toISOString(), outcome })
    .retry;
}
// The circuit link's one replacement handoff: consumed once written, whether
// or not anything leaves afterwards.
function poiReproofReserve(profile, header, binding) {
  const reproofId = randomBytes(16).toString('hex');
  append(profile, header, { type: 'poi-reproof-pending', reproofId, reservedAt: new Date().toISOString(), binding });
  return reproofId;
}
function poiReproofFinish(profile, header, reproofId, outcome) {
  return append(profile, header, {
    type: 'poi-reproof-finished',
    reproofId,
    finishedAt: new Date().toISOString(),
    outcome,
  }).reproof;
}
// The upgrade phase's fixed admission deadline from its first opener; null
// before one is reserved.
function upgradeDeadline(profile, header) {
  if (!UPGRADES.includes(header.name)) return null;
  const file = ledgerFile(profile, header.name);
  if (!fs.existsSync(file)) return null;
  const first = fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => JSON.parse(line))
    .find((row) => row.type === 'budget' && row.kind.startsWith('scan-open:'));
  return first ? first.at + UPGRADE_WINDOW_MS : null;
}
function poiReserve(profile, header, binding) {
  const handoffId = randomBytes(16).toString('hex');
  append(profile, header, { type: 'poi-pending', handoffId, reservedAt: new Date().toISOString(), binding });
  return handoffId;
}
function poiFinish(profile, header, handoffId, outcome) {
  return append(profile, header, { type: 'poi-finished', handoffId, finishedAt: new Date().toISOString(), outcome }).poi;
}
// The report chain is bound into the campaign: each mode's report digest.
function recordReport(profile, header, mode, sha256) {
  return append(profile, header, { type: 'report', mode, sha256, at: Date.now() }).reports;
}
// The third link's fixed admission deadline, from its first opener; null
// before one is reserved.
function resumeDeadline(profile, header) {
  if (header.name !== RESUME3) return null;
  const file = ledgerFile(profile, header.name);
  if (!fs.existsSync(file)) return null;
  const first = fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => JSON.parse(line))
    .find((row) => row.type === 'budget' && row.kind === 'scan-open:pending');
  return first ? first.at + RESUME3_WINDOW_MS : null;
}
module.exports = {
  JOURNEY4,
  UPGRADES,
  REPROOF_ADDITIONS,
  RETIRED_POI_3X3,
  CURRENT_POI_3X3,
  poiReproofReserve,
  poiReproofFinish,
  JOURNEY3,
  UPGRADE_ADDITIONS,
  UPGRADE_STATUS,
  startPhase,
  poiRetryReserve,
  poiRetryFinish,
  upgradeDeadline,
  JOURNEY2,
  predecessorReports,
  RESUME3,
  resumeDeadline,
  trailingNoProgress,
  FIRST,
  CONTINUATION,
  RESUME,
  RESUME2,
  chainCounts,
  chainRecords,
  progress,
  resumeAttempt,
  SENTIO,
  policyFor,
  recordReport,
  NAME,
  DIRECTORY_SUFFIX,
  SENDS,
  ledgerFile,
  inspect,
  reserve,
  finish,
  consume,
  poiReserve,
  poiFinish,
};
