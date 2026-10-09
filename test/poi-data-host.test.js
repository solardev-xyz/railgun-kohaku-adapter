const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const provenance = require('./fixtures/poi-data-provenance.json');
const poiRetry = require('../docs/owners/POI-RETRY-TRANSITIONS.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('POI source copies and exact binder function retain immutable source provenance', () => {
  expect(provenance.sourceCommit).toBe('668e97ed19d37ce10f596cf19b1cdbd492a6226b');
  expect(Object.keys(provenance.files)).toHaveLength(26);
  const host = require('../host-poi.cjs');
  for (const [file, pin] of Object.entries(provenance.files)) {
    let text = readFileSync(path.join(__dirname, '..', file), 'utf8');
    // The explicit POI retry is a later reviewed phase: undo it to the pinned copy.
    const retry = poiRetry.changes.find((change) => change.file === file);
    if (retry) {
      expect(hash(text)).toBe(retry.afterSha256);
      for (const edit of [...retry.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(hash(text)).toBe(retry.beforeSha256);
    }
    expect(hash(text)).toBe(pin.copySha256);
    if (!file.startsWith('src/data/')) continue;
    if (pin.extractedFunction) {
      const start = text.indexOf('function bindRailgunOwnPoiPayload(');
      const end = text.indexOf('\nmodule.exports', start);
      expect(hash(text.slice(start, end))).toBe(pin.extractedFunction.sha256);
    } else {
      for (const change of [...pin.replacements].reverse())
        text = text.split(change.to).join(change.from);
      expect(hash(text)).toBe(pin.originalSha256);
    }
    for (const [name, value] of Object.entries(require('../' + file)))
      expect(host[name]).toBe(value);
  }
  expect(Object.keys(host)).toHaveLength(32);
});

test('public capsule fixture pins and retained host integration cases stay explicit', () => {
  const bytes = readFileSync(path.join(__dirname, '..', provenance.publicCapsules.path));
  expect(hash(bytes)).toBe(provenance.publicCapsules.sha256);
  expect(JSON.parse(bytes)).toHaveLength(2);
  expect(provenance.retainedFreedomIntegration).toHaveLength(1);
  expect(provenance.retainedFreedomIntegration[0].cases).toBe(3);
  const { sample } = require('./fixtures/poi-selector-capsules');
  const first = sample().capsule;
  first.walletId = 'changed';
  expect(sample().capsule.walletId).not.toBe('changed');
});

test('real CJS/ESM consumers share all 32 POI values without changing other entrypoints', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import * as esm from '@freedom/railgun-kohaku-adapter/host/poi';
    const require = createRequire(import.meta.url);
    const cjs = require('@freedom/railgun-kohaku-adapter/host/poi');
    assert.equal(Object.isFrozen(cjs), true);
    assert.equal(Object.keys(cjs).length, 32);
    assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
    for (const name of Object.keys(cjs)) assert.equal(cjs[name], esm[name]);
    for (const [subpath, count] of [['', 5], ['/read', 4], ['/data', 3], ['/host/data', 22]])
      assert.equal(Object.keys(require('@freedom/railgun-kohaku-adapter' + subpath)).length, count);
    for (const subpath of ['/host-poi.cjs', '/src/data/railgun-poi-records', '/types/host-poi'])
      assert.throws(() => require('@freedom/railgun-kohaku-adapter' + subpath),
        { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    const members = cjs.normalizePoiNotes([{ blindedCommitment: '0x' + '01'.repeat(32), type: 'Shield' }]);
    assert.equal(Object.isFrozen(members[0]), true);
    assert.equal(Object.keys(require.cache).some((file) => file.includes('/src/main/')), false);
    process.stdout.write('shared:32');
  `;
  expect(
    execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 30000,
    })
  ).toBe('shared:32');
});
