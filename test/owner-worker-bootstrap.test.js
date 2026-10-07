'use strict';
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../host-owner-worker-bootstrap.cjs'), 'utf8');
function fixture(changes = {}) {
  class Port {
    hasRef() {
      return false;
    }
  }
  const calls = [],
    thread = { isMainThread: false, parentPort: new Port(), MessagePort: Port, ...changes };
  const bind = jest.fn(),
    module = { exports: {} };
  const realm = vm.createContext({
    module,
    require(name) {
      calls.push(name);
      if (name === 'worker_threads') return thread;
      if (name === './src/owners/worker-host-bindings')
        return { initializeRailgunWorkerHost: bind };
      if (name === './src/owners/railgun-session-worker-entry') return {};
      throw new Error('Unexpected import');
    },
  });
  vm.runInContext(source, realm);
  return { install: module.exports.installRailgunStorageWorkerBootstrap, calls, bind };
}
test.each([{ isMainThread: true }, { parentPort: null }, { parentPort: {} }])(
  'wrong realm or forged parent refuses before binding/session import %p',
  (changes) => {
    const f = fixture(changes);
    expect(f.install).toThrow();
    expect(f.calls).toEqual(['worker_threads']);
  }
);
test('binds original context before the one fixed session entry and refuses repeat', () => {
  const f = fixture(),
    bootstrap = f.install(),
    input = { context: {} };
  expect(f.calls).toEqual(['worker_threads']);
  bootstrap.initialize(input);
  expect(f.bind).toHaveBeenCalledWith(input);
  expect(f.calls).toEqual([
    'worker_threads',
    './src/owners/worker-host-bindings',
    './src/owners/railgun-session-worker-entry',
  ]);
  expect(() => bootstrap.initialize(input)).toThrow();
  expect(f.install).toThrow();
});
test('binding failure never loads protocol, cannot retry or select a path', () => {
  const f = fixture(),
    bootstrap = f.install();
  f.bind.mockImplementation(() => {
    throw new Error('refused');
  });
  expect(() => bootstrap.initialize({ context: {}, filename: '/tmp/evil' })).toThrow();
  expect(f.calls).toHaveLength(2);
  expect(() => bootstrap.initialize({ context: {} })).toThrow();
});
test('intrinsic parent-port brand rejects a forged prototype', () => {
  const { MessagePort } = require('worker_threads');
  const f = fixture({ MessagePort, parentPort: Object.create(MessagePort.prototype) });
  expect(f.install).toThrow();
  expect(f.calls).toEqual(['worker_threads']);
});
