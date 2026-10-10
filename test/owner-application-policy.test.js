'use strict';
const load = () => { jest.resetModules(); return require('../src/owners/application-policy'); };
test('default is 0.002 ETH and operation values remain strictly positive bigints', () => {
  const p = load(); p.captureRailgunApplicationPolicy();
  for (const value of [1n, 2000000000000000n]) expect(p.isRailgunGasBudget(value)).toBe(true);
  for (const value of [0n, -1n, 2000000000000001n, 1, '1', undefined]) expect(p.isRailgunGasBudget(value)).toBe(false);
  expect(() => p.captureRailgunApplicationPolicy({ maxGasFee: 1n })).toThrow('policy unavailable');
});
test.each([1n, 3000000000000000n, 1000000000000000000n])('captures the ceiling by value exactly once: %s', (maxGasFee) => {
  const p = load(), input = { maxGasFee };
  p.captureRailgunApplicationPolicy(input); input.maxGasFee = 1n;
  expect(p.isRailgunGasBudget(maxGasFee)).toBe(true);
  expect(p.isRailgunGasBudget(maxGasFee + 1n)).toBe(false);
  expect(() => p.captureRailgunApplicationPolicy({ maxGasFee: maxGasFee + 1n })).toThrow();
});
test.each([undefined, null, {}, { maxGasFee: 0n }, { maxGasFee: -1n }, { maxGasFee: 1 },
  { maxGasFee: '1' }, { maxGasFee: 1000000000000000001n }, { maxGasFee: 1n, extra: true },
  Object.create(null), { maxGasFee: 1n, [Symbol('extra')]: true },
  Object.defineProperty({}, 'maxGasFee', { value: 1n })])('invalid explicit policy poisons capture: %p', (input) => {
  const p = load(); expect(() => p.captureRailgunApplicationPolicy(input)).toThrow();
  expect(() => p.captureRailgunApplicationPolicy()).toThrow();
});
test('does not invoke getters or proxy traps', () => {
  const getter = jest.fn(() => 1n), trap = jest.fn(() => Object.prototype);
  for (const value of [Object.defineProperty({}, 'maxGasFee', { enumerable: true, get: getter }),
    new Proxy({ maxGasFee: 1n }, { getPrototypeOf: trap })]) {
    expect(() => load().captureRailgunApplicationPolicy(value)).toThrow();
  }
  expect(getter).not.toHaveBeenCalled(); expect(trap).not.toHaveBeenCalled();
});
test.each(['options', 'policy'])('malformed main %s poisons owner and execution bootstrap across module reload', (kind) => {
  const { execFileSync } = require('node:child_process');
  const script = `
    const assert = require('node:assert/strict');
    const facade = require.resolve('./src/owners/operational-facade');
    const options = ${kind === 'options' ? 'null' : '{ host: {}, runtime: {}, applicationPolicy: { maxGasFee: 0n } }'};
    assert.throws(() => require(facade).initializeRailgunMain(options));
    assert.ok(Object.hasOwn(globalThis, Symbol.for('@freedom/railgun-kohaku-adapter/owner-host-v1')));
    delete require.cache[facade];
    assert.throws(() => require(facade).initializeRailgunMain({ host: {}, runtime: {} }));
    assert.throws(() => require('./src/owners/host-bindings').initializeRailgunOwnerHost({}));
  `;
  expect(() => execFileSync(process.execPath, ['-e', script], { cwd: require('node:path').join(__dirname, '..'), stdio: 'pipe' })).not.toThrow();
});
