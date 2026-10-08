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
const CHAIN = Object.freeze([FIRST, CONTINUATION, RESUME]);
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
  for (const key of ['type', 'version', 'transport', 'profile', 'freedomCommit', 'packageTarSha256'])
    check(same(previous[key], header[key]), 'predecessor-scope:' + key);
  check(previous.binding?.heldTransferReportSha256 === header.binding.heldTransferReportSha256, 'predecessor-held');
  if (header.name === RESUME) check(same(previous.binding?.rpc?.url, header.binding?.rpc?.url), 'predecessor-endpoint');
  check(records.slice(1).every((record) => record?.type === 'budget' && PREDECESSOR_KINDS.includes(record.kind)), 'predecessor-events');
  const carried = index - 1 > 0 ? predecessor(directory, previous) : {};
  const state = replay(records, previous, carried);
  check(state.sends.length === 0 && state.poi.pending === null && state.reports.length === 0, 'predecessor-not-empty');
  return state.budgets;
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
  check(same(records[0], header), 'header');
  const sends = [],
    budgets = Object.fromEntries(Object.entries(carried).map(([kind, rows]) => [kind, [...rows]])),
    reports = [],
    progress = [],
    attempts = [],
    poi = { pending: null, finished: null };
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
          if (policy.windowMs != null) check(record.at - used[0].at <= policy.windowMs, 'budget-replay:' + record.kind);
        }
      }
      used.push(record);
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
      check(record.lower < record.upper && Number.isSafeInteger(record.target) && record.target >= record.upper, 'resume-attempt');
      const same = attempts.filter((row) => row.lower === record.lower && row.upper === record.upper);
      check(same.length === (record.mode === 'first' ? 0 : 1), 'resume-attempt-order');
      if (record.mode === 'second') check(same[0].progressAt === progress.length, 'resume-attempt-order');
      attempts.push({ ...record, progressAt: progress.length });
    } else if (record?.type === 'scan-progress') {
      // A durable public checkpoint the coordinator returned, strictly increasing.
      check(Number.isSafeInteger(record.to) && record.to >= 0 && /^0x[0-9a-f]{64}$/.test(record.hash), 'scan-progress');
      check(progress.length === 0 || record.to > progress.at(-1).to, 'scan-progress-order');
      // Bound to the window reservation it answers: the latest, with this target.
      const window = (budgets['scan-range'] ?? []).at(-1);
      check(window && window.n === record.reservation && window.target === record.to, 'scan-progress-reservation');
      progress.push(record);
    } else if (record?.type === 'report') {
      check(typeof record.mode === 'string' && /^[0-9a-f]{64}$/.test(record.sha256), 'report');
      check(!reports.some((row) => row.sha256 === record.sha256), 'report-duplicate');
      reports.push(record);
    } else throw fail('record');
  }
  return { sends, budgets, poi, reports, progress, attempts };
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
  const empty = (budgets) => ({ file, sends: [], budgets, reports: [], progress: [], attempts: [], poi: { pending: null, finished: null } });
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
function consume(profile, header, kind, { max, minSpacingMs = 0, windowMs = null }, now = Date.now(), extra = {}) {
  check(Number.isSafeInteger(max) && max > 0, 'budget-policy');
  const used = inspect(profile, header).budgets[kind] ?? [];
  check(used.length < max, 'budget-exhausted:' + kind);
  if (used.length) {
    check(now - used.at(-1).at >= minSpacingMs, 'budget-spacing:' + kind);
    if (windowMs !== null) check(now - used[0].at <= windowMs, 'budget-window:' + kind);
  }
  append(profile, header, { type: 'budget', kind, n: used.length + 1, at: now, ...extra });
  return used.length + 1;
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
module.exports = {
  FIRST,
  CONTINUATION,
  RESUME,
  chainCounts,
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
