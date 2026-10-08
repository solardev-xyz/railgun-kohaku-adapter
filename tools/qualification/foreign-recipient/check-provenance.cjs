/** Reversible source move only: no engine/module/profile imports. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createHash } = require('crypto');
const { execFileSync } = require('child_process');
const manifest = require('./PROVENANCE.json');
const root = path.resolve(__dirname, '../../..');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const patch = fs.readFileSync(path.join(__dirname, 'RESTORE.patch'));
assert.equal(digest(patch), manifest.restorePatchSha256);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'railgun-foreign-source-'));
for (const row of manifest.files) {
  const original = fs.readFileSync(path.join(root, row.archivalPath));
  const copied = fs.readFileSync(path.join(root, row.path));
  assert.equal(digest(original), row.originalSha256);
  assert.equal(digest(copied), row.portedSha256);
  const target = path.join(directory, row.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, copied, { flag: 'wx' });
  if (row.path.endsWith('.test.js')) {
    const names = (text) => [...text.matchAll(/^test\((['"])(.*?)\1,/gm)].map((m) => m[2]);
    assert.equal(names(original.toString()).length, 4);
    assert.deepEqual(names(copied.toString()), names(original.toString()));
    assert.equal(
      (copied.toString().match(/\bexpect\(/g) || []).length,
      (original.toString().match(/\bexpect\(/g) || []).length
    );
  }
}
execFileSync('git', ['apply', '--reverse', '-'], { cwd: directory, input: patch });
for (const row of manifest.files)
  assert.equal(digest(fs.readFileSync(path.join(directory, row.path))), row.originalSha256);
execFileSync('git', ['apply', '-'], { cwd: directory, input: patch });
for (const row of manifest.files)
  assert.equal(digest(fs.readFileSync(path.join(directory, row.path))), row.portedSha256);
process.stdout.write(
  JSON.stringify({ files: manifest.files.length, originalTests: 4, reversible: true }) + '\n'
);
