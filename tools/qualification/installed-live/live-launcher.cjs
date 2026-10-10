/** Outer owner of one installed-live mode.
 * node live-launcher.cjs make-request <spec.json> <request-out.json>
 * node live-launcher.cjs run <request.json> <sha256>
 *
 * Before any Electron start it verifies: host commit and exact status, the
 * installed package against the pinned tar (exact for live; only the recorded
 * synthetic list transform for synthetic), runtime/Electron/Arti pins, the
 * recipe bytes, predecessor report hashes and the campaign ledger (read-only).
 * The same checks repeat after exit. Nothing here reads the profile's
 * credentials or stores; the ledger is a profile sibling directory.
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const { execFileSync } = require('child_process');
const { sha, file, tree } = require('../installed-journey/inventory.cjs');
const { ownProcess } = require('../installed-journey/process-owner.cjs');
const contract = require('../installed-journey/synthetic-copy-contract.cjs');
const ledger = require('./live-ledger.cjs');
const { MODES } = require('./live-scenario.cjs');
const HERE = __dirname;
const FAMILY = path.join(HERE, '../installed-journey');
// Every executed runner input: the launcher and its process owner and copy
// contract decide admission, caps and evidence, so they bind the campaign too.
const RECIPE = [
  path.join(HERE, 'live-launcher.cjs'),
  path.join(FAMILY, 'process-owner.cjs'),
  path.join(FAMILY, 'synthetic-copy-contract.cjs'),
  path.join(HERE, 'live-entry.cjs'),
  path.join(HERE, 'live-scenario.cjs'),
  path.join(HERE, 'live-ledger.cjs'),
  path.join(HERE, 'vault-lifetime.cjs'),
  path.join(FAMILY, 'inventory.cjs'),
  path.join(FAMILY, 'journey-chain.cjs'),
  path.join(FAMILY, 'journey-crypto.cjs'),
  path.join(FAMILY, 'journey-crypto-worker.cjs'),
  path.join(FAMILY, 'journey-poi-verifier.cjs'),
  path.join(FAMILY, 'POI_3x3-current.vkey.json'),
  path.join(FAMILY, 'read-scenario.cjs'),
  path.join(FAMILY, 'WIRE-MAP.json'),
  path.join(FAMILY, 'VECTOR.json'),
];
const SEND_MODES = Object.freeze({ 'live-submit': 'transfer', 'live-unshield': 'unshield' });
// Durable read/disclosure budgets of the live campaign (Codex direction).
const LIVE_CAPS = Object.freeze({
  observePerSend: { max: 40, minSpacingMs: 90000 },
  readbackPerSend: { max: 6 },
  poiStatus: { max: 8, minSpacingMs: 3 * 3600 * 1000, windowMs: 24 * 3600 * 1000 },
  rebuildNew: 1,
  scanResumes: 2,
  scanRanges: 260,
  txidPages: 90,
});
const read = (name, digest) => {
  const bytes = fs.readFileSync(name);
  if (digest) assert.equal(sha(bytes), digest);
  return JSON.parse(bytes);
};
const write = (name, value) =>
  fs.writeFileSync(name, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
function installed(request, scratch) {
  assert.deepEqual(file(request.packageTar), request.packageTarPin);
  assert.equal(fs.existsSync(scratch), false);
  fs.mkdirSync(scratch, { mode: 0o700 });
  execFileSync('/usr/bin/tar', ['-xzf', request.packageTar, '-C', scratch, '--strip-components=1']);
  const packed = tree(fs.realpathSync(scratch)).files;
  const actual = tree(path.join(request.hostRoot, 'node_modules/@freedom/railgun-kohaku-adapter'));
  assert.deepEqual(actual.links, {});
  assert.deepEqual(Object.keys(actual.files).sort(), Object.keys(packed).sort());
  const differing = Object.keys(packed).filter(
    (name) => packed[name].sha256 !== actual.files[name].sha256 || packed[name].bytes !== actual.files[name].bytes
  );
  if (request.transport === 'live') assert.deepEqual(differing, []);
  else {
    assert.deepEqual(differing, [contract.TARGET]);
    assert.equal(actual.files[contract.TARGET].sha256, contract.TEST_SHA256);
  }
  return { members: Object.keys(packed).length, transformed: differing };
}
const FIXED_CAPS = Object.freeze({
  sends: 2,
  perSendMaxGasFeeWei: '2000000000000000',
  totalMaxFeeWei: '4000000000000000',
});
const SYNTHETIC_CAP_KEYS = Object.keys(LIVE_CAPS).sort();
// The ledger header is derived, never supplied: a changed runner, binding,
// profile, transport or cap refuses the campaign's ledger.
function headerFor(request, binding, syntheticCaps) {
  assert.ok(binding && typeof binding === 'object' && !Array.isArray(binding));
  const name = request.ledger ?? ledger.FIRST;
  assert.ok(
    [
      ledger.FIRST,
      ledger.CONTINUATION,
      ledger.RESUME,
      ledger.RESUME2,
      ledger.RESUME3,
      ledger.JOURNEY2,
      ledger.JOURNEY3,
      ledger.JOURNEY4,
      ledger.JOURNEY5,
      ledger.JOURNEY6,
      ledger.JOURNEY7,
    ].includes(name)
  );
  const resuming = [ledger.RESUME, ledger.RESUME2, ledger.RESUME3].includes(name);
  // Each later ledger of the fixed chain binds its stopped predecessor.
  assert.equal(Object.hasOwn(binding, 'predecessor'), name !== ledger.FIRST);
  if (request.transport === 'live' && name !== ledger.FIRST) assert.equal(binding.rpc?.url, ledger.SENTIO);
  // The resume carries its evidence-bound starting checkpoint.
  assert.equal(Object.hasOwn(binding, 'resumeFrom'), resuming);
  if (resuming) {
    const { checkpoint, failedTarget, evidence } = binding.resumeFrom;
    assert.ok(Number.isSafeInteger(checkpoint) && Number.isSafeInteger(failedTarget) && failedTarget > checkpoint);
    assert.ok(typeof evidence === 'string' && evidence.length > 0);
    // The third link's claim names its predecessor's returned checkpoint hash.
    assert.equal(Object.hasOwn(binding.resumeFrom, 'checkpointHash'), name === ledger.RESUME3);
    if (name === ledger.RESUME3) assert.match(binding.resumeFrom.checkpointHash, /^0x[0-9a-f]{64}$/);
  }
  if (request.transport === 'live') {
    assert.equal(syntheticCaps, null);
    for (const key of ['heldTransferReportSha256', 'previousLedgers', 'finalRecoveryOutcomeSha256', 'authorizationSha256', 'rpc'])
      assert.ok(Object.hasOwn(binding, key), 'Live binding lacks ' + key);
  } else {
    assert.deepEqual(Object.keys(syntheticCaps).sort(), SYNTHETIC_CAP_KEYS);
  }
  const runnerSha256 = sha(Buffer.from(JSON.stringify(Object.fromEntries(RECIPE.map((name) => [name, file(name)])))));
  // An upgrade link names this exact host, package, artifact and runner, and
  // its phase allowances are derived from its bound boundary counts.
  const upgrading = ledger.UPGRADES.includes(name);
  const circuit = name === ledger.JOURNEY4;
  const amending = name === ledger.JOURNEY5;
  const attempting = name === ledger.JOURNEY6;
  const summarizing = name === ledger.JOURNEY7;
  assert.equal(Object.hasOwn(binding, 'upgrade'), upgrading);
  assert.equal(Object.hasOwn(binding, 'phase'), upgrading);
  // The send amendment names this exact host, package and runner, the same
  // host and package as its predecessor's, and carries that ledger's caps.
  assert.equal(Object.hasOwn(binding, 'amendment'), amending);
  if (amending) {
    const { amendment } = binding;
    assert.deepEqual(amendment.to, {
      freedomCommit: request.hostCommit,
      packageCommit: request.packageCommit,
      packageTarSha256: request.packageTarPin.sha256,
      runnerSha256,
    });
    assert.equal(amendment.from.freedomCommit, request.hostCommit);
    assert.equal(amendment.from.packageTarSha256, request.packageTarPin.sha256);
    // Two chain transactions and the fee caps stay exactly as they were.
    for (const [key, value] of Object.entries(FIXED_CAPS)) assert.equal(amendment.caps?.[key], value);
    assert.equal(Object.hasOwn(amendment.caps, 'sendReservations'), false);
  }
  // The summary-only link: this exact host and runner, the same package tar as
  // journey-6, and journey-6's caps exactly.
  assert.equal(Object.hasOwn(binding, 'summary'), summarizing);
  if (summarizing) {
    const { summary } = binding;
    assert.deepEqual(summary.to, {
      freedomCommit: request.hostCommit,
      packageCommit: request.packageCommit,
      packageTarSha256: request.packageTarPin.sha256,
      runnerSha256,
    });
    assert.equal(summary.from.packageTarSha256, request.packageTarPin.sha256);
    for (const [key, value] of Object.entries(FIXED_CAPS)) assert.equal(summary.caps?.[key], value);
  }
  // The bounded-attempts link: the same host and package as journey-5, this
  // exact runner, and journey-5's caps carried with its three reservations.
  assert.equal(Object.hasOwn(binding, 'attempts'), attempting);
  if (attempting) {
    const { attempts } = binding;
    assert.deepEqual(attempts.to, {
      freedomCommit: request.hostCommit,
      packageCommit: request.packageCommit,
      packageTarSha256: request.packageTarPin.sha256,
      runnerSha256,
    });
    assert.equal(attempts.from.freedomCommit, request.hostCommit);
    assert.equal(attempts.from.packageTarSha256, request.packageTarPin.sha256);
    for (const [key, value] of Object.entries(FIXED_CAPS)) assert.equal(attempts.caps?.[key], value);
    assert.equal(attempts.caps.sendReservations, ledger.AMENDMENT_RESERVATIONS);
    assert.equal(Object.hasOwn(attempts.caps, 'custodyVerify'), false);
  }
  let phaseCaps = {};
  if (upgrading) {
    assert.deepEqual(binding.upgrade.to, {
      freedomCommit: request.hostCommit,
      packageCommit: request.packageCommit,
      packageTarSha256: request.packageTarPin.sha256,
      runnerSha256,
    });
    // The circuit link moves from the retired POI_3x3 artifacts to exactly the
    // files this run's runtime directory holds (re-read before and after it).
    assert.equal(Object.hasOwn(binding.upgrade, 'artifacts'), circuit);
    if (circuit) {
      const pins = Object.fromEntries(
        ['wasm', 'zkey', 'vkey'].map((kind) => {
          const { bytes, sha256 } = file(path.join(request.runtime.artifactDirectory, 'POI_3x3.' + kind));
          return [kind, { bytes, sha256 }];
        })
      );
      assert.deepEqual(binding.upgrade.artifacts, {
        from: { POI_3x3: { ...ledger.RETIRED_POI_3X3 } },
        to: { POI_3x3: pins },
      });
    }
    const { boundary, additions } = binding.phase;
    assert.deepEqual(additions, { ...(circuit ? ledger.REPROOF_ADDITIONS : ledger.UPGRADE_ADDITIONS) });
    for (const value of Object.values(boundary)) assert.ok(Number.isSafeInteger(value) && value >= 0);
    phaseCaps = {
      scanRanges: boundary.scanRanges + additions.scanRanges,
      txidPages: boundary.txidPages + additions.txidPages,
      rebuildNew: boundary.scanOpenNew + additions.scanOpenNew,
      scanResumes: boundary.scanOpenPending + additions.scanOpenPending,
      poiStatus: { max: boundary.poiStatus + additions.poiStatus, ...ledger.UPGRADE_STATUS, phaseFrom: boundary.poiStatus },
      // The retry stays one (consumed on the circuit link); the replacement is separate.
      poiRetries: 1,
      ...(circuit ? { poiReproofs: 1 } : {}),
    };
  }
  return {
    type: 'railgun-installed-journey-ledger',
    version: 1,
    name,
    transport: request.transport,
    profile: request.profileDirectory,
    freedomCommit: request.hostCommit,
    packageCommit: request.packageCommit,
    packageTarSha256: request.packageTarPin.sha256,
    runnerSha256,
    binding,
    caps: amending
      ? { ...binding.amendment.caps, sendReservations: ledger.AMENDMENT_RESERVATIONS }
      : summarizing
      ? { ...binding.summary.caps }
      : attempting
      ? {
          ...binding.attempts.caps,
          sendReservations: ledger.ATTEMPT_RESERVATIONS,
          custodyVerify: { max: ledger.CUSTODY_VERIFICATIONS },
        }
      : {
          ...FIXED_CAPS,
          ...(request.transport === 'live' ? LIVE_CAPS : syntheticCaps),
          // The reviewed resume extension: five pending openers in aggregate, nothing else.
          ...(resuming ? { scanResumes: name === ledger.RESUME3 ? RESUME3_SCAN_RESUMES : RESUME_SCAN_RESUMES } : {}),
          // The post-send link keeps its predecessor's caps exactly.
          ...(name === ledger.JOURNEY2 || upgrading ? { scanResumes: RESUME3_SCAN_RESUMES } : {}),
          ...phaseCaps,
        },
  };
}
// The amendment's unsent evidence, read from the bound reconcile report itself:
// that exact reservation finished unsent with no hold, no G1 read and no hash.
// A present-but-unjournaled hold reconciles to the same classification, so the
// classification alone never qualifies.
function assertUnsentEvidence(request) {
  const { amendment } = request.ledgerHeader.binding;
  const { reconcile, unsent } = amendment;
  const report = read(reconcile.report, reconcile.reportSha256);
  assert.equal(report.mode, 'live-reconcile');
  assert.equal(report.transport, request.transport);
  const value = report.scenario;
  assert.equal(value.schema, 'railgun-installed-live-unshield-v1');
  assert.equal(value.send, 'unshield');
  assert.equal(value.reconciled, 'finished');
  assert.deepEqual(value.outcome, { ...ledger.UNSENT });
  assert.equal(value.holdIdSha256, null);
  assert.equal(value.g1, null);
  assert.equal(value.stop, true);
  assert.equal(value.outputNoteIdSha256, unsent.outputNoteIdSha256);
  assert.deepEqual(value.unshield, unsent.unshield);
  assert.equal(value.ledgerHeaderSha256, reconcile.headerSha256);
}
// Journey-7's bound resolution, read from journey-6's own observe report: the
// actual unshield matched, included, resolved and finalized.
function assertSummaryEvidence(request) {
  const { observe, unshield } = request.ledgerHeader.binding.summary;
  const report = read(observe.report, observe.reportSha256);
  assert.equal(report.mode, 'live-observe');
  assert.equal(report.transport, request.transport);
  const value = report.scenario;
  assert.equal(value.schema, 'railgun-installed-live-observe-v1');
  assert.equal(value.send, 'unshield');
  assert.equal(value.transactionHash, unshield.transactionHash);
  assert.equal(value.continuable, true);
  assert.equal(value.final?.resolved, true);
  assert.equal(value.final?.observation?.status, 'included');
  assert.equal(value.resolution?.status, 'resolved');
  assert.equal(value.resolution?.outcome, 'matched');
  assert.equal(value.resolution?.transactionHash, unshield.transactionHash);
  assert.ok(Number.isSafeInteger(value.final.observation.blockNumber));
  assert.ok(value.resolution.finalizedBlockNumber >= value.final.observation.blockNumber, 'Not finalized');
  assert.equal(value.ledgerHeaderSha256, observe.headerSha256);
}
// Journey-6's bound refused attempt, read from its own recorded report: that
// exact reservation refused with no hash, no hold and no G1 read.
function assertAttemptEvidence(request) {
  const { previous } = request.ledgerHeader.binding.attempts;
  const report = read(previous.report.report, previous.report.reportSha256);
  assert.equal(report.mode, 'live-unshield');
  assert.equal(report.transport, request.transport);
  const value = report.scenario;
  assert.equal(value.schema, 'railgun-installed-live-unshield-v1');
  assert.equal(value.send, 'unshield');
  assert.deepEqual(value.outcome, previous.outcome);
  assert.equal(value.outcome.classification, ledger.REFUSED);
  assert.equal(Object.hasOwn(value.outcome, 'transactionHash'), false);
  assert.equal(value.holdIdSha256, null);
  assert.equal(value.g1, null);
  assert.equal(value.stop, true);
  assert.equal(value.outputNoteIdSha256, previous.unsent.outputNoteIdSha256);
  assert.deepEqual(value.unshield, previous.unsent.unshield);
  assert.equal(value.ledgerHeaderSha256, previous.report.headerSha256);
}
const RESUME_SCAN_RESUMES = 5;
// Each upgrade link runs only its own modes and the continuation stages; its
// own modes run nowhere else. No rebuild of the old kind, no transfer, no first
// handoff, and the retry never on the circuit link.
const UPGRADE_MODES = Object.freeze({
  [ledger.JOURNEY3]: Object.freeze(['live-upgrade-rebuild', 'live-poi-retry']),
  [ledger.JOURNEY4]: Object.freeze(['live-reproof-rebuild', 'live-poi-reproof']),
  // The send amendment has no modes of its own: continuation stages only.
  [ledger.JOURNEY5]: Object.freeze([]),
  // The bounded-attempts link's own custody verification, plus continuation.
  [ledger.JOURNEY6]: Object.freeze(['live-custody-verify']),
  // The summary-only link: the summary, and no continuation stage.
  [ledger.JOURNEY7]: Object.freeze([]),
});
const SUMMARY_ONLY = Object.freeze(['live-summary']);
const CONTINUATION_MODES = Object.freeze(['live-poi-status', 'live-unshield', 'live-observe', 'live-summary', 'live-reconcile']);
function assertModeAdmitted(name, mode) {
  const own = UPGRADE_MODES[name] ?? null;
  if (name === ledger.JOURNEY7) assert.ok(SUMMARY_ONLY.includes(mode), 'Mode not admitted on the summary link');
  else if (own) assert.ok([...own, ...CONTINUATION_MODES].includes(mode), 'Mode not admitted on the upgrade link');
  for (const [link, modes] of Object.entries(UPGRADE_MODES))
    if (link !== name) assert.ok(!modes.includes(mode), 'Mode admitted on its own upgrade link only');
}
// The reviewed third-link backstop: twelve more openers, 17 in aggregate;
// progress admits each (see the ledger).
const RESUME3_SCAN_RESUMES = 17;
// The vault auto-locks 15 minutes after unlock; live polling stays inside it.
const LIVE_MAX_MS = 10 * 60 * 1000;
// The continuation's plan under the pinned old runner (eeb7734a): 100000-block
// windows from block 0, each reserved only after the previous one resolved.
// Its k reservations therefore committed k-1 windows and failed the k-th.
function assertResumeClaim(request) {
  const counts = ledger.chainCounts(request.profileDirectory, request.ledgerHeader, 'scan-range');
  const k = counts[ledger.CONTINUATION];
  const { checkpoint, failedTarget } = request.ledgerHeader.binding.resumeFrom;
  assert.ok(Number.isSafeInteger(k) && k >= 1, 'Resume claim: no continuation ranges');
  assert.equal(checkpoint, (k - 1) * 100000 - 1, 'Resume claim checkpoint');
  assert.equal(failedTarget, k * 100000 - 1, 'Resume claim failed target');
  // A second link carries the same claim: its predecessor resume recorded no
  // checkpoint, and every window it attempted targeted the claimed window.
  if (request.ledgerHeader.name === ledger.RESUME2) {
    const prior = ledger.chainRecords(request.profileDirectory, request.ledgerHeader)[ledger.RESUME];
    assert.ok(Array.isArray(prior), 'Resume claim: no first resume');
    assert.ok(!prior.some((record) => record.type === 'scan-progress'), 'Resume claim: first resume progressed');
    const windows = prior.filter((record) => record.type === 'budget' && record.kind === 'scan-range');
    assert.ok(windows.every((record) => record.target === failedTarget), 'Resume claim: first resume windows');
  }
}
// Immutable request facts, valid before and after the process alike.
function validate(request) {
  assert.equal(request.schema, 'railgun-installed-live-request-v1');
  assert.deepEqual(
    request.ledgerHeader,
    headerFor(
      request,
      request.ledgerHeader?.binding,
      request.transport === 'live' ? null : Object.fromEntries(SYNTHETIC_CAP_KEYS.map((key) => [key, request.ledgerHeader?.caps?.[key]]))
    ),
    'Ledger header is not derived from this request'
  );
  if (request.transport === 'live') {
    assert.equal(request.ledgerHeader.binding.rpc.url, request.live.rpcUrl);
    // Live parameters: no fault hook; publicCache only for the rebuild.
    for (const key of Object.keys(request.params)) assert.ok(['publicCache', 'maxMs', 'poiStatusMaxAgeMs'].includes(key), 'Live parameter ' + key);
    if (Object.hasOwn(request.params, 'publicCache')) assert.equal(request.mode, 'live-rebuild');
    if (Object.hasOwn(request.params, 'maxMs')) assert.ok(request.params.maxMs <= LIVE_MAX_MS, 'Live maxMs within the vault lifetime');
  }
  // Later ledgers resume the existing generation; they never begin one.
  if (request.ledgerHeader.name !== ledger.FIRST) assert.notEqual(request.params.publicCache, 'new');
  assert.ok(Object.hasOwn(MODES, request.mode));
  assertModeAdmitted(request.ledgerHeader.name, request.mode);
  assert.ok(['live', 'synthetic'].includes(request.transport));
  assert.deepEqual(Object.keys(request.recipeFiles).sort(), [...RECIPE].sort());
  for (const name of RECIPE) assert.deepEqual(file(name), request.recipeFiles[name]);
  for (const [name, pin] of Object.entries(request.runtimePins)) assert.deepEqual(file(name), pin);
  assert.equal(
    execFileSync('/usr/bin/git', ['-C', request.hostRoot, 'rev-parse', 'HEAD']).toString().trim(),
    request.hostCommit
  );
  const status = execFileSync('/usr/bin/git', ['-C', request.hostRoot, 'status', '--porcelain']).toString().trim();
  if (request.transport === 'live') assert.equal(status, '');
  else assert.ok(['', 'M vendor/railgun-kohaku-adapter/freedom-railgun-kohaku-adapter-0.6.0.tgz'].includes(status));
  assert.deepEqual(
    file(path.join(request.hostRoot, 'vendor/railgun-kohaku-adapter/freedom-railgun-kohaku-adapter-0.6.0.tgz')),
    request.packageTarPin
  );
  if (request.transport === 'live') {
    assert.deepEqual(file(request.live.arti), request.live.artiPin);
    assert.equal(request.live.arti, path.join(request.hostRoot, 'arti-bin', 'mac-arm64', 'arti'));
    assert.ok(/^0x[0-9a-f]{40}$/.test(request.live.enrolledOwner));
  } else {
    for (const [name, pin] of Object.entries(request.synthetic.enginePins))
      assert.deepEqual(file(path.join(request.synthetic.engineModules, name)), pin);
    assert.equal(file(request.synthetic.publicSource).sha256, request.synthetic.publicSourceSha256);
    assert.ok(['primary', 'limited'].includes(request.synthetic.endpoint));
    for (const [key, value] of Object.entries(request.synthetic.faults))
      assert.ok(
        [
          'failLogsFrom',
          'failApplyRefreshTo',
          'denseFrom',
          'denseTo',
          'latencyMs',
          'failValidatedTxid',
          'rejectPoiSubmits',
          'failPoisPerList',
          'failRootHistoryRead',
          'rejectRootHistoryRead',
        ].includes(key) &&
          Number.isSafeInteger(value),
        'Synthetic fault ' + key
      );
  }
  assert.equal(fs.realpathSync(request.profileDirectory), request.profileDirectory);
  assert.equal(file(request.heldReport.file).sha256, request.heldReport.sha256);
  assert.equal(request.heldReport.sha256, request.ledgerHeader.binding.heldTransferReportSha256);
  const state = ledger.inspect(request.profileDirectory, request.ledgerHeader);
  if (request.ledgerHeader.name === ledger.JOURNEY5) assertUnsentEvidence(request);
  if (request.ledgerHeader.name === ledger.JOURNEY6) assertAttemptEvidence(request);
  if (request.ledgerHeader.name === ledger.JOURNEY7) assertSummaryEvidence(request);
  // The third link's claim is derived from its predecessor's records by the ledger.
  if ([ledger.RESUME, ledger.RESUME2].includes(request.ledgerHeader.name)) assertResumeClaim(request);
  return state;
}
// Pre-run admission, read-only: predecessor reports must be this campaign's
// recorded reports (recorded only after a successful, postchecked run); an
// unfinished send permits observation only.
function admit(request) {
  const { sends, reports } = validate(request);
  for (const reference of [request.previous, ...Object.values(request.lineage ?? {})].filter(Boolean)) {
    read(reference.report, reference.reportSha256);
    assert.ok(reports.some((row) => row.sha256 === reference.reportSha256), 'Report not recorded by this campaign');
  }
  const kind = SEND_MODES[request.mode];
  if (kind) {
    assert.ok(sends.every((send) => send.finished), 'Unfinished send: observation only');
    // The amendment's one further unshield (the ledger binds its predecessor).
    const further =
      (request.ledgerHeader.name === ledger.JOURNEY5 && sends.length === 2) ||
      (request.ledgerHeader.name === ledger.JOURNEY6 && sends.length >= 3 && sends.length < ledger.ATTEMPT_RESERVATIONS);
    const next = further ? 'unshield' : ledger.SENDS[sends.length];
    assert.equal(next, kind, 'Send order or allowance exhausted');
    // Journey-6: a further attempt follows only its custody verification of the
    // previous refused attempt, read from that verification's own report.
    if (request.ledgerHeader.name === ledger.JOURNEY6) {
      const custody = read(request.previous.report, request.previous.reportSha256);
      assert.equal(custody.mode, 'live-custody-verify');
      assert.equal(custody.scenario.schema, 'railgun-installed-live-custody-v1');
      assert.equal(custody.scenario.verdict, 'no-hold', 'Custody not established');
      assert.ok(['first-instrumented', 'transport-qualified'].includes(custody.scenario.eligibility), 'No eligibility');
      assert.equal(custody.scenario.attemptId, sends.at(-1).pending.attemptId);
      // The very allValid status read the custody verification admitted.
      assert.equal(request.lineage?.poi?.reportSha256, custody.scenario.statusReportSha256, 'Not the status the custody admitted');
    }
  }
  return sends.length;
}
function makeRequest(spec) {
  const value = read(spec);
  const runtimePins = {};
  for (const name of [value.runtime.archive, value.runtime.proverArchive, value.electron, value.electronFramework, value.electronDefaultApp])
    runtimePins[name] = file(name);
  const recipeFiles = Object.fromEntries(RECIPE.map((name) => [name, file(name)]));
  const reference = (report) => (report ? { report, reportSha256: sha(fs.readFileSync(report)) } : null);
  const packageTarPin = file(value.packageTar);
  assert.equal(Object.hasOwn(value, 'ledgerHeader'), false, 'The ledger header is derived, not supplied');
  if (value.transport === 'live') assert.equal(Object.hasOwn(value, 'syntheticCaps'), false);
  const header = headerFor(
    {
      transport: value.transport,
      ledger: value.ledger ?? ledger.FIRST,
      profileDirectory: value.profileDirectory,
      hostCommit: value.hostCommit,
      packageCommit: value.packageCommit,
      packageTarPin,
      runtime: value.runtime,
    },
    value.binding,
    value.transport === 'live' ? null : value.syntheticCaps
  );
  return {
    schema: 'railgun-installed-live-request-v1',
    mode: value.mode,
    ledger: value.ledger ?? ledger.FIRST,
    transport: value.transport,
    hostRoot: value.hostRoot,
    hostCommit: value.hostCommit,
    packageCommit: value.packageCommit,
    packageTar: value.packageTar,
    packageTarPin,
    runtime: value.runtime,
    runtimePins,
    electron: value.electron,
    recipeFiles,
    profileDirectory: value.profileDirectory,
    outputDirectory: value.outputDirectory,
    evidenceDirectory: value.evidenceDirectory,
    previous: reference(value.previous),
    lineage: value.lineage
      ? Object.fromEntries(Object.entries(value.lineage).map(([name, report]) => [name, reference(report)]))
      : null,
    params: value.params ?? {},
    heldReport: { file: value.heldReport, sha256: file(value.heldReport).sha256 },
    ledgerHeader: header,
    ...(value.transport === 'live'
      ? {
          live: {
            rpcSource: value.live.rpcSource,
            rpcUrl: value.binding.rpc.url,
            enrolledOwner: value.live.enrolledOwner,
            arti: value.live.arti,
            artiPin: file(value.live.arti),
          },
        }
      : {
          synthetic: {
            engineModules: value.synthetic.engineModules,
            enginePins: Object.fromEntries(
              value.synthetic.engineFiles.map((name) => [name, file(path.join(value.synthetic.engineModules, name))])
            ),
            publicSource: value.synthetic.publicSource,
            publicSourceSha256: file(value.synthetic.publicSource).sha256,
            sendMode: value.synthetic.sendMode ?? 'acknowledge',
            endpoint: value.synthetic.endpoint ?? 'primary',
            faults: value.synthetic.faults ?? {},
            chainState: value.synthetic.chainState
              ? { file: value.synthetic.chainState, sha256: sha(fs.readFileSync(value.synthetic.chainState)) }
              : null,
          },
        }),
  };
}
async function run(filename, digest) {
  const request = read(filename, digest);
  const sendsBefore = admit(request);
  assert.equal(fs.existsSync(request.outputDirectory), false);
  assert.equal(fs.existsSync(request.evidenceDirectory), false);
  fs.mkdirSync(request.evidenceDirectory, { mode: 0o700 });
  const live = request.transport === 'live';
  if (!live) fs.mkdirSync(path.join(request.evidenceDirectory, 'home'), { mode: 0o700 });
  const before = installed(request, path.join(request.evidenceDirectory, 'tar-pre'));
  const log = fs.openSync(path.join(request.evidenceDirectory, 'main.log'), 'wx', 0o600);
  const started = new Date().toISOString();
  let observation, failure;
  try {
    observation = await ownProcess(
      [request.electron, path.join(HERE, 'live-entry.cjs'), filename, digest],
      {
        cwd: request.hostRoot,
        env: {
          // Live keeps the user's HOME: safeStorage needs the login keychain.
          HOME: live ? process.env.HOME : path.join(request.evidenceDirectory, 'home'),
          TMPDIR: '/private/tmp',
          PATH: '/usr/bin:/bin',
          LANG: 'en_US.UTF-8',
          FREEDOM_RAILGUN_INSTALLED_LIVE: '1',
          ...(live ? { FREEDOM_WALLET_TOR_EXPERIMENT: '1' } : {}),
        },
        stdio: ['ignore', log, log],
      },
      { timeoutMs: 2 * 60 * 60 * 1000 }
    );
    assert.equal(observation.natural, true);
    assert.equal(observation.code, 0);
  } catch (error) {
    failure = error;
    observation ||= error.processObservation;
  } finally {
    fs.closeSync(log);
  }
  let sendsAfter = null,
    recorded = false;
  const reportFile = path.join(request.outputDirectory, 'report.json');
  try {
    sendsAfter = validate(request).sends.length;
    assert.deepEqual(installed(request, path.join(request.evidenceDirectory, 'tar-post')), before);
    // Only a natural, successful, postchecked run yields an admissible report.
    if (!failure) {
      assert.ok(fs.existsSync(reportFile), 'No report');
      ledger.recordReport(request.profileDirectory, request.ledgerHeader, request.mode, file(reportFile).sha256);
      recorded = true;
    }
  } catch (error) {
    failure ||= error;
  }
  if (observation) write(path.join(request.evidenceDirectory, 'process.json'), observation);
  write(path.join(request.evidenceDirectory, 'RESULT.json'), {
    schema: 'railgun-installed-live-result-v1',
    mode: request.mode,
    transport: request.transport,
    passed: !failure && recorded,
    reportRecorded: recorded,
    requestSha256: digest,
    startedAt: started,
    finishedAt: new Date().toISOString(),
    ledgerSends: { before: sendsBefore, after: sendsAfter },
    report: fs.existsSync(reportFile) ? file(reportFile) : null,
    failure: failure ? { code: failure.code ?? null, name: failure.name ?? null } : null,
  });
  if (failure) throw failure;
}
async function cli() {
  const [command, a, b] = process.argv.slice(2);
  if (command === 'make-request') {
    assert.equal(fs.existsSync(b), false);
    write(b, makeRequest(a));
    process.stdout.write(sha(fs.readFileSync(b)) + '\n');
    return;
  }
  assert.equal(command, 'run');
  await run(a, b);
}
if (require.main === module)
  cli().catch((error) => {
    process.stderr.write(
      (error?.code || error?.name || 'Error') +
        ': installed live launcher refused ' +
        String(error?.reason ?? error?.message ?? '').slice(0, 160) +
        '\n'
    );
    process.exitCode = 1;
  });
module.exports = {
  makeRequest,
  validate,
  admit,
  headerFor,
  assertModeAdmitted,
  assertUnsentEvidence,
  assertAttemptEvidence,
  assertSummaryEvidence,
  RECIPE,
  LIVE_CAPS,
};
