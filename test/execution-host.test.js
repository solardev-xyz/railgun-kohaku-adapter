'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const source = fs.readFileSync(path.join(__dirname, '../src/execution/host-bindings.js'), 'utf8');
function realm() {
  const context = vm.createContext({ require, Object, Symbol });
  const load = () => {
    context.module = { exports: {} };
    vm.runInContext(`(function() { ${source}\n })()`, context);
    return context.module.exports;
  };
  return { load };
}
function ports() {
  const handle = {};
  const context = {
    getPrivacyContext: jest.fn((value) => {
      if (value !== handle) throw new Error('foreign handle');
      return handle;
    }),
    createPrivacyScope: jest.fn(() => handle),
  };
  const artifacts = { createPrivacyArtifactLoader: jest.fn(() => handle) };
  return { handle, context, artifacts };
}
test('captures exact originals once; forwards real identity/error and preserves receiver', () => {
  const { load } = realm(),
    api = load(),
    p = ports();
  const original = p.context.getPrivacyContext;
  expect(() => api.getPrivacyContext(p.handle)).toThrow('unavailable');
  expect(
    api.initializeRailgunExecutionHost({ context: p.context, artifacts: p.artifacts })
  ).toBeUndefined();
  p.context.getPrivacyContext = () => {
    throw new Error('replacement');
  };
  expect(api.getPrivacyContext(p.handle)).toBe(p.handle);
  expect(original.mock.contexts[0]).toBe(p.context);
  expect(() => api.getPrivacyContext({})).toThrow('foreign handle');
  expect(() =>
    api.initializeRailgunExecutionHost({ context: p.context, artifacts: p.artifacts })
  ).toThrow('unavailable');
  expect(api.getExecutionHost).toBeUndefined();
  const copy = load();
  expect(() =>
    copy.initializeRailgunExecutionHost({ context: p.context, artifacts: p.artifacts })
  ).toThrow('unavailable');
  expect(() => copy.getPrivacyContext(p.handle)).toThrow('unavailable');
});
test.each(['extra', 'raw-fs', 'getter', 'proxy', 'function-proxy', 'missing'])(
  'refuses %s bootstrap input without invoking accessors and burns the one attempt',
  (mode) => {
    const api = realm().load(),
      p = ports();
    let value = { context: p.context, artifacts: p.artifacts };
    const getter = jest.fn();
    if (mode === 'extra') value.extra = true;
    if (mode === 'raw-fs') value.rawArchiveFs = fs;
    if (mode === 'getter') Object.defineProperty(value, 'context', { get: getter });
    if (mode === 'proxy') value = new Proxy(value, { ownKeys: getter });
    if (mode === 'function-proxy') p.context.getPrivacyContext = new Proxy(() => {}, {});
    if (mode === 'missing') delete value.artifacts;
    expect(() => api.initializeRailgunExecutionHost(value)).toThrow('unavailable');
    expect(getter).not.toHaveBeenCalled();
    expect(() =>
      api.initializeRailgunExecutionHost({ context: p.context, artifacts: p.artifacts })
    ).toThrow('unavailable');
  }
);
test('CJS/ESM exports are identical; fixed job location resolution imports no job or engine', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    const cjs = require('./host-execution.cjs');
    const esm = await import('./host-execution.mjs');
    assert.deepEqual(Object.keys(cjs).sort(), ['getRailgunExecutionJob', 'initializeRailgunExecutionHost']);
    for (const key of Object.keys(cjs)) assert.equal(cjs[key], esm[key]);
    for (const name of ['spending-public', 'viewing-identity', 'spending-sign', 'wallet-viewing',
      'private-prepare', 'private-operate', 'private-recover', 'private-receive', 'private-verify']) {
      const file = cjs.getRailgunExecutionJob(name);
      assert(!require.cache[file]);
    }
    for (const value of ['__proto__', '/tmp/evil.js', 'relay-sign', {}, null])
      assert.throws(() => cjs.getRailgunExecutionJob(value));
    assert(!Object.keys(require.cache).some(p => p.includes('ethers') || p.endsWith('-job.js')));
    assert.equal(require('./src/data/railgun-retained-private-data').normalizeRailgunPrivateCapsule,
      require('./src/execution/railgun-private-capsule').normalizeRailgunPrivateCapsule);
  `,
    ],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8' }
  );
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
});
