'use strict';
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const { EventEmitter, getEventListeners } = require('events');
const source = fs.readFileSync(
  path.join(__dirname, '../src/owners/railgun-session-worker.js'),
  'utf8'
);
function fixture() {
  const application = new AbortController(),
    parent = new AbortController(),
    scopeController = new AbortController();
  const handle = {},
    rpcHandle = {},
    subject = {
      kind: 'private-account',
      principal: 'railgun:0',
      protocol: 'railgun',
      chainId: 11155111,
      deployment: 'sepolia',
      role: 'engine',
      operation: null,
    };
  const context = {
    profileId: 'test',
    subject,
    signal: parent.signal,
    requirements: { origin: 'tor', content: 'public', correctness: 'proof', maxAgeMs: null },
  };
  const scope = {
    signal: scopeController.signal,
    close: () => scopeController.abort(),
    getContext: () => rpcHandle,
    run: (_handle, use) => use(),
  };
  const workers = [];
  const platform = {
    applicationLifetime: () => application.signal,
    spawnStorageWorker: jest.fn((input) => {
      const worker = new EventEmitter();
      worker.postMessage = jest.fn();
      worker.terminate = jest.fn(async () => 1);
      workers.push(worker);
      // Model the original transfer, preserving the real buffer identity at admission.
      structuredClone(input.workerData, { transfer: input.transferList });
      return worker;
    }),
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    Buffer,
    Uint8Array,
    SharedArrayBuffer,
    Int32Array,
    Atomics,
    AbortController,
    AbortSignal,
    EventTarget,
    Object,
    setTimeout,
    clearTimeout,
    require(name) {
      if (name === 'path' || name === 'util') return require(name);
      if (name === './host-bindings') return { platform };
      if (name === './context-bindings')
        return {
          createPrivacyScope: () => scope,
          getPrivacyContext: (h) => {
            if (![handle, rpcHandle].includes(h) || parent.signal.aborted)
              throw new Error('foreign');
            return context;
          },
        };
      throw new Error('Unexpected import:' + name);
    },
  });
  const key = Buffer.alloc(32, 7),
    storage = {
      filename: '/tmp/public-disposable-test.sqlite',
      key,
      binding: 'b'.repeat(64),
      format: 'paged-v2',
      create: true,
    };
  const close = jest.fn();
  const options = {
    handle,
    storage,
    createProvider: ({ signal }) => ({ signal, request: async () => null }),
    onClose: close,
  };
  return {
    api: module.exports,
    application,
    parent,
    scopeController,
    platform,
    workers,
    options,
    key,
    close,
    subject,
  };
}
test('worker port receives only original data and transfer; dispatch and slot wait for actual exit', async () => {
  const f = fixture(),
    session = f.api.startRailgunSessionWorker(f.options),
    worker = f.workers[0];
  const input = f.platform.spawnStorageWorker.mock.calls[0][0];
  expect(Object.keys(input).sort()).toEqual(['transferList', 'workerData']);
  expect(Object.keys(input.workerData).sort()).toEqual([
    'profileId',
    'requirements',
    'revoked',
    'storage',
    'subject',
  ]);
  expect(input.workerData.subject).toEqual(
    Object.fromEntries(Object.entries(f.subject).filter(([k]) => k !== 'operation'))
  );
  expect(input.transferList).toEqual([input.workerData.storage.key.buffer]);
  expect(input.transferList[0].byteLength).toBe(0);
  expect(f.key.every((n) => n === 7)).toBe(true);
  worker.emit('message', { type: 'ready' });
  await session.ready;
  const pending = session.dispatch('{"id":1}');
  await Promise.resolve();
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'dispatch', id: 1, wire: '{"id":1}' });
  worker.emit('message', { type: 'reply', id: 1, wire: '{"id":1,"value":null}' });
  expect(await pending).toBe('{"id":1,"value":null}');
  session.close();
  expect(() => f.api.assertRailgunSessionDirectoryClosed('/tmp')).toThrow();
  let settled = false;
  session.closed.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  worker.emit('exit', 0);
  expect(await session.closed).toEqual({ exitCode: 0 });
  expect(() => f.api.assertRailgunSessionDirectoryClosed('/tmp')).not.toThrow();
  expect(getEventListeners(f.application.signal, 'abort')).toHaveLength(0);
});
test('preaborted application never copies or spawns; fake event cannot consume real abort listener', async () => {
  const f = fixture();
  f.application.abort();
  expect(() => f.api.startRailgunSessionWorker(f.options)).toThrow();
  expect(f.platform.spawnStorageWorker).not.toHaveBeenCalled();
  const g = fixture(),
    session = g.api.startRailgunSessionWorker(g.options),
    worker = g.workers[0];
  g.application.signal.dispatchEvent(new Event('abort'));
  expect(g.close).not.toHaveBeenCalled();
  g.application.abort();
  expect(g.close).toHaveBeenCalledTimes(1);
  expect(getEventListeners(g.application.signal, 'abort')).toHaveLength(1);
  worker.emit('exit', 0);
  await session.closed;
  expect(getEventListeners(g.application.signal, 'abort')).toHaveLength(0);
});
test('failed transfer wipes owned copy without wiping caller and releases only absent worker', () => {
  const f = fixture();
  let owned;
  f.platform.spawnStorageWorker.mockImplementation((input) => {
    owned = input.workerData.storage.key;
    throw new Error('spawn failed');
  });
  expect(() => f.api.startRailgunSessionWorker(f.options)).toThrow();
  expect(owned.every((n) => n === 0)).toBe(true);
  expect(f.key.every((n) => n === 7)).toBe(true);
  expect(() => f.api.assertRailgunSessionDirectoryClosed('/tmp')).not.toThrow();
  expect(getEventListeners(f.application.signal, 'abort')).toHaveLength(0);
});
