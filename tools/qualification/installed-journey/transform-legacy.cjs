/** One-shot synthetic list transform for the disposable legacy worktree only.
 * Replaces the single production REQUIRED_LIST literal of the legacy in-repo
 * POI records with the public test list key, and records both hashes.
 *
 * node transform-legacy.cjs LEGACY_ROOT RECORD_OUT
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const { ORIGINAL_LIST, TEST_LIST } = require('./synthetic-copy-contract.cjs');
const { file } = require('./inventory.cjs');
const TARGET = 'src/main/wallet/railgun-poi-records.js';
function main() {
  const [root, recordOut] = process.argv.slice(2);
  assert.ok(path.isAbsolute(root) && path.isAbsolute(recordOut));
  assert.ok(path.basename(root).startsWith('freedom-legacy-'), 'Disposable legacy worktree only');
  assert.equal(fs.existsSync(recordOut), false);
  const target = path.join(root, TARGET);
  const before = file(target);
  const text = fs.readFileSync(target, 'utf8');
  const original = `const REQUIRED_LIST = '${ORIGINAL_LIST}';`;
  const replacement = `const REQUIRED_LIST = '${TEST_LIST}';`;
  assert.equal(text.split(original).length, 2);
  assert.equal(text.includes(replacement), false);
  const changed = Buffer.from(text.replace(original, replacement));
  assert.equal(changed.length, before.bytes);
  const temporary = target + '.journey-transform';
  fs.writeFileSync(temporary, changed, { flag: 'wx', mode: before.mode });
  fs.renameSync(temporary, target);
  fs.writeFileSync(
    recordOut,
    JSON.stringify(
      { schema: 'railgun-journey-legacy-transform-v1', root, target: TARGET, before, after: file(target), syntheticListOnly: true },
      null,
      2
    ) + '\n',
    { flag: 'wx', mode: 0o600 }
  );
}
main();
