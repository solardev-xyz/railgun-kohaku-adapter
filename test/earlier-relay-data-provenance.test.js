const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const manifest = require('../docs/owners/test-staging/EARLIER-RELAY-DATA-MIGRATIONS.json');
const root = path.join(__dirname, '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('the fixed eight missing relay suites join the immutable Freedom source', () => {
  expect(manifest.sourceRevision).toBe('c6afd0432918d1258c1aafe11117f133cdd21ef4');
  expect(manifest.files.map((row) => path.basename(row.destination)).sort()).toEqual(
    [
      'capsule',
      'intent',
      'poi-history',
      'pre-poi-data',
      'quote-data',
      'recovery-data',
      'transaction',
      'wallet-data',
    ]
      .map((name) => `earlier-relay-${name}.test.js`)
      .sort()
  );
});
test.each(manifest.files)('$destination reverses to every original assertion and byte', (row) => {
  let text = fs.readFileSync(path.join(root, row.destination), 'utf8');
  expect(sha(text)).toBe(row.destinationSha256);
  for (const edit of [...row.replacements].reverse()) {
    expect(edit.from).toMatch(/^['"]\.(?:\.\/|\/)/);
    expect(edit.to).toMatch(/^['"]\.\.\/(?:src|tools)\//);
    expect(text.split(`require(${edit.to})`).length - 1).toBe(edit.occurrences);
    expect(text.split(edit.to).length - 1).toBe(edit.occurrences);
    text = text.split(edit.to).join(edit.from);
  }
  const original = Buffer.from(text);
  expect(sha(original)).toBe(row.sourceSha256);
  expect(
    createHash('sha1').update(`blob ${original.length}\0`).update(original).digest('hex')
  ).toBe(row.sourceGitBlob);
});
test('both reused fixtures remain the same structural inputs, without engine execution', () => {
  expect(manifest.reusedFixtures).toHaveLength(2);
  for (const row of manifest.reusedFixtures)
    expect(sha(fs.readFileSync(path.join(root, row.path)))).toBe(row.sha256);
});
