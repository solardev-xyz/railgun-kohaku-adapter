// Source-only policy composition: actual reader/policy bytes in a fresh VM,
// fixed mocked archive verifier and context assertion; no native/host authority.
const { fixture, files, root } = require("../../../../policy-fixture.cjs");
const fs = require('fs');
const path = require('path');
const engine = require("../../../../../../src/execution/railgun-engine-manifest.json");
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

test('policy is location-independent and fresh initialization binds pinned engine and public validator', () => {
  const { f } = fresh(), read = (archive) => f.policy('railgun-public-policy').getRailgunPublicPolicy(archive);
  const first = read('/first/engine.asar');
  expect(first).toMatch(/^[0-9a-f]{64}$/);
  expect(read('/other/engine.asar')).toBe(first);
  const changed = fresh('src/owners/railgun-public-records.js').f;
  expect(changed.policy('railgun-public-policy').getRailgunPublicPolicy('/first/engine.asar')).not.toBe(first);
  f.bytes.set('src/owners/railgun-public-records.js', Buffer.from('changed validation'));
  f.setHost('b'.repeat(64));
  expect(read('/first/engine.asar')).toBe(first);
  expect(f.hostRead).toHaveBeenCalledTimes(1);
  expect(fresh(null, 'b'.repeat(64)).f.policy('railgun-public-policy').getRailgunPublicPolicy('/first/engine.asar')).not.toBe(first);
  const saved = engine.sha256;
  try { engine.sha256 = 'f'.repeat(64); expect(read('/first/engine.asar')).not.toBe(first); }
  finally { engine.sha256 = saved; }
  expect(read('/first/engine.asar')).toBe(first);
});
test('an unauthenticated archive cannot obtain a public policy or read additional sources', () => {
  const { f, verify } = fresh(), count = f.reads.length;
  verify.mockImplementationOnce(() => { throw Error('archive'); });
  expect(() => f.policy('railgun-public-policy').getRailgunPublicPolicy('/bad/engine.asar')).toThrow('archive');
  expect(f.reads).toHaveLength(count);
});
test('fixed public source closure is contained in the explicit package snapshot', () => {
  const included = closedSources(['railgun-public-run', 'railgun-public-job', 'railgun-scan-coordinator', 'railgun-scan-source', 'railgun-source-ledger', 'railgun-account-public']);
  expect(included.has(path.join(root, 'package.json'))).toBe(true);
  expect(fresh().f.policy('railgun-public-policy').QUALIFIED_THROUGH).toBe(11829346);
});
