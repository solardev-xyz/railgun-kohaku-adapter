/** Earlier suites were outside the151 adjacent staging manifest. */
const fs = require('fs'), path = require('path'), { createHash } = require('crypto');
const root = path.join(__dirname, '..');
const manifests = [
  [require('../docs/owners/test-staging/OUTSIDE-ADJACENT-MIGRATIONS.json'), 5],
  [require('../docs/owners/test-staging/EARLIER-SECOND-MIGRATIONS.json'), 8],
];
const sha = (text) => createHash('sha256').update(text).digest('hex');
test.each(manifests)('earlier runtime suites reconstruct exact original source and retain assertions %#', (manifest, count) => {
  expect(manifest.sourceRevision).toBe('c6afd0432918d1258c1aafe11117f133cdd21ef4');
  expect(manifest.productionTransforms).toBe(false);
  expect(manifest.changes).toHaveLength(count);
  for (const row of manifest.changes) {
    let text = fs.readFileSync(path.join(root, row.destination), 'utf8');
    expect(sha(text)).toBe(row.afterSha256);
    for (const edit of [...row.replacements].reverse()) {
      expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
      // Only literal import locations or the fixed real-context setup can change.
      if (!edit.before && edit.after === "require('../tools/owner-test-staging/context-host.cjs');\n") {
        expect(['test/owner-private-proof-recovery.test.js', 'test/earlier-poi-creator-capture.test.js', 'test/earlier-kohaku-recovery.test.js']).toContain(row.destination);
      } else {
        const strip = (value) => value.replace(/'\.\.?\/[^'\n]+'/g, "'FIXED_IMPORT'");
        expect(strip(edit.after)).toBe(strip(edit.before));
      }
      text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
    }
    expect(sha(text)).toBe(row.beforeSha256);
    expect(require('../jest.config.js').testMatch).toContain('<rootDir>/test/**/*.test.js');
  }
});
