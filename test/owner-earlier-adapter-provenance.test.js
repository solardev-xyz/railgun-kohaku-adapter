const fs = require('fs'), path = require('path'), { createHash } = require('crypto');
const root = path.join(__dirname, '..');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const migrations = require('../docs/owners/test-staging/EARLIER-ADAPTER-MIGRATIONS.json');
test('five earlier adapter suites preserve reconstructable exact originals', () => {
  expect(migrations.changes).toHaveLength(5);
  for (const row of migrations.changes) {
    let text = fs.readFileSync(path.join(root, row.destination), 'utf8');
    expect(sha(text)).toBe(row.afterSha256);
    for (const edit of [...row.replacements].reverse()) {
      expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
      text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
    }
    expect(sha(text)).toBe(row.beforeSha256);
  }
});
test('four earlier adapter assertion-body parity records bind exact current tests', () => {
  const rows = require('../docs/owners/test-staging/EARLIER-ADAPTER-AST-PARITY.json');
  expect(rows).toHaveLength(4);
  for (const row of rows) {
    expect(row.astEqualExceptImportArguments).toBe(true);
    const target = migrations.changes.find((value) => value.source === row.source);
    expect(target.beforeSha256).toBe(row.sourceSha256);
    expect(target.afterSha256).toBe(row.destinationSha256);
  }
});
test('four removed wrappers and old .5 host acceptance remain byte-exact historical tests', () => {
  const rows = require('../docs/owners/test-staging/EARLIER-WRAPPER-ORIGINS.json').changes;
  expect(rows).toHaveLength(4);
  const oldAcceptance = require('../docs/owners/historical-tests/ADAPTER-PACKAGE-ORIGIN.json');
  for (const row of [...rows, oldAcceptance]) {
    const bytes = fs.readFileSync(path.join(root, row.destination));
    expect(bytes.length).toBe(row.bytes);
    expect(sha(bytes)).toBe(row.sha256);
  }
});
