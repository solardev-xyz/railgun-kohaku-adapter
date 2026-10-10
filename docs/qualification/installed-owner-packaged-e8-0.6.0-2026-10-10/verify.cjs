'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { createHash } = require('crypto');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (name) => fs.readFileSync(path.join(__dirname, name));
const json = (name) => JSON.parse(read(name));
const pin = (name) => ({ bytes: read(name).length, sha256: sha(read(name)) });
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
for (const [name, expected] of Object.entries(manifest.files)) {
  assert.equal(path.basename(name), name);
  const bytes = read(name);
  assert.deepEqual(
    { bytes: bytes.length, sha256: sha(bytes) },
    { bytes: expected.bytes, sha256: expected.sha256 }
  );
  if (name.endsWith('.json')) pathFree(JSON.parse(bytes));
}
const result = json('RESULT.json');
const provenance = json('PROVENANCE.json');
const inventory = json('INVENTORY-FINAL.json');
const init = json('INITIALIZED.json');
const post = json('POST.json');
assert.equal(result.qualified, true);
assert.deepEqual(provenance.originalResult, pin('RESULT.json'));
for (const name of ['INITIALIZED.json', 'INVENTORY-FINAL.json', 'POST.json'])
  assert.deepEqual(result.files[name], pin(name));
assert.deepEqual(result.files['initialize.log'], pin('INITIALIZE.log'));
assert.equal(provenance.hostCommit, result.hostCommit);
assert.equal(provenance.packageCommit, result.packageCommit);
assert.equal(provenance.tarSha256, result.packageTarSha256);
assert.equal(provenance.tarPin.sha256, result.packageTarSha256);
assert.equal(provenance.vendorTarAndLockIntegrityMatchTar, true);
assert.equal(inventory.hostCommit, result.hostCommit);
assert.equal(inventory.packageCommit, result.packageCommit);
assert.equal(inventory.asarSha256, result.asar.sha256);
assert.equal(result.asarUnchangedByProbe, true);
assert.deepEqual(
  provenance.originalInputs['ASAR-BEFORE-PROBE.json'],
  result.files['ASAR-BEFORE-PROBE.json']
);
assert.equal(inventory.passed, true);
assert.equal(inventory.knownWholeRepositoryPackaging, false);
assert.equal(inventory.npmFiles, 281);
assert.equal(inventory.shipped.length, 265);
assert.equal(inventory.omitted.length, 16);
assert.equal(new Set([...inventory.shipped, ...inventory.omitted]).size, 281);
for (const name of inventory.omitted)
  assert.ok(name === 'README.md' || name.endsWith('.d.ts') || name.endsWith('.d.mts'));
assert.equal(inventory.extraPackageFiles, 0);
assert.equal(inventory.loadedHashesJoinedToTarball, true);
assert.equal(inventory.eachShippedPresentExactlyOnce, true);
assert.equal(inventory.shippedBytesEqualExceptPackageScripts, true);
assert.equal(inventory.loadedPackageFiles, 155);
assert.equal(Object.keys(init.loadedPackageFiles).length, 155);
for (const [name, digest] of Object.entries(init.loadedPackageFiles)) {
  assert.ok(inventory.shipped.includes(name));
  assert.match(digest, /^[0-9a-f]{64}$/);
}
assert.equal(init.passed, true);
assert.equal(init.processType, 'browser');
assert.equal(init.electron, '44.7.0');
assert.equal(init.electron, provenance.electronZip.version);
assert.equal(provenance.electronZip.matchesElectronChecksums, true);
assert.equal(provenance.electronZip.distMembersEqualZip, true);
assert.equal(init.hostSourceIdentity, result.hostSourceIdentity);
assert.deepEqual([...init.facade].sort(), ['createAccount', 'openAccount']);
assert.equal(init.pairedMarkers, true);
assert.equal(init.secondInitializationRefused, true);
assert.equal(init.legacyOwnerLoads, 0);
assert.equal(init.networkAttempts, 0);
assert.equal(init.accountOpened, false);
assert.equal(init.vaultOpened, false);
assert.equal(post.unchanged, true);
assert.equal(post.originalHostClean, true);
assert.equal(post.originalHostCommit, result.hostCommit);
assert.equal(post.originalSourceDependencyResourceBytesUnchanged, true);
assert.equal(post.runtimeAndTarUnchanged, true);
assert.equal(post.packagingCopyFiles, 49989);
assert.equal(post.packagingCopyFiles, provenance.physicalCopy.files);
assert.equal(post.links, 95);
assert.equal(post.links, provenance.physicalCopy.links);
assert.deepEqual(provenance.platformResourcesCopied, []);
assert.deepEqual(
  provenance.originalInputs['PRE.json'],
  provenance.originalInputs['POST-INVENTORY.json']
);
assert.equal(post.packagingInventorySha256, provenance.originalInputs['PRE.json'].sha256);
for (const [name, originalName, pid] of [
  ['BUILD-PROCESS.json', 'build-PROCESS.json', result.originalBuildPid],
  ['INITIALIZE-PROCESS.json', 'initialize-PROCESS.json', result.originalProbePid],
]) {
  const wrapper = json(name);
  assert.deepEqual(wrapper.original, result.files[originalName]);
  const observation = wrapper.observation;
  assert.equal(observation.pid, pid);
  assert.equal(observation.hostCommit, result.hostCommit);
  assert.equal(observation.exitCode, 0);
  assert.equal(observation.signal, null);
  assert.equal(observation.natural, true);
  assert.equal(observation.originalExitObserved, true);
  for (const key of ['timedOut', 'terminateRequested', 'killRequested'])
    assert.equal(observation[key], false);
}
const process = json('INITIALIZE-PROCESS.json').observation;
assert.equal(process.scriptSha256, provenance.toolPins['initialize.cjs'].sha256);
assert.deepEqual(provenance.toolPins['initialize.cjs'], result.files['initialize.cjs']);
for (const name of Object.keys(provenance.toolPins))
  assert.deepEqual(provenance.toolPins[name], result.files[name]);
assert.equal(result.firstProbeAttemptPassed, true);
assert.equal(provenance.probeAttempts, 1);
globalThis.process.stdout.write(
  JSON.stringify({ passed: true, metadataOnly: true, nativeExecuted: false }) + '\n'
);
