'use strict';
/** VM transport seams only. The guard implementation has its own copied tests;
 * this suite checks ordering and protocol without launching Electron/crypto. */
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const { EventEmitter } = require('events');
const source = fs.readFileSync(path.join(__dirname, '../host-bootstrap.cjs'), 'utf8');
const jobs = {
  'spending-public': 'railgun-identity-job',
  'viewing-identity': 'railgun-identity-job',
  'spending-sign': 'railgun-spend-sign-job',
  'wallet-viewing': 'railgun-wallet-job',
  'private-prepare': 'railgun-private-prepare-job',
  'private-operate': 'railgun-private-operate-job',
  'private-recover': 'railgun-private-recover-job',
  'private-receive': 'railgun-private-receive-job',
  'private-verify': 'railgun-private-verify-job',
};
function fixture(run = jest.fn(async () => {}), changes = {}) {
  const parent = new EventEmitter(),
    port = new EventEmitter(),
    imports = [];
  const net = {},
    initialize = jest.fn(),
    report = jest.fn(() => ({ hooks: [], canaries: 0, attempts: 0 }));
  let refusal;
  const process = {
    env: { SECRET: 'must-be-cleared' },
    versions: { electron: 'fixture' },
    type: 'utility',
    parentPort: parent,
    exit: jest.fn(),
    ...changes,
  };
  port.start = jest.fn();
  port.close = jest.fn();
  port.postMessage = jest.fn();
  const install = jest.fn((options) => {
    expect(imports).toEqual(['./src/execution/railgun-process-guards', 'electron']);
    expect(process.env).toEqual({ WS_NO_BUFFER_UTIL: '1', WS_NO_UTF_8_VALIDATE: '1' });
    expect(options.electronNet).toBe(net);
    refusal = options.onRefusal;
    return { report };
  });
  const module = { exports: {} };
  const sandbox = {
    module,
    process,
    Buffer,
    AbortController,
    Uint8Array,
    ArrayBuffer,
    require(name) {
      imports.push(name);
      if (name === 'electron') return { net };
      if (name === './src/execution/railgun-process-guards')
        return { installRailgunProcessGuards: install };
      if (name === './src/execution/host-bindings')
        return { initializeRailgunExecutionHost: initialize };
      if (Object.values(jobs).some((job) => name === './src/execution/' + job)) return { run };
      throw new Error('Unexpected import');
    },
  };
  const realm = vm.createContext(sandbox);
  vm.runInContext(source, realm);
  const loadCopy = () => {
    sandbox.module = { exports: {} };
    vm.runInContext(`(function() { ${source}\n })()`, realm);
    return sandbox.module.exports;
  };
  const start = (...args) => module.exports.installRailgunExecutionBootstrap(...args);
  const send = (job, extra = {}) =>
    parent.emit('message', {
      data: JSON.stringify({
        type: 'init',
        job,
        input: ['spending-public', 'viewing-identity'].includes(job)
          ? JSON.stringify({ purpose: job })
          : '{}',
        ...extra,
      }),
      ports: [port],
    });
  return {
    start,
    loadCopy,
    send,
    imports,
    initialize,
    install,
    run,
    port,
    parent,
    process,
    report,
    refuse: () => refusal(),
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
test.each(Object.entries(jobs))(
  'fixed %s loads only %s after guard and one initialization',
  async (name, file) => {
    const f = fixture(),
      bootstrap = f.start(),
      bindings = {};
    expect(f.imports).toHaveLength(2);
    expect(Object.keys(bootstrap)).toEqual(['initialize']);
    bootstrap.initialize(bindings);
    expect(f.initialize).toHaveBeenCalledWith(bindings);
    expect(() => bootstrap.initialize(bindings)).toThrow('unavailable');
    f.send(name);
    await tick();
    expect(f.imports.at(-1)).toBe('./src/execution/' + file);
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.run.mock.calls[0][0])).toEqual(
      ['spending-public', 'viewing-identity'].includes(name) ? { purpose: name } : {}
    );
    expect(f.run.mock.calls[0][1].guardReport).toBe(f.report);
    expect(f.port.postMessage).toHaveBeenLastCalledWith(JSON.stringify({ type: 'ready' }));
    expect(() => f.start()).toThrow('unavailable');
  }
);
test.each(['/tmp/evil.js', 'relay-sign', '__proto__', '../railgun-identity-job', '', null])(
  'refuses unknown utility job %p without requiring it',
  async (name) => {
    const f = fixture();
    f.start().initialize({});
    f.send(name);
    await tick();
    expect(f.run).not.toHaveBeenCalled();
    expect(f.imports).toHaveLength(3);
    expect(f.port.close.mock.calls.length + f.process.exit.mock.calls.length).toBe(1);
  }
);
test('old absolute filename input is not accepted', () => {
  const f = fixture();
  f.start().initialize({});
  f.parent.emit('message', {
    data: JSON.stringify({ type: 'init', filename: '/tmp/evil.js', input: '{}' }),
    ports: [f.port],
  });
  expect(f.run).not.toHaveBeenCalled();
  expect(f.process.exit).toHaveBeenCalledWith(1);
});
test.each([{ type: 'browser' }, { versions: {} }, { parentPort: null }])(
  'wrong realm refuses before any import',
  (changes) => {
    const f = fixture(undefined, changes);
    expect(f.start).toThrow('unavailable');
    expect(f.imports).toEqual([]);
  }
);
test('host preemption is fatal, never starts message handler or a job', () => {
  const f = fixture(),
    bootstrap = f.start();
  f.initialize.mockImplementation(() => {
    throw new Error('preempted');
  });
  expect(() => bootstrap.initialize({})).toThrow('unavailable');
  expect(f.process.exit).toHaveBeenCalledWith(1);
  expect(f.parent.listenerCount('message')).toBe(0);
});
test('original 32-byte id-1 binary reply reaches the job unchanged', async () => {
  let received;
  const f = fixture(
    jest.fn(async (_, ports) => {
      received = await ports.requestKey('{"id":1}');
    })
  );
  f.start().initialize({});
  f.send('spending-sign');
  await tick();
  const bytes = new Uint8Array(32);
  f.port.emit('message', { data: { type: 'key-reply', id: 1, bytes } });
  await tick();
  expect(received).toBe(bytes);
  expect(f.port.postMessage).toHaveBeenLastCalledWith('{"type":"ready"}');
});
test.each(['offset', 'wrong-id', 'extra', 'length'])(
  'malformed %s key reply fails and drains pending request',
  async (mode) => {
    let settled = false;
    const f = fixture(
      jest.fn(async (_, ports) => {
        try {
          await ports.requestKey('{"id":1}');
        } finally {
          settled = true;
        }
      })
    );
    f.start().initialize({});
    f.send('spending-sign');
    await tick();
    const data = { type: 'key-reply', id: 1, bytes: new Uint8Array(32) };
    if (mode === 'offset') data.bytes = new Uint8Array(new ArrayBuffer(33), 1, 32);
    if (mode === 'wrong-id') data.id = 2;
    if (mode === 'extra') data.extra = true;
    if (mode === 'length') data.bytes = new Uint8Array(31);
    f.port.emit('message', { data });
    await tick();
    expect(settled).toBe(true);
    expect(f.port.postMessage).not.toHaveBeenCalledWith('{"type":"ready"}');
    expect(f.port.close).toHaveBeenCalledTimes(1);
  }
);
test('guard refusal aborts the original pending job and suppresses readiness', async () => {
  let signal,
    settled = false;
  const f = fixture(
    jest.fn(async (_, ports) => {
      signal = ports.signal;
      try {
        await ports.request('{"id":1}');
      } finally {
        settled = true;
      }
    })
  );
  f.start().initialize({});
  f.send('private-verify');
  await tick();
  f.refuse();
  await tick();
  expect(signal.aborted).toBe(true);
  expect(settled).toBe(true);
  expect(f.port.postMessage).toHaveBeenLastCalledWith('{"type":"failure","reason":"egress"}');
});

test('does not accept a caller substitute for real Electron net', () => {
  const f = fixture();
  expect(() => f.start({ electronNet: {} })).toThrow('unavailable');
  expect(f.imports).toEqual([]);
});

test('a duplicate bootstrap copy refuses before reinstalling guards', () => {
  const f = fixture();
  f.start();
  const copy = f.loadCopy();
  expect(() => copy.installRailgunExecutionBootstrap()).toThrow('unavailable');
  expect(f.install).toHaveBeenCalledTimes(1);
});
test('actual package require cache at guard installation contains only bootstrap and guard', () => {
  const { spawnSync } = require('child_process');
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const assert = require('assert/strict'), Module = require('module'), path = require('path');
    const root = process.cwd(), original = Module._load;
    Object.defineProperty(process.versions, 'electron', { value: 'test-only' });
    process.type = 'utility';
    process.parentPort = new (require('events').EventEmitter)();
    let cacheObserved = false;
    Module._load = function(request, parent, main) {
      if (request === 'electron') return { net: { request() {}, fetch() {}, resolveHost() {} } };
      const loaded = original.call(this, request, parent, main);
      if (request === './src/execution/railgun-process-guards') return {
        installRailgunProcessGuards(options) {
          assert.deepEqual(Object.keys(require.cache).filter(file => file.startsWith(root + path.sep)).sort(),
            [path.join(root, 'host-bootstrap.cjs'), path.join(root, 'src/execution/railgun-process-guards.js')].sort());
          cacheObserved = true;
          return loaded.installRailgunProcessGuards(options);
        }
      };
      return loaded;
    };
    require('./host-bootstrap.cjs').installRailgunExecutionBootstrap();
    assert.equal(cacheObserved, true);
  `,
    ],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 10000 }
  );
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
});

test.each([
  ['spending-public', '{"purpose":"viewing-identity"}'],
  ['viewing-identity', '{"purpose":"spending-public"}'],
  ['spending-public', '{}'],
  ['spending-public', 'null'],
  ['viewing-identity', 'invalid-json'],
])('identity enum %s refuses mismatched input %s before importing its job', async (name, input) => {
  const f = fixture();
  f.start().initialize({});
  f.send(name, { input });
  await tick();
  expect(f.imports).toHaveLength(3);
  expect(f.run).not.toHaveBeenCalled();
  expect(f.port.postMessage).toHaveBeenCalledWith('{"type":"failure","reason":"job"}');
});
test('keyless verifier has a rejecting key function without any broker command', async () => {
  const f = fixture(
    jest.fn(async (_, ports) => {
      await expect(ports.requestKey('{"id":1}')).rejects.toThrow('unavailable');
    })
  );
  f.start().initialize({});
  f.send('private-verify');
  await tick();
  expect(f.port.postMessage.mock.calls).toEqual([['{"type":"ready"}']]);
});
test.each(['private-prepare', 'private-operate'])(
  '%s still receives its genuine viewing-key reply',
  async (name) => {
    let received;
    const f = fixture(
      jest.fn(async (_, ports) => {
        received = await ports.requestKey('{"id":1}');
      })
    );
    f.start().initialize({});
    f.send(name);
    await tick();
    const bytes = new Uint8Array(32);
    f.port.emit('message', { data: { type: 'key-reply', id: 1, bytes } });
    await tick();
    expect(received).toBe(bytes);
    expect(f.port.postMessage).toHaveBeenLastCalledWith('{"type":"ready"}');
  }
);
test('synchronous initialization registers the first-message listener before returning', () => {
  const f = fixture();
  const installed = f.start();
  expect(f.parent.listenerCount('message')).toBe(0);
  installed.initialize({});
  expect(f.parent.listenerCount('message')).toBe(1);
  f.send('private-verify');
  expect(f.imports.at(-1)).toBe('./src/execution/railgun-private-verify-job');
});
