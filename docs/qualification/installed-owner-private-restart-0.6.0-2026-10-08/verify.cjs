'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { createHash } = require('crypto');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (name) => fs.readFileSync(path.join(__dirname, name));
const json = (name) => JSON.parse(read(name));
function pathFree(value) {
  if (typeof value === 'string')
    assert.ok(
      !value.startsWith('/') && !value.includes('/private/tmp/') && !value.includes('/Users/')
    );
  else if (Array.isArray(value)) value.forEach(pathFree);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      pathFree(key);
      pathFree(item);
    }
}
const manifest = json('MANIFEST.json');
for (const [name, pin] of Object.entries(manifest.files)) {
  assert.equal(path.basename(name), name);
  const bytes = read(name);
  assert.equal(bytes.length, pin.bytes);
  assert.equal(sha(bytes), pin.sha256);
  if (name.endsWith('.json')) pathFree(JSON.parse(bytes));
}
for (const [contract, frozen] of [
  ['report.cjs', 'private-launcher-freeze.json'],
  ['recovery-report.cjs', 'recovery-launcher-freeze.json'],
]) {
  const pin = json(frozen).artifacts[contract];
  assert.equal(read(contract).length, pin.bytes);
  assert.equal(sha(read(contract)), pin.sha256);
}
const { validate } = require('./recovery-report.cjs');
const bindings = json('bindings.json');
const modes = ['stored-proof-cold', 'signed-unfinished', 'signed-proof-cold'];
assert.deepEqual(
  bindings.cases.map((item) => item.mode),
  modes
);
for (const mode of modes) {
  const wrapper = json(mode + '-report.json');
  const result = json(mode + '-result.json');
  const post = json(mode + '-post.json');
  const driver = json(mode + '-driver-observation.json');
  const main = json(mode + '-main-process.json');
  const binding = bindings.cases.find((item) => item.mode === mode);
  validate(wrapper.report);
  assert.equal(wrapper.report.mode, mode);
  assert.equal(result.mode, mode);
  assert.equal(result.qualified, true);
  assert.equal(result.postUnchanged, true);
  assert.equal(post.unchanged, true);
  assert.equal(wrapper.original.sha256, result.report.sha256);
  assert.equal(wrapper.original.bytes, result.report.bytes);
  assert.deepEqual(wrapper.original, binding.originalInputs.report);
  assert.equal(binding.originalInputs.request.sha256, result.requestSha256);
  assert.equal(binding.originalInputs.sourceFreeze.sha256, result.sourceFreezeSha256);
  if (mode === 'signed-unfinished') {
    assert.equal(driver.firstResultSha256, sha(read(mode + '-result.json')));
    assert.equal(driver.firstRequestSha256, result.requestSha256);
  } else {
    assert.equal(driver.requestSha256, result.requestSha256);
    assert.equal(driver.sourceFreezeSha256, result.sourceFreezeSha256);
  }
  assert.equal(driver.rootOriginalDriver.exitCode, 0);
  assert.equal(driver.rootOriginalDriver.signal, null);
  assert.equal(driver.rootOriginalDriver.natural, true);
  assert.notEqual(driver.rootOriginalDriver.pid, main.pid);
  assert.equal(main.code, 0);
  assert.equal(main.signal, null);
  for (const key of ['natural', 'exitObserved', 'closeObserved']) assert.equal(main[key], true);
  for (const key of ['timedOut', 'interrupted', 'terminateRequested', 'killRequested'])
    assert.equal(main[key], false);
  assert.equal(binding.nativeOutcomes.utilities, wrapper.report.observations.utilities.length);
  assert.equal(binding.nativeOutcomes.workers, wrapper.report.observations.workers.length);
  assert.equal(
    binding.nativeOutcomes.keyReplies,
    wrapper.report.observations.utilities.reduce((n, row) => n + row.keyReplies, 0)
  );
  assert.equal(
    binding.nativeOutcomes.rpcRequests,
    Object.values(wrapper.report.scenario.syntheticRpcMethods).reduce((a, b) => a + b, 0)
  );
  const freezeName =
    mode === 'stored-proof-cold' ? 'private-launcher-freeze.json' : 'recovery-launcher-freeze.json';
  assert.equal(binding.launcherFreezeSha256, sha(read(freezeName)));
  if (mode !== 'signed-unfinished') {
    const prefix =
      mode === 'stored-proof-cold'
        ? '../installed-owner-private-0.6.0-2026-10-08/prepare'
        : 'signed-unfinished';
    const firstReport = json(prefix + '-report.json');
    const firstResult = json(prefix + '-result.json');
    assert.deepEqual(binding.firstPins.report, firstReport.original);
    assert.equal(binding.firstPins.request.sha256, firstResult.requestSha256);
    assert.equal(binding.firstPins.freeze.sha256, firstResult.sourceFreezeSha256);
    for (const [field, suffix] of [
      ['result', 'result'],
      ['post', 'post'],
      ['process', 'main-process'],
      ['driverObservation', 'driver-observation'],
    ]) {
      const bytes = read(prefix + '-' + suffix + '.json');
      assert.deepEqual(binding.firstPins[field], { bytes: bytes.length, sha256: sha(bytes) });
    }
    const fields =
      mode === 'stored-proof-cold'
        ? ['holdId', 'transactionDigest']
        : ['signatureSha256', 'capsuleSha256'];
    for (const field of fields)
      assert.equal(wrapper.report.scenario[field], firstReport.report.scenario[field]);
  }
}
process.stdout.write(
  JSON.stringify({ additionalCases: 3, metadataVerified: true, nativeExecuted: false }) + '\n'
);
