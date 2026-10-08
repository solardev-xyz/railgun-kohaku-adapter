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
  path.join(FAMILY, 'inventory.cjs'),
  path.join(FAMILY, 'journey-chain.cjs'),
  path.join(FAMILY, 'journey-crypto.cjs'),
  path.join(FAMILY, 'journey-crypto-worker.cjs'),
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
  assert.ok([ledger.FIRST, ledger.CONTINUATION, ledger.RESUME, ledger.RESUME2].includes(name));
  const resuming = [ledger.RESUME, ledger.RESUME2].includes(name);
  // Each later ledger of the fixed chain binds its stopped predecessor.
  assert.equal(Object.hasOwn(binding, 'predecessor'), name !== ledger.FIRST);
  if (request.transport === 'live' && name !== ledger.FIRST) assert.equal(binding.rpc?.url, ledger.SENTIO);
  // The resume carries its evidence-bound starting checkpoint.
  assert.equal(Object.hasOwn(binding, 'resumeFrom'), resuming);
  if (resuming) {
    const { checkpoint, failedTarget, evidence } = binding.resumeFrom;
    assert.ok(Number.isSafeInteger(checkpoint) && Number.isSafeInteger(failedTarget) && failedTarget > checkpoint);
    assert.ok(typeof evidence === 'string' && evidence.length > 0);
  }
  if (request.transport === 'live') {
    assert.equal(syntheticCaps, null);
    for (const key of ['heldTransferReportSha256', 'previousLedgers', 'finalRecoveryOutcomeSha256', 'authorizationSha256', 'rpc'])
      assert.ok(Object.hasOwn(binding, key), 'Live binding lacks ' + key);
  } else {
    assert.deepEqual(Object.keys(syntheticCaps).sort(), SYNTHETIC_CAP_KEYS);
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
    runnerSha256: sha(Buffer.from(JSON.stringify(Object.fromEntries(RECIPE.map((name) => [name, file(name)]))))),
    binding,
    caps: {
      ...FIXED_CAPS,
      ...(request.transport === 'live' ? LIVE_CAPS : syntheticCaps),
      // The reviewed resume extension: five pending openers in aggregate, nothing else.
      ...(resuming ? { scanResumes: RESUME_SCAN_RESUMES } : {}),
    },
  };
}
const RESUME_SCAN_RESUMES = 5;
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
  }
  // Later ledgers resume the existing generation; they never begin one.
  if (request.ledgerHeader.name !== ledger.FIRST) assert.notEqual(request.params.publicCache, 'new');
  assert.ok(Object.hasOwn(MODES, request.mode));
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
      assert.ok(['failLogsFrom', 'failApplyRefreshTo', 'denseFrom', 'denseTo'].includes(key) && Number.isSafeInteger(value), 'Synthetic fault ' + key);
  }
  assert.equal(fs.realpathSync(request.profileDirectory), request.profileDirectory);
  assert.equal(file(request.heldReport.file).sha256, request.heldReport.sha256);
  assert.equal(request.heldReport.sha256, request.ledgerHeader.binding.heldTransferReportSha256);
  const state = ledger.inspect(request.profileDirectory, request.ledgerHeader);
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
    assert.equal(ledger.SENDS[sends.length], kind, 'Send order or allowance exhausted');
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
module.exports = { makeRequest, validate, admit, headerFor, RECIPE, LIVE_CAPS };
