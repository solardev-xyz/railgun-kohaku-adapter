// Source-only policy composition: actual reader/policy bytes in a fresh VM,
// fixed mocked archive verifier and context assertion; no native/host authority.
const { fixture, files, root } = require("../../../../policy-fixture.cjs");
const fs = require('fs');
const path = require('path');
function fresh(change, host) {
  const verify = jest.fn((value) => value), f = fixture(verify);
  if (change) f.bytes.set(change, Buffer.from('changed validator source'));
  if (host) f.setHost(host);
  f.capture();
  return { f, verify };
}
function closedSources(seeds) {
  const included = new Set(files.map((name) => path.join(root, name))), visited = new Set();
  function walk(filename) {
    if (visited.has(filename)) return;
    visited.add(filename); expect(included.has(filename)).toBe(true);
    for (const [, name] of fs.readFileSync(filename, 'utf8').matchAll(/require\(['"](\.\.?\/[^'"]+)['"]\)/g)) {
      const dependency = require.resolve(path.resolve(path.dirname(filename), name));
      expect(dependency.startsWith(root + path.sep)).toBe(true);
      if (dependency.endsWith('.json')) expect(included.has(dependency)).toBe(true);
      else walk(dependency);
    }
  }
  for (const name of seeds) walk(path.join(root, 'src/owners', name + '.js'));
  expect(visited.size).toBeGreaterThan(seeds.length);
  return included;
}

test('TXID policy binds each validator at initialization and remains location-independent', () => {
  const { f, verify } = fresh(), read = (archive) => f.policy('railgun-txid-policy').getRailgunTxidPolicy(archive);
  const first = read('/fixture/engine.asar');
  expect(read('/elsewhere/engine.asar')).toBe(first);
  const oldSource = require('../../../../../../docs/owners/HISTORICAL-POLICY-SOURCES.json').files['railgun-txid-policy.js'];
  const oldNames = [...oldSource.split('const SOURCES = Object.freeze([')[1].split(']);')[0].matchAll(/'([^']+)'/g)].map((match) => match[1] + '.js');
  const translation = require('../../../../../../docs/owners/TRANSLATION.json').files;
  expect(oldNames).toHaveLength(17);
  for (const name of oldNames) {
    const row = translation.find((entry) => entry.source === 'src/main/wallet/' + name);
    expect(row).toBeDefined(); expect(files).toContain(row.destination);
    const changed = fresh(row.destination).f;
    expect(changed.policy('railgun-txid-policy').getRailgunTxidPolicy('/fixture/engine.asar')).not.toBe(first);
  }
  f.bytes.set('src/owners/railgun-txid-events.js', Buffer.from('changed'));
  f.setHost('b'.repeat(64)); expect(read('/fixture/engine.asar')).toBe(first);
  expect(fresh(null, 'b'.repeat(64)).f.policy('railgun-txid-policy').getRailgunTxidPolicy('/fixture/engine.asar')).not.toBe(first);
  expect(f.hostRead).toHaveBeenCalledTimes(1);
  verify.mockImplementationOnce(() => { throw Error('archive'); });
  expect(() => read('/bad')).toThrow('archive');
});
test('TXID binding is account-specific and separate from ordinary account storage', () => {
  const { railgunTxidBinding } = fresh().f.policy('railgun-txid-policy'), input = '1'.repeat(64);
  expect(railgunTxidBinding(input)).toMatch(/^[0-9a-f]{64}$/);
  expect(railgunTxidBinding(input)).not.toBe(input);
  expect(railgunTxidBinding(input)).not.toBe(railgunTxidBinding('2'.repeat(64)));
  for (const v of [null, {}, 'A'.repeat(64), '1']) expect(() => railgunTxidBinding(v)).toThrow();
});
test('TXID computation, persistence and service validators are included in package source snapshot', () => {
  const included = closedSources(['railgun-txid-job', 'railgun-txid-runner', 'railgun-txid-journal', 'railgun-txid-root']);
  expect(included.has(path.join(root, 'package.json'))).toBe(true);
  expect(files).toContain('host-poi.cjs');
});
test.each([
  'package.json',
  'host-poi.cjs',
  'src/data/railgun-poi-records.js',
  'src/data/railgun-poi-payload.js',
  'src/data/railgun-poi-creator-data.js',
  'src/data/railgun-poi-shield-selector-data.js',
  'src/data/railgun-poi-transact-selector-data.js',
  'src/data/railgun-own-poi-binding.js',
  'src/data/railgun-own-poi-shape-data.js',
  'src/data/railgun-owned-poi-records.js',
  'src/data/railgun-txid-note-witness.js',
  'src/data/railgun-txid-projection.js',
  'src/data/railgun-txid-omissions.js',
  'src/data/railgun-own-poi-payload-binding.js',
  'src/data/railgun-private-capsule.js',
  'src/data/railgun-private-offer.js',
  'src/data/railgun-private-policy.js',
  'src/data/railgun-private-intent.js',
  'src/data/railgun-private-destination.js',
  'src/railgun-shield-pins.json',
])('TXID policy binds eagerly loaded package file %s at fresh initialization', (name) => {
  const first = fresh().f.policy('railgun-txid-policy').getRailgunTxidPolicy('/engine.asar');
  expect(files).toContain(name);
  expect(fresh(name).f.policy('railgun-txid-policy').getRailgunTxidPolicy('/engine.asar')).not.toBe(first);
});

test('TXID cache excludes the outbound POI serializer while full source attestation retains it', () => {
  const name = 'src/data/railgun-poi-submit-data.js';
  expect(files).toContain(name);
  const first = fresh().f.policy('railgun-txid-policy').getRailgunTxidPolicy('/engine.asar');
  expect(fresh(name).f.policy('railgun-txid-policy').getRailgunTxidPolicy('/engine.asar')).toBe(first);
});
