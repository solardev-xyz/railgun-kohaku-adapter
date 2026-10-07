'use strict';
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const root = path.join(__dirname, '..');
const manifest = require('../docs/owners/test-staging/MANIFEST.json');
const sha = (value) => createHash('sha256').update(value).digest('hex');
test('all staged tests and fixtures preserve exact c6 bytes through reversible import-only edits', () => {
  expect(manifest.sourceRevision).toBe('c6afd0432918d1258c1aafe11117f133cdd21ef4');
  expect(manifest.inventoryTests).toBe(180);
  expect(manifest.stagedTests).toBe(151);
  expect(manifest.stagedFixtures).toBe(17);
  expect(manifest.excluded).toHaveLength(29);
  expect(manifest.files).toHaveLength(168);
  expect(new Set(manifest.files.map((row) => row.destination)).size).toBe(168);
  for (const row of manifest.files) {
    let text = fs.readFileSync(path.join(root, row.destination), 'utf8');
    expect(sha(text)).toBe(row.destinationSha256);
    expect(row.sourceBlob).toMatch(/^[a-f0-9]{40}$/);
    let lastEnd = -1;
    // Stored offsets refer to the original source. Undo from left to right:
    // restoring each earlier literal puts the next literal at its old offset.
    for (const edit of row.edits) {
      expect(edit.start).toBeGreaterThanOrEqual(lastEnd);
      lastEnd = edit.end;
      expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
      expect(JSON.parse(edit.after).startsWith('.')).toBe(true);
      expect(edit.before[0]).toMatch(/["']/);
      text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
    }
    expect(Buffer.byteLength(text)).toBe(row.sourceBytes);
    expect(sha(text)).toBe(row.sourceSha256);
    for (const imported of row.imports) expect(fs.existsSync(path.join(root, imported))).toBe(true);
  }
});
test('browser host and installed-consumer suites remain explicit exclusions', () => {
  expect(manifest.excluded.map((row) => row.source)).toEqual(
    expect.arrayContaining([
      'src/main/wallet/private-submission-journal.test.js',
      'src/main/wallet/railgun-kohaku-adapter-package.test.js',
      'scripts/qualify-railgun-private-live.test.js',
    ])
  );
  expect(manifest.files.every((row) => !row.destination.startsWith('src/'))).toBe(true);
});
