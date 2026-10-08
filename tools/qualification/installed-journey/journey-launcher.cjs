/** Outer owner of one journey mode. Verifies artifact identity and pins before
 * and after, spawns the original Electron process, and records RESULT.json.
 *
 * node journey-launcher.cjs make-request <spec.json> <request-out.json>
 * node journey-launcher.cjs run <request.json> <sha256>
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const { execFileSync } = require('child_process');
const { sha, file, tree } = require('./inventory.cjs');
const { ownProcess } = require('./process-owner.cjs');
const contract = require('./synthetic-copy-contract.cjs');
const HERE = __dirname;
const RECIPE = [
  'journey-entry.cjs',
  'journey-host.cjs',
  'journey-chain.cjs',
  'journey-scenario.cjs',
  'journey-crypto.cjs',
  'journey-crypto-worker.cjs',
  'profile-inventory.cjs',
  'read-scenario.cjs',
  'synthetic-copy-contract.cjs',
  'inventory.cjs',
  'WIRE-MAP.json',
  'VECTOR.json',
];
const MODES = [
  'prepare',
  'submit-stored',
  'submit-stored-unknown',
  'cold-output',
  'transact-unshield',
  'legacy-recover',
  'policy-probe',
  'policy-recover',
  'pending-negative',
];
// Exactly the pinned engine source files the harness worker loads directly.
const ENGINE_FILES = [
  '@railgun-community/engine/package.json',
  '@railgun-community/engine/dist/utils/poseidon.js',
  '@railgun-community/engine/dist/transaction/railgun-txid.js',
  '@railgun-community/engine/dist/transaction/bound-params.js',
  '@railgun-community/engine/dist/models/merkletree-types.js',
  '@railgun-community/poseidon-hash-wasm/package.json',
];
function read(name, expectedSha) {
  const bytes = fs.readFileSync(name);
  if (expectedSha) assert.equal(sha(bytes), expectedSha);
  return JSON.parse(bytes);
}
function write(name, value) {
  fs.writeFileSync(name, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
// Installed package == tar members, except the one recorded synthetic transform.
function installedIdentity(request, scratch) {
  assert.deepEqual(file(request.packageTar), request.packageTarPin);
  assert.equal(fs.existsSync(scratch), false);
  fs.mkdirSync(scratch, { mode: 0o700 });
  execFileSync('/usr/bin/tar', ['-xzf', request.packageTar, '-C', scratch, '--strip-components=1']);
  const packed = tree(fs.realpathSync(scratch));
  const installedRoot = path.join(request.hostRoot, 'node_modules/@freedom/railgun-kohaku-adapter');
  const installed = tree(installedRoot);
  assert.deepEqual(Object.keys(installed.files).sort(), Object.keys(packed.files).sort());
  assert.deepEqual(installed.links, {});
  const transform = read(request.hostTransform, request.hostTransformSha256);
  assert.equal(transform.hostRoot, request.hostRoot);
  assert.equal(transform.target, contract.TARGET);
  const differing = [];
  for (const [name, pin] of Object.entries(packed.files)) {
    const actual = installed.files[name];
    if (actual.sha256 === pin.sha256 && actual.bytes === pin.bytes) continue;
    differing.push(name);
  }
  assert.deepEqual(differing, [contract.TARGET]);
  assert.equal(packed.files[contract.TARGET].sha256, contract.ORIGINAL_SHA256);
  assert.equal(installed.files[contract.TARGET].sha256, contract.TEST_SHA256);
  return {
    members: Object.keys(packed.files).length,
    installedSha256: sha(Buffer.from(JSON.stringify(installed.files))),
    syntheticTransform: contract.TARGET,
  };
}
function checkRequest(request) {
  assert.equal(request.schema, 'railgun-journey-request-v1');
  assert.ok(MODES.includes(request.mode));
  for (const name of RECIPE) assert.deepEqual(file(path.join(HERE, name)), request.recipeFiles[path.join(HERE, name)]);
  assert.deepEqual(Object.keys(request.recipeFiles).sort(), RECIPE.map((name) => path.join(HERE, name)).sort());
  for (const [name, pin] of Object.entries(request.runtimePins)) assert.deepEqual(file(name), pin);
  assert.deepEqual(
    Object.keys(request.runtimePins).sort(),
    [
      request.runtime.archive,
      request.runtime.proverArchive,
      request.electron,
      request.electronFramework,
      request.electronDefaultApp,
    ].sort()
  );
  assert.equal(file(request.publicSource).sha256, request.publicSourceSha256);
  assert.deepEqual(Object.keys(request.enginePins).sort(), [...ENGINE_FILES].sort());
  for (const name of ENGINE_FILES)
    assert.deepEqual(file(path.join(request.engineModules, name)), request.enginePins[name]);
  assert.equal(
    execFileSync('/usr/bin/git', ['-C', request.hostRoot, 'rev-parse', 'HEAD']).toString().trim(),
    request.hostCommit
  );
  const status = execFileSync('/usr/bin/git', ['-C', request.hostRoot, 'status', '--porcelain'])
    .toString()
    .trim();
  // A development host carries the candidate tgz uncommitted; an adoption
  // commit carries it committed. Either way the tgz must equal the pinned tar.
  assert.ok(['', 'M vendor/railgun-kohaku-adapter/freedom-railgun-kohaku-adapter-0.6.0.tgz'].includes(status));
  assert.deepEqual(
    file(path.join(request.hostRoot, 'vendor/railgun-kohaku-adapter/freedom-railgun-kohaku-adapter-0.6.0.tgz')),
    request.packageTarPin
  );
  for (const name of [request.outputDirectory, request.evidenceDirectory])
    assert.ok(name.startsWith('/private/tmp/railgun-journey-runs-oct8-'));
  if (request.mode === 'prepare') assert.equal(request.previous, null);
  else {
    assert.ok(request.previous);
    const prior = read(request.previous.report, request.previous.reportSha256);
    assert.equal(prior.schema, 'railgun-journey-native-v1');
    read(request.previous.chainState, request.previous.chainStateSha256);
  }
}
function makeRequest(spec) {
  const value = read(spec);
  const recipeFiles = {};
  for (const name of RECIPE) recipeFiles[path.join(HERE, name)] = file(path.join(HERE, name));
  const runtimePins = {};
  for (const name of [
    value.runtime.archive,
    value.runtime.proverArchive,
    value.electron,
    value.electronFramework,
    value.electronDefaultApp,
  ])
    runtimePins[name] = file(name);
  const previous = value.previous
    ? {
        report: value.previous.report,
        reportSha256: sha(fs.readFileSync(value.previous.report)),
        chainState: value.previous.chainState,
        chainStateSha256: sha(fs.readFileSync(value.previous.chainState)),
      }
    : null;
  return {
    schema: 'railgun-journey-request-v1',
    mode: value.mode,
    hostRoot: value.hostRoot,
    hostCommit: value.hostCommit,
    packageCommit: value.packageCommit,
    packageTar: value.packageTar,
    packageTarPin: file(value.packageTar),
    hostTransform: value.hostTransform,
    hostTransformSha256: sha(fs.readFileSync(value.hostTransform)),
    runtime: value.runtime,
    runtimePins,
    electron: value.electron,
    electronFramework: value.electronFramework,
    electronDefaultApp: value.electronDefaultApp,
    publicSource: value.publicSource,
    publicSourceSha256: file(value.publicSource).sha256,
    engineModules: value.engineModules,
    enginePins: Object.fromEntries(ENGINE_FILES.map((name) => [name, file(path.join(value.engineModules, name))])),
    recipeFiles,
    outputDirectory: value.outputDirectory,
    evidenceDirectory: value.evidenceDirectory,
    profileDirectory: value.profileDirectory,
    previous,
  };
}
async function run(filename, digest) {
  const request = read(filename, digest);
  checkRequest(request);
  assert.equal(fs.existsSync(request.outputDirectory), false);
  assert.equal(fs.existsSync(request.evidenceDirectory), false);
  fs.mkdirSync(request.evidenceDirectory, { mode: 0o700 });
  fs.mkdirSync(path.join(request.evidenceDirectory, 'home'), { mode: 0o700 });
  const before = installedIdentity(request, path.join(request.evidenceDirectory, 'tar-pre'));
  write(path.join(request.evidenceDirectory, 'PRE.json'), before);
  const started = new Date().toISOString();
  let processObservation, failure, report;
  const log = fs.openSync(path.join(request.evidenceDirectory, 'main.log'), 'wx', 0o600);
  try {
    processObservation = await ownProcess(
      [request.electron, path.join(HERE, 'journey-entry.cjs'), filename, digest],
      {
        cwd: request.hostRoot,
        env: {
          HOME: path.join(request.evidenceDirectory, 'home'),
          TMPDIR: '/private/tmp',
          PATH: '/usr/bin:/bin',
          LANG: 'en_US.UTF-8',
          FREEDOM_RAILGUN_INSTALLED_OWNER_JOURNEY: '1',
        },
        stdio: ['ignore', log, log],
      },
      { timeoutMs: 1800000 }
    );
    assert.equal(processObservation.natural, true);
    assert.equal(processObservation.code, 0);
    report = read(path.join(request.outputDirectory, 'report.json'));
    assert.equal(report.mode, request.mode);
  } catch (error) {
    failure = error;
    processObservation ||= error.processObservation;
  } finally {
    fs.closeSync(log);
  }
  let postUnchanged = false;
  try {
    checkRequest(request);
    const after = installedIdentity(request, path.join(request.evidenceDirectory, 'tar-post'));
    assert.deepEqual(after, before);
    postUnchanged = true;
  } catch (error) {
    failure ||= error;
  }
  if (processObservation) write(path.join(request.evidenceDirectory, 'process.json'), processObservation);
  write(path.join(request.evidenceDirectory, 'RESULT.json'), {
    schema: 'railgun-journey-result-v1',
    mode: request.mode,
    passed: !failure && postUnchanged,
    postUnchanged,
    requestSha256: digest,
    startedAt: started,
    finishedAt: new Date().toISOString(),
    report: report ? file(path.join(request.outputDirectory, 'report.json')) : null,
    chainState: fs.existsSync(path.join(request.outputDirectory, 'chain-state.json'))
      ? file(path.join(request.outputDirectory, 'chain-state.json'))
      : null,
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
    process.stderr.write((error?.code || error?.name || 'Error') + ': journey launcher refused: ' + String(error?.message).slice(0, 300) + '\n');
    process.exitCode = 1;
  });
module.exports = { makeRequest, checkRequest, installedIdentity };
