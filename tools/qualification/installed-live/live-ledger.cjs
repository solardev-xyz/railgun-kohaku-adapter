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
  { randomBytes } = require('crypto');
const NAME = 'installed-journey-1.jsonl';
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
function ledgerFile(profile) {
  check(path.isAbsolute(profile) && fs.realpathSync(profile) === profile, 'profile');
  return path.join(profile + DIRECTORY_SUFFIX, NAME);
}
function syncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
// Replays and validates the whole ledger.
function replay(records, header) {
  check(same(records[0], header), 'header');
  const sends = [],
    budgets = {},
    reports = [],
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
      (budgets[record.kind] ||= []).push(record);
    } else if (record?.type === 'poi-pending') {
      check(!poi.pending && id(record.handoffId), 'poi-pending');
      check(sends[0]?.finished && CONTINUING.includes(sends[0].finished.outcome?.classification), 'poi-order');
      poi.pending = record;
    } else if (record?.type === 'poi-finished') {
      check(poi.pending && !poi.finished && poi.pending.handoffId === record.handoffId, 'poi-finished');
      poi.finished = record;
    } else if (record?.type === 'report') {
      check(typeof record.mode === 'string' && /^[0-9a-f]{64}$/.test(record.sha256), 'report');
      check(!reports.some((row) => row.sha256 === record.sha256), 'report-duplicate');
      reports.push(record);
    } else throw fail('record');
  }
  return { sends, budgets, poi, reports };
}
function read(file, header) {
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
  return replay(records, header);
}
// Read-only admission: the campaign is absent, or exactly this ledger.
function inspect(profile, header) {
  const file = ledgerFile(profile),
    directory = path.dirname(file);
  let names;
  try {
    const stat = fs.lstatSync(directory);
    check(stat.isDirectory(), 'directory');
    names = fs.readdirSync(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return { file, sends: [], budgets: {}, reports: [], poi: { pending: null, finished: null } };
    if (error?.code === 'INSTALLED_JOURNEY_LEDGER_REFUSED') throw error;
    throw fail('directory');
  }
  if (names.length === 0) return { file, sends: [], budgets: {}, reports: [], poi: { pending: null, finished: null } };
  check(names.length === 1 && names[0] === NAME, 'directory');
  return { file, ...read(file, header) };
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
  replay([...existing, record], header);
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
function consume(profile, header, kind, { max, minSpacingMs = 0, windowMs = null }, now = Date.now()) {
  check(Number.isSafeInteger(max) && max > 0, 'budget-policy');
  const used = inspect(profile, header).budgets[kind] ?? [];
  check(used.length < max, 'budget-exhausted:' + kind);
  if (used.length) {
    check(now - used.at(-1).at >= minSpacingMs, 'budget-spacing:' + kind);
    if (windowMs !== null) check(now - used[0].at <= windowMs, 'budget-window:' + kind);
  }
  append(profile, header, { type: 'budget', kind, n: used.length + 1, at: now });
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
