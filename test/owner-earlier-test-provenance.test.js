/** Earlier suites were outside the151 adjacent staging manifest. */
const fs = require('fs'), path = require('path'), { createHash } = require('crypto');
const root = path.join(__dirname, '..');
const manifest = require('../docs/owners/test-staging/OUTSIDE-ADJACENT-MIGRATIONS.json');
const sha = (text) => createHash('sha256').update(text).digest('hex');
test('earlier runtime suites reconstruct exact original source and retain assertions', () => {
  expect(manifest.sourceRevision).toBe('c6afd0432918d1258c1aafe11117f133cdd21ef4');
  expect(manifest.productionTransforms).toBe(false);
  expect(manifest.changes).toHaveLength(5);
  for (const row of manifest.changes) {
    let text = fs.readFileSync(path.join(root, row.destination), 'utf8');
    expect(sha(text)).toBe(row.afterSha256);
    for (const edit of [...row.replacements].reverse()) {
      expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
      // Only literal import locations or the fixed real-context setup can change.
      if (!edit.before && edit.after === "require('../tools/owner-test-staging/context-host.cjs');\n") {
        expect(row.destination).toBe('test/owner-private-proof-recovery.test.js');
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
