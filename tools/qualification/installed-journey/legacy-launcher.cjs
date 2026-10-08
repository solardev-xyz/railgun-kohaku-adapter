/** Outer owner of the G4 legacy hold creation run.
 * node legacy-launcher.cjs make-request <spec.json> <request-out.json>
 * node legacy-launcher.cjs run <request.json> <sha256>
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const { execFileSync } = require('child_process');
const { sha, file } = require('./inventory.cjs');
const { ownProcess } = require('./process-owner.cjs');
const HERE = __dirname;
const LEGACY_COMMIT = '843c0cfcdd499c7f136ccd7d535f1fd2271b7d21';
const RECIPE = [
  'g4-legacy-entry.cjs',
  'profile-inventory.cjs',
  'journey-chain.cjs',
  'journey-crypto.cjs',
  'journey-crypto-worker.cjs',
  'read-scenario.cjs',
  'inventory.cjs',
  'WIRE-MAP.json',
  'VECTOR.json',
];
const ENGINE_FILES = [
  '@railgun-community/engine/package.json',
  '@railgun-community/engine/dist/utils/poseidon.js',
  '@railgun-community/engine/dist/transaction/railgun-txid.js',
  '@railgun-community/engine/dist/transaction/bound-params.js',
  '@railgun-community/engine/dist/models/merkletree-types.js',
  '@railgun-community/poseidon-hash-wasm/package.json',
];
const read = (name, digest) => {
  const bytes = fs.readFileSync(name);
  if (digest) assert.equal(sha(bytes), digest);
  return JSON.parse(bytes);
};
const write = (name, value) =>
  fs.writeFileSync(name, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
function check(request) {
  assert.equal(request.schema, 'railgun-journey-legacy-request-v1');
  assert.equal(request.legacyCommit, LEGACY_COMMIT);
  assert.equal(execFileSync('/usr/bin/git', ['-C', request.legacyRoot, 'rev-parse', 'HEAD']).toString().trim(), LEGACY_COMMIT);
  assert.equal(
    execFileSync('/usr/bin/git', ['-C', request.legacyRoot, 'status', '--porcelain']).toString().trim(),
    'M src/main/wallet/railgun-poi-records.js'
  );
  const transform = read(request.legacyTransform, request.legacyTransformSha256);
  assert.equal(transform.root, request.legacyRoot);
  assert.deepEqual(file(path.join(request.legacyRoot, transform.target)), transform.after);
  for (const name of RECIPE) assert.deepEqual(file(path.join(HERE, name)), request.recipeFiles[path.join(HERE, name)]);
  for (const [name, pin] of Object.entries(request.runtimePins)) assert.deepEqual(file(name), pin);
  for (const name of ENGINE_FILES) assert.deepEqual(file(path.join(request.engineModules, name)), request.enginePins[name]);
  assert.equal(file(request.publicSource).sha256, request.publicSourceSha256);
}
function makeRequest(spec) {
  const value = read(spec);
  const runtimePins = {};
  for (const name of [value.runtime.archive, value.runtime.proverArchive, value.electron, value.electronFramework, value.electronDefaultApp])
    runtimePins[name] = file(name);
  return {
    schema: 'railgun-journey-legacy-request-v1',
    legacyRoot: value.legacyRoot,
    legacyCommit: LEGACY_COMMIT,
    legacyTransform: value.legacyTransform,
    legacyTransformSha256: sha(fs.readFileSync(value.legacyTransform)),
    runtime: value.runtime,
    runtimePins,
    electron: value.electron,
    engineModules: value.engineModules,
    enginePins: Object.fromEntries(ENGINE_FILES.map((name) => [name, file(path.join(value.engineModules, name))])),
    publicSource: value.publicSource,
    publicSourceSha256: file(value.publicSource).sha256,
    recipeFiles: Object.fromEntries(RECIPE.map((name) => [path.join(HERE, name), file(path.join(HERE, name))])),
    outputDirectory: value.outputDirectory,
    evidenceDirectory: value.evidenceDirectory,
    profileDirectory: value.profileDirectory,
  };
}
async function run(filename, digest) {
  const request = read(filename, digest);
  check(request);
  assert.equal(fs.existsSync(request.outputDirectory), false);
  assert.equal(fs.existsSync(request.evidenceDirectory), false);
  fs.mkdirSync(request.evidenceDirectory, { mode: 0o700 });
  fs.mkdirSync(path.join(request.evidenceDirectory, 'home'), { mode: 0o700 });
  const log = fs.openSync(path.join(request.evidenceDirectory, 'main.log'), 'wx', 0o600);
  const started = new Date().toISOString();
  let observation, failure;
  try {
    observation = await ownProcess(
      [request.electron, path.join(HERE, 'g4-legacy-entry.cjs'), filename, digest],
      {
        cwd: request.legacyRoot,
        env: {
          HOME: path.join(request.evidenceDirectory, 'home'),
          TMPDIR: '/private/tmp',
          PATH: '/usr/bin:/bin',
          LANG: 'en_US.UTF-8',
          FREEDOM_RAILGUN_LEGACY_JOURNEY: '1',
        },
        stdio: ['ignore', log, log],
      },
      { timeoutMs: 1800000 }
    );
    assert.equal(observation.natural, true);
    assert.equal(observation.code, 0);
  } catch (error) {
    failure = error;
    observation ||= error.processObservation;
  } finally {
    fs.closeSync(log);
  }
  try {
    check(request);
  } catch (error) {
    failure ||= error;
  }
  if (observation) write(path.join(request.evidenceDirectory, 'process.json'), observation);
  const reportFile = path.join(request.outputDirectory, 'report.json');
  write(path.join(request.evidenceDirectory, 'RESULT.json'), {
    schema: 'railgun-journey-result-v1',
    mode: 'legacy-hold',
    passed: !failure && fs.existsSync(reportFile),
    requestSha256: digest,
    startedAt: started,
    finishedAt: new Date().toISOString(),
    report: fs.existsSync(reportFile) ? file(reportFile) : null,
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
cli().catch((error) => {
  process.stderr.write('legacy launcher refused: ' + String(error?.message).slice(0, 300) + '\n');
  process.exitCode = 1;
});
