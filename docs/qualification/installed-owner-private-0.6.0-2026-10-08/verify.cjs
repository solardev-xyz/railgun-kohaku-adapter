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
const { validate } = require('./report-contract.cjs');
const bindings = json('bindings.json');
for (const mode of ['prepare', 'unchanged-list']) {
  const wrapper = json(mode + '-report.json');
  const result = json(mode + '-result.json');
  const post = json(mode + '-post.json');
  const driver = json(mode + '-driver-observation.json');
  const main = json(mode + '-main-process.json');
  const binding = bindings.cases.find((item) => item.mode === mode);
  validate(wrapper.report);
  assert.equal(result.qualified, true);
  assert.equal(post.unchanged, true);
  assert.equal(wrapper.original.sha256, result.report.sha256);
  assert.equal(wrapper.original.bytes, result.report.bytes);
  assert.equal(driver.firstResultSha256, sha(read(mode + '-result.json')));
  assert.equal(driver.firstRequestSha256, result.requestSha256);
  assert.equal(binding.originalInputs.request.sha256, result.requestSha256);
  assert.equal(binding.originalInputs.sourceFreeze.sha256, result.sourceFreezeSha256);
  assert.equal(driver.rootOriginalDriver.exitCode, 0);
  assert.equal(driver.rootOriginalDriver.natural, true);
  assert.equal(main.code, 0);
  assert.equal(main.natural, true);
  assert.equal(main.exitObserved, true);
  assert.equal(main.closeObserved, true);
  assert.equal(binding.nativeOutcomes.utilities, wrapper.report.observations.utilities.length);
  assert.equal(binding.launcherFreezeSha256, sha(read('launcher-freeze.json')));
}
for (const attempt of ['a', 'b']) {
  const value = json('failed-attempt-' + attempt + '.json');
  assert.equal(value.qualified, false);
  assert.equal(value.result.qualified, false);
}
process.stdout.write(
  JSON.stringify({ cases: 2, retainedFailures: 2, metadataVerified: true, nativeExecuted: false }) +
    '\n'
);
