'use strict';
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const { EventEmitter, getEventListeners } = require('events');
const jobs = require('../src/owners/process-jobs');
const source = fs.readFileSync(path.join(__dirname, '../src/owners/railgun-process.js'), 'utf8');
function fixture(job = 'relay-sign') {
  const application = new AbortController(),
    context = new AbortController(),
    brokerSignal = new AbortController();
  const handle = Object.freeze({});
  const subject = {
    kind: 'private-account',
    protocol: 'railgun',
    chainId: 11155111,
    deployment: 'sepolia',
    role: jobs.getProcessJob(job).role,
    operation: job === 'poi-membership' ? 'poi:' + 'a'.repeat(64) : job,
  };
  const original = { profileId: 'test', generation: 1, subject, signal: context.signal };
  const children = [],
    channels = [];
  const platform = {
    applicationLifetime: jest.fn(() => application.signal),
    spawnUtility: jest.fn(() => {
      const child = new EventEmitter();
      child.pid = 123 + children.length;
      child.postMessage = jest.fn();
      children.push(child);
      return child;
    }),
    createUtilityChannel: jest.fn(() => {
      const port1 = new EventEmitter(),
        port2 = new EventEmitter();
      for (const p of [port1, port2]) {
        p.close = jest.fn();
        p.start = jest.fn();
        p.postMessage = jest.fn();
      }
      const channel = { port1, port2 };
      channels.push(channel);
      return channel;
    }),
    memorySamples: jest.fn(() =>
      children.map((c) => ({ pid: c.pid, memory: { workingSetSize: 100 } }))
    ),
    terminateUtility: jest.fn(),
  };
  const broker = {
    signal: brokerSignal.signal,
    dispatch: jest.fn(async () => new Uint8Array(32).fill(7)),
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    Buffer,
    Object,
    AbortController,
    AbortSignal,
    EventTarget,
    Uint8Array,
    ArrayBuffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    require(name) {
      if (name === 'util') return require('util');
      if (name === './process-jobs') return jobs;
      if (name === './context-bindings')
        return {
          getPrivacyContext(value) {
            if (value !== handle || context.signal.aborted)
              throw new Error('Invalid genuine handle');
            return original;
          },
        };
      if (name === './host-bindings') return { platform };
      if (name === './railgun-session.js' || name === './railgun-session-worker.js') return {};
      throw new Error('Unexpected import: ' + name);
    },
  });
  const start = (extra = {}) =>
    module.exports.startRailgunProcess({
      handle,
      executionJob: job,
      input: '{}',
      broker,
      ...extra,
    });
  return {
    start,
    application,
    context,
    brokerSignal,
    subject,
    broker,
    platform,
    children,
    channels,
  };
}
const names = [
  'spending-public',
  'viewing-identity',
  'spending-sign',
  'relay-sign',
  'wallet-viewing',
  'private-prepare',
  'private-operate',
  'private-recover',
  'private-receive',
  'relay-pre-poi',
  'relay-prove-local',
  'relay-prepare',
  'relay-reconstruct',
  'poi-prove',
  'poi-transact-selector',
  'poi-output-recover',
  'shield-receive',
  'private-verify',
  'poi-verify',
  'relay-verify',
  'relay-signature-verify',
  'shield-prepare',
  'note-provenance',
  'relay-quote-review',
  'poi-shield-selector',
  'own-txid-selector',
  'own-txid-proof',
  'public-scan',
  'txid-inspect',
  'txid-project',
  'txid-apply',
  'txid-witness',
  'txid-note-witness',
  'txid-historical-root',
  'txid-coverage',
  'poi-membership',
];
afterEach(() => jest.useRealTimers());
test.each(names)('fixed %s sends only an enum and original transfer channel', async (job) => {
  const f = fixture(job),
    task = f.start();
  const child = f.children[0],
    channel = f.channels[0];
  expect(f.platform.spawnUtility).toHaveBeenCalledWith({
    entry: 'railgun-utility-v1',
    heapMb: 256,
  });
  child.emit('spawn');
  expect(child.postMessage).toHaveBeenCalledWith(
    JSON.stringify({ type: 'init', job, input: '{}' }),
    [channel.port2]
  );
  channel.port1.emit('message', { data: '{"type":"ready"}' });
  await task.ready;
  task.close();
  let closed = false;
  task.closed.then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  expect(() => f.start()).toThrow();
  child.emit('exit', 15);
  expect((await task.closed).exitCode).toBe(15);
  expect(getEventListeners(f.application.signal, 'abort')).toHaveLength(0);
});
test.each([
  { filename: '/tmp/job.js' },
  { binaryKey: true },
  { binaryKey: false },
  { executionJob: '__proto__' },
  { executionJob: 'other' },
  { handle: {} },
  { storage: {} },
  { storageWorker: true },
])('refuses legacy or foreign admission %p before spawn', (options) => {
  const f = fixture();
  expect(() => f.start(options)).toThrow();
  expect(f.platform.spawnUtility).not.toHaveBeenCalled();
});
test.each(['kind', 'protocol', 'chainId', 'deployment', 'role', 'operation'])(
  'rejects wrong genuine context %s',
  (field) => {
    const f = fixture();
    f.subject[field] = 'wrong';
    expect(() => f.start()).toThrow();
    expect(f.platform.spawnUtility).not.toHaveBeenCalled();
  }
);
test('POI job requires exact authenticated operation domain', () => {
  const f = fixture('poi-membership');
  f.subject.operation = 'poi:' + 'A'.repeat(64);
  expect(() => f.start()).toThrow();
});
test('preaborted application refuses before fork; forged abort events cannot revoke or eat subscription', async () => {
  const f = fixture();
  f.application.abort();
  expect(() => f.start()).toThrow();
  expect(f.platform.spawnUtility).not.toHaveBeenCalled();
  const g = fixture(),
    task = g.start(),
    child = g.children[0];
  child.emit('spawn');
  g.application.signal.dispatchEvent(new Event('abort'));
  expect(g.platform.terminateUtility).not.toHaveBeenCalled();
  g.application.abort();
  expect(g.platform.terminateUtility).toHaveBeenCalledWith(child, 'SIGTERM');
  expect(getEventListeners(g.application.signal, 'abort')).toHaveLength(1);
  child.emit('exit', 15);
  await task.closed;
  expect(getEventListeners(g.application.signal, 'abort')).toHaveLength(0);
});
test('fake signal and own aborted getter do not execute', () => {
  const f = fixture(),
    getter = jest.fn();
  Object.defineProperty(f.application.signal, 'aborted', { get: getter });
  expect(() => f.start()).toThrow();
  expect(getter).not.toHaveBeenCalled();
});
test('one original key reply is wiped and a second is rejected and wiped', async () => {
  const f = fixture(),
    task = f.start(),
    child = f.children[0],
    port = f.channels[0].port1;
  child.emit('spawn');
  const first = new Uint8Array(32).fill(4),
    second = new Uint8Array(32).fill(5);
  f.broker.dispatch.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const message = {
    data: JSON.stringify({
      type: 'command',
      wire: JSON.stringify({ id: 1, method: 'key', purpose: 'relay-sign' }),
    }),
  };
  port.emit('message', message);
  await Promise.resolve();
  expect(port.postMessage).toHaveBeenCalledTimes(1);
  expect(first.every((x) => x === 0)).toBe(true);
  port.emit('message', message);
  await Promise.resolve();
  expect(port.postMessage).toHaveBeenCalledTimes(1);
  expect(second.every((x) => x === 0)).toBe(true);
  expect(f.platform.terminateUtility).toHaveBeenCalled();
  child.emit('exit', 15);
  await task.closed;
});
test('keyless proof job cannot transmit broker binary response', async () => {
  const f = fixture('relay-verify'),
    task = f.start(),
    child = f.children[0],
    port = f.channels[0].port1;
  child.emit('spawn');
  const bytes = new Uint8Array(32).fill(7);
  f.broker.dispatch.mockResolvedValue(bytes);
  port.emit('message', {
    data: JSON.stringify({
      type: 'command',
      wire: '{"id":1,"method":"key","purpose":"relay-verify"}',
    }),
  });
  await Promise.resolve();
  expect(port.postMessage).not.toHaveBeenCalled();
  expect(bytes.every((x) => x === 0)).toBe(true);
  child.emit('exit', 15);
  await task.closed;
});
test('escalation uses original child and cannot release its slot', async () => {
  jest.useFakeTimers();
  const f = fixture(),
    task = f.start(),
    child = f.children[0];
  child.emit('spawn');
  task.close();
  jest.advanceTimersByTime(251);
  expect(f.platform.terminateUtility.mock.calls).toEqual([
    [child, 'SIGTERM'],
    [child, 'SIGKILL'],
  ]);
  expect(() => f.start()).toThrow();
  child.emit('exit', 9);
  await task.closed;
});
test('shutdown during channel creation still prevents the original fork', async () => {
  const f = fixture(),
    create = f.platform.createUtilityChannel.getMockImplementation();
  f.platform.createUtilityChannel.mockImplementation(() => {
    const channel = create();
    f.application.abort();
    return channel;
  });
  const task = f.start();
  expect(f.platform.spawnUtility).not.toHaveBeenCalled();
  expect((await task.closed).exitCode).toBe(null);
  expect(getEventListeners(f.application.signal, 'abort')).toHaveLength(0);
});
test.each(['startup', 'lifetime', 'memory', 'wire'])(
  'original %s refusal retains the slot until exit',
  async (mode) => {
    jest.useFakeTimers();
    const f = fixture(),
      task = f.start({ startupMs: 10, lifetimeMs: 20, rssMb: 64 }),
      child = f.children[0],
      port = f.channels[0].port1;
    child.emit('spawn');
    if (mode === 'startup') jest.advanceTimersByTime(11);
    if (mode === 'lifetime') {
      port.emit('message', { data: '{"type":"ready"}' });
      await task.ready;
      jest.advanceTimersByTime(21);
    }
    if (mode === 'memory') {
      f.platform.memorySamples.mockReturnValue([
        { pid: child.pid, memory: { workingSetSize: 100000 } },
      ]);
      jest.advanceTimersByTime(250);
    }
    if (mode === 'wire') port.emit('message', { data: 'x'.repeat(4 * 1024 * 1024 + 129) });
    expect(f.platform.terminateUtility).toHaveBeenCalledWith(child, 'SIGTERM');
    expect(() => f.start()).toThrow();
    child.emit('exit', 15);
    await task.closed;
  }
);
