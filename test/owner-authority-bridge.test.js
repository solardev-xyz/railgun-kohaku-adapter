'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(
  path.join(__dirname, '../host-owner-authority.cjs'),
  'utf8',
);
const cases = [
  [
    'assertRailgunPrivateSubmission',
    'railgun-private-submission',
    'assertRailgunPrivateSubmission',
  ],
  [
    'assertRailgunShieldSubmission',
    'railgun-shield-operation',
    'assertRailgunShieldSubmission',
  ],
  [
    'assertRailgunTransactResolution',
    'railgun-transact-recovery',
    'assertRailgunTransactResolution',
  ],
  [
    'assertRailgunShieldResolution',
    'railgun-shield-recovery',
    'assertRailgunShieldResolution',
  ],
  [
    'authorizeRailgunTransactResolution',
    'railgun-transact-recovery',
    'authorizeRailgunResolution',
  ],
  [
    'authorizeRailgunShieldResolution',
    'railgun-shield-recovery',
    'authorizeRailgunResolution',
  ],
];
function load() {
  const calls = [],
    module = { exports: {} },
    objects = new Map();
  let active = false;
  const refusal = new Error('owner not initialized');
  const assertRailgunOwnerHost = jest.fn(() => {
    if (!active) throw refusal;
  });
  vm.runInNewContext(source, {
    module,
    require(name) {
      calls.push(name);
      if (name === './src/owners/host-bindings')
        return { assertRailgunOwnerHost };
      if (!active) throw Error('owner loaded before admission');
      const object = objects.get(name);
      if (!object) throw Error('unexpected module');
      return object;
    },
  });
  return {
    bridge: module.exports,
    calls,
    objects,
    refusal,
    assertRailgunOwnerHost,
    activate() {
      active = true;
    },
  };
}
test('bridge is a closed six-method surface and loads no owner at import time', () => {
  const m = load();
  expect(Object.keys(m.bridge)).toEqual(cases.map(([name]) => name));
  expect(Object.isFrozen(m.bridge)).toBe(true);
  expect(m.calls).toEqual(['./src/owners/host-bindings']);
});
test.each(cases)('%s refuses before its owner module loads', (name) => {
  const m = load();
  expect(() => m.bridge[name]({})).toThrow(m.refusal);
  expect(m.calls).toEqual(['./src/owners/host-bindings']);
});
test.each(cases)(
  '%s forwards to its one genuine module without changing object or promise identity',
  (name, file, method) => {
    const m = load(),
      handle = {},
      record = {},
      completed = {},
      promise = Promise.resolve();
    const fn = jest.fn(() => promise),
      original = { [method]: fn };
    m.objects.set('./src/owners/' + file, original);
    m.activate();
    expect(m.bridge[name](handle, record, completed)).toBe(promise);
    expect(fn.mock.calls).toEqual([[handle, record, completed]]);
    expect(fn.mock.contexts).toEqual([original]);
    expect(m.calls).toEqual([
      './src/owners/host-bindings',
      './src/owners/' + file,
    ]);
    const error = new Error('original owner refusal');
    fn.mockImplementation(() => {
      throw error;
    });
    expect(() => m.bridge[name](handle, record)).toThrow(error);
    expect(m.assertRailgunOwnerHost).toHaveBeenCalledTimes(2);
  },
);

test('the real uninitialized bridge refuses before loading private owner implementations', () => {
  const real = require('../host-owner-authority.cjs');
  for (const [name] of cases)
    expect(() => real[name]({}, {}, {})).toThrow(
      expect.objectContaining({ code: 'RAILGUN_OWNER_HOST_UNAVAILABLE' }),
    );
  for (const filename of new Set(cases.map(([, file]) => file))) {
    const full = path.join(__dirname, '../src/owners/', filename + '.js');
    expect(require.cache[full]).toBeUndefined();
  }
});

test('real owner binding exposes the complete fixed process and worker platform families', () => {
  const binding = require('../src/owners/host-bindings');
  expect(Object.keys(binding.platform).sort()).toEqual([
    'applicationLifetime',
    'createUtilityChannel',
    'memorySamples',
    'spawnStorageWorker',
    'spawnUtility',
    'terminateUtility',
  ]);
  expect(Object.keys(binding.submitter)).toEqual(['readMetadata']);
  for (const method of Object.values(binding.platform)) {
    expect(typeof method).toBe('function');
    expect(() => method()).toThrow(
      expect.objectContaining({ code: 'RAILGUN_OWNER_HOST_UNAVAILABLE' }),
    );
  }
});
