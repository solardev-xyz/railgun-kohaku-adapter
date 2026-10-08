/** One-shot synthetic list transform for a disposable journey host copy only.
 * Applies the reviewed r5 byte transform to the installed package's POI record
 * literal and records both hashes. Never run against a live or shared host.
 *
 * node transform-host.cjs HOST_ROOT RECORD_OUT
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const { TARGET, ORIGINAL_SHA256, TEST_SHA256, transformTestList } = require('./synthetic-copy-contract.cjs');
const { file } = require('./inventory.cjs');
function main() {
  const [hostRoot, recordOut] = process.argv.slice(2);
  assert.ok(path.isAbsolute(hostRoot) && path.isAbsolute(recordOut));
  assert.ok(path.basename(hostRoot).startsWith('freedom-journey-host-'), 'Disposable journey host only');
  assert.equal(fs.existsSync(recordOut), false);
  const target = path.join(hostRoot, 'node_modules/@freedom/railgun-kohaku-adapter', TARGET);
  const before = file(target);
  assert.equal(before.sha256, ORIGINAL_SHA256);
  const changed = transformTestList(fs.readFileSync(target));
  const temporary = target + '.journey-transform';
  fs.writeFileSync(temporary, changed, { flag: 'wx', mode: before.mode });
  fs.renameSync(temporary, target);
  const after = file(target);
  assert.equal(after.sha256, TEST_SHA256);
  fs.writeFileSync(
    recordOut,
    JSON.stringify(
      {
        schema: 'railgun-journey-host-transform-v1',
        hostRoot,
        target: TARGET,
        before,
        after,
        syntheticListOnly: true,
      },
      null,
      2
    ) + '\n',
    { flag: 'wx', mode: 0o600 }
  );
}
main();
