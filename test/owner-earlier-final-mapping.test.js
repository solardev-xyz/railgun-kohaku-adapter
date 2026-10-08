const fs = require('fs'), path = require('path'), { createHash } = require('crypto');
const root = path.join(__dirname, '..');
const mapping = require('../docs/owners/test-staging/EARLIER-31-DISPOSITIONS.json');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
test('all 31 earlier test gaps have distinct explicit active or semantic dispositions', () => {
  expect(mapping.rows).toHaveLength(31);
  expect(new Set(mapping.rows.map((row) => row.source)).size).toBe(31);
  expect(mapping.counts).toEqual({
    activePackageSuccessors: 26,
    activeSemanticSuccessorsWithHistoricalWrapperApi: 4,
    retainedHostAcceptance: 1,
    unmappedWithinThis31: 0,
  });
  const counts = {};
  for (const row of mapping.rows) {
    counts[row.status] = (counts[row.status] || 0) + 1;
    expect(row.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    if (row.archive)
      expect(sha(fs.readFileSync(path.join(root, row.archive)))).toBe(row.sourceSha256);
    if (row.status === 'retained-host-acceptance-with-historical-wrapper-api') {
      // External host qualification remains explicitly attributed, never silently
      // replaced by reading an arbitrary local checkout in the default suite.
      expect(row.hostRevision).toBe('b0ecd1657362e72c402e9c7e54df6fc4e1959301');
      expect(row.destination).toBe('src/main/wallet/railgun-kohaku-adapter-package.test.js');
      expect(row.destinationSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(row.destinationBytes).toBeGreaterThan(0);
    } else {
      expect(sha(fs.readFileSync(path.join(root, row.destination)))).toBe(row.destinationSha256);
      expect(fs.statSync(path.join(root, row.provenance)).isFile()).toBe(true);
      if (row.additionalActiveTest)
        expect(fs.statSync(path.join(root, row.additionalActiveTest)).isFile()).toBe(true);
    }
  }
  expect(counts).toEqual({
    'active-package-successor': 26,
    'active-semantic-successor-with-historical-wrapper-api': 4,
    'retained-host-acceptance-with-historical-wrapper-api': 1,
  });
});
test('all migrated package successors are in normal default discovery and production remains private', () => {
  expect(require('../jest.config').testMatch).toContain('<rootDir>/test/**/*.test.js');
  const exports = require('../package.json').exports;
  expect(Object.keys(exports).some((key) => /internal|owners\/|module-getter/.test(key))).toBe(false);
  for (const row of mapping.rows.filter((value) => value.status === 'active-package-successor'))
    expect(row.destination).toMatch(/^test\/[^/]+\.test\.js$/);
  expect(require('../docs/owners/test-staging/EARLIER-RUNTIME-WRAPPER-DISPOSITIONS.json').rows).toHaveLength(7);
});
