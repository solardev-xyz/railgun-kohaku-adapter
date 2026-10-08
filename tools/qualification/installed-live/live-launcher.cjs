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
const RECIPE = [
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
function check(request) {
  assert.equal(request.schema, 'railgun-installed-live-request-v1');
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
  }
  assert.equal(fs.realpathSync(request.profileDirectory), request.profileDirectory);
  // Campaign admission, read-only: predecessor reports must be this campaign's
  // recorded reports; an unfinished send permits observation only.
  const { sends, reports } = ledger.inspect(request.profileDirectory, request.ledgerHeader);
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
  const header = {
    type: 'railgun-installed-journey-ledger',
    version: 1,
    name: 'installed-journey-1',
    transport: value.transport,
    profile: value.profileDirectory,
    freedomCommit: value.hostCommit,
    packageCommit: value.packageCommit,
    packageTarSha256: packageTarPin.sha256,
    runnerSha256: sha(Buffer.from(JSON.stringify(recipeFiles))),
    binding: value.binding,
    caps: {
      sends: 2,
      perSendMaxGasFeeWei: '2000000000000000',
      totalMaxFeeWei: '4000000000000000',
      ...(value.transport === 'live' ? LIVE_CAPS : value.syntheticCaps),
    },
  };
  return {
    schema: 'railgun-installed-live-request-v1',
    mode: value.mode,
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
    ledgerHeader: value.ledgerHeader ?? header,
    ...(value.transport === 'live'
      ? { live: { rpcSource: value.live.rpcSource, enrolledOwner: value.live.enrolledOwner, arti: value.live.arti, artiPin: file(value.live.arti) } }
      : {
          synthetic: {
            engineModules: value.synthetic.engineModules,
            enginePins: Object.fromEntries(
              value.synthetic.engineFiles.map((name) => [name, file(path.join(value.synthetic.engineModules, name))])
            ),
            publicSource: value.synthetic.publicSource,
            publicSourceSha256: file(value.synthetic.publicSource).sha256,
            sendMode: value.synthetic.sendMode ?? 'acknowledge',
            chainState: value.synthetic.chainState
              ? { file: value.synthetic.chainState, sha256: sha(fs.readFileSync(value.synthetic.chainState)) }
              : null,
          },
        }),
  };
}
async function run(filename, digest) {
  const request = read(filename, digest);
  const sendsBefore = check(request);
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
  let sendsAfter = null;
  try {
    sendsAfter = check({ ...request, mode: 'live-observe' });
    assert.deepEqual(installed(request, path.join(request.evidenceDirectory, 'tar-post')), before);
  } catch (error) {
    failure ||= error;
  }
  if (observation) write(path.join(request.evidenceDirectory, 'process.json'), observation);
  const reportFile = path.join(request.outputDirectory, 'report.json');
  write(path.join(request.evidenceDirectory, 'RESULT.json'), {
    schema: 'railgun-installed-live-result-v1',
    mode: request.mode,
    transport: request.transport,
    passed: !failure && fs.existsSync(reportFile),
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
module.exports = { makeRequest, check, RECIPE };
