'use strict';
const fs = require('fs'),
  path = require('path'),
  { createHash } = require('crypto');
const root = path.join(__dirname, '..');
const provenance = require('../docs/execution/PROVENANCE.json');
const sha = (value) => createHash('sha256').update(value).digest('hex');
test('all 40 source dispositions and every new kernel destination are pinned', () => {
  expect(provenance.sourceRevision).toBe('a146331f63276ea5cbb90ef723195b65bc29e458');
  expect(provenance.files).toHaveLength(40);
  expect(new Set(provenance.files.map((row) => row.source)).size).toBe(40);
  for (const row of provenance.files) {
    expect(row.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sha(fs.readFileSync(path.join(root, row.destination)))).toBe(row.sha256);
  }
  for (const [file, hash] of Object.entries(provenance.additionalKernelFiles))
    expect(sha(fs.readFileSync(path.join(root, file)))).toBe(hash);
});
test('fixed local imports resolve inside the package, without Freedom paths or duplicate shared cores', () => {
  const directory = path.join(root, 'src/execution');
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.js'))) {
    const content = fs.readFileSync(path.join(directory, file), 'utf8');
    expect(content).not.toMatch(
      /require\(['"](?:.*src\/main\/|\.\.\/networks\/|\.\/privacy-artifacts)/
    );
    for (const match of content.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      if (!match[1].startsWith('.')) continue;
      const resolved = require.resolve(path.resolve(directory, match[1]));
      expect(resolved.startsWith(root + path.sep)).toBe(true);
    }
  }
  for (const row of provenance.files.filter(
    (item) => item.disposition === 'existing shared core'
  )) {
    if (!row.destination.startsWith('src/data/')) continue;
    expect(fs.existsSync(path.join(directory, path.basename(row.destination)))).toBe(false);
  }
});
