'use strict';
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const { EventEmitter, getEventListeners } = require('events');
const jobs = require('../src/owners/process-jobs');
const source = fs.readFileSync(path.join(__dirname, '../src/owners/railgun-process.js'), 'utf8');
function fixture(job = 'relay-sign', allowRevokedContext = false) {
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
            if (value !== handle || (context.signal.aborted && !allowRevokedContext))
              throw Object.assign(new Error('Invalid genuine handle'), {
                code: 'PRIVACY_CONTEXT_REVOKED',
              });
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
  const closed = f.start();
  await expect(closed.ready).rejects.toMatchObject({ code: 'RAILGUN_PROCESS_CLOSED' });
  expect(await closed.closed).toMatchObject({ code: 'RAILGUN_PROCESS_CLOSED', exitCode: null });
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

test.each([
  ['application', 'RAILGUN_PROCESS_CLOSED'],
  ['context', 'PRIVACY_CONTEXT_REVOKED'],
  ['brokerSignal', 'RAILGUN_SESSION_REVOKED'],
])(
  'genuine preaborted %s preserves cancellation attribution and an observed absent-child close',
  async (field, code) => {
    const f = fixture('relay-sign', true);
    f[field].abort();
    const task = f.start();
    await expect(task.ready).rejects.toMatchObject({ code });
    expect(await task.closed).toEqual({
      code,
      exitCode: null,
      peakRssBytes: 0,
      escalated: false,
      peerDisconnected: false,
    });
    expect(f.platform.spawnUtility).not.toHaveBeenCalled();
    expect(f.platform.createUtilityChannel).not.toHaveBeenCalled();
    expect(getEventListeners(f.application.signal, 'abort')).toHaveLength(0);
  }
);
test('the genuine context authority own revoked-handle error is preserved', () => {
  const f = fixture();
  f.context.abort();
  expect(() => f.start()).toThrow(expect.objectContaining({ code: 'PRIVACY_CONTEXT_REVOKED' }));
  expect(f.platform.spawnUtility).not.toHaveBeenCalled();
});
test.each([
  null,
  {},
  Object.create(AbortSignal.prototype),
  new Proxy(new AbortController().signal, {}),
])('malformed application signal has INVALID attribution %p', (signal) => {
  const f = fixture();
  f.platform.applicationLifetime.mockReturnValue(signal);
  expect(() => f.start()).toThrow(expect.objectContaining({ code: 'RAILGUN_PROCESS_INVALID' }));
  expect(f.platform.spawnUtility).not.toHaveBeenCalled();
});
test('malformed broker signal has INVALID attribution without dispatch', () => {
  const f = fixture();
  f.broker.signal = {};
  expect(() => f.start()).toThrow(expect.objectContaining({ code: 'RAILGUN_PROCESS_INVALID' }));
  expect(f.broker.dispatch).not.toHaveBeenCalled();
});

// Successors to the historical generic-filename supervisor controls. The real
// current supervisor runs above; platform/context ports remain explicit doubles.
test.each(
  names.flatMap((job) =>
    ["kind", "protocol", "chainId", "deployment", "role", "operation"].map(
      (field) => [job, field],
    ),
  ),
)("fixed %s refuses crossed %s before spawn", (job, field) => {
  const f = fixture(job);
  f.subject[field] = "foreign";
  expect(() => f.start()).toThrow(
    expect.objectContaining({ code: "RAILGUN_PROCESS_INVALID" }),
  );
  expect(f.platform.spawnUtility).not.toHaveBeenCalled();
});
test.each([
  { input: {} },
  { input: "x".repeat(65537) },
  { input: "€".repeat(21846) },
  { startupMs: 0 },
  { startupMs: 120001 },
  { lifetimeMs: 29999 },
  { lifetimeMs: 1800001 },
  { heapMb: 15 },
  { heapMb: 1025 },
  { heapMb: 16.5 },
  { rssMb: 63 },
  { rssMb: 2049 },
  { createProvider() {} },
  { storageWorker: "false" },
  { executionJob: undefined },
])("invalid input or resource bound refuses before spawn %p", (options) => {
  const f = fixture();
  expect(() => f.start(options)).toThrow();
  expect(f.platform.spawnUtility).not.toHaveBeenCalled();
});
test("readiness waits for actual memory observation; twenty misses refuse without releasing", async () => {
  jest.useFakeTimers();
  const f = fixture();
  f.platform.memorySamples.mockReturnValue([]);
  const task = f.start(),
    child = f.children[0],
    port = f.channels[0].port1;
  let ready = false;
  task.ready.then(() => {
    ready = true;
  });
  child.emit("spawn");
  port.emit("message", { data: '{"type":"ready"}' });
  await Promise.resolve();
  expect(ready).toBe(false);
  f.platform.memorySamples.mockReturnValue([
    { pid: child.pid, memory: { workingSetSize: 123 } },
  ]);
  jest.advanceTimersByTime(250);
  await task.ready;
  expect(task.getStatus().peakRssBytes).toBe(123 * 1024);
  f.platform.memorySamples.mockReturnValue([]);
  jest.advanceTimersByTime(4750);
  expect(f.platform.terminateUtility).not.toHaveBeenCalled();
  jest.advanceTimersByTime(250);
  expect(task.getStatus().code).toBe("RAILGUN_PROCESS_MEMORY_UNAVAILABLE");
  expect(() => f.start()).toThrow();
  child.emit("exit", 15);
  await task.closed;
});
test("commands reserve dispatch synchronously in arrival order and borrowed broker owns late work", async () => {
  const f = fixture(),
    releases = [];
  f.broker.close = jest.fn();
  f.broker.dispatch.mockImplementation(
    () => new Promise((resolve) => releases.push(resolve)),
  );
  const task = f.start(),
    child = f.children[0],
    port = f.channels[0].port1;
  child.emit("spawn");
  for (const id of [1, 2])
    port.emit("message", {
      data: JSON.stringify({
        type: "command",
        wire: JSON.stringify({ id, method: "read" }),
      }),
    });
  expect(f.broker.dispatch.mock.calls).toEqual([
    ['{"id":1,"method":"read"}'],
    ['{"id":2,"method":"read"}'],
  ]);
  task.close();
  child.emit("exit", 15);
  await task.closed;
  expect(f.broker.close).not.toHaveBeenCalled();
  const late = new Uint8Array(32).fill(9);
  releases[0](late);
  releases[1]('{"id":2,"value":null}');
  await Promise.resolve();
  expect(late.every((n) => n === 0)).toBe(true);
  expect(port.postMessage).not.toHaveBeenCalled();
  expect(f.brokerSignal.signal.aborted).toBe(false);
});
test("context revocation before original spawn sends no initialization and keeps slot until exit", async () => {
  const f = fixture("relay-sign", true),
    task = f.start(),
    child = f.children[0];
  f.context.abort();
  child.emit("spawn");
  expect(child.postMessage).not.toHaveBeenCalled();
  await expect(task.ready).rejects.toMatchObject({
    code: "PRIVACY_CONTEXT_REVOKED",
  });
  expect(() => f.start()).toThrow(
    expect.objectContaining({ code: "RAILGUN_PROCESS_BUSY" }),
  );
  child.emit("exit", 15);
  await task.closed;
});
test.each([
  ["duplicate-ready", "RAILGUN_PROCESS_FAILED"],
  ["malformed", "RAILGUN_PROCESS_FAILED"],
  ["extra-key", "RAILGUN_PROCESS_FAILED"],
  ["transferred-port", "RAILGUN_PROCESS_FAILED"],
  ["parent-message", "RAILGUN_PROCESS_FAILED"],
  ["child-error", "RAILGUN_PROCESS_FAILED"],
  ["disconnect", "RAILGUN_PROCESS_CHANNEL_CLOSED"],
  ["egress", "RAILGUN_PROCESS_EGRESS_REFUSED"],
  ["job", "RAILGUN_PROCESS_FAILED"],
  ["protocol", "RAILGUN_PROCESS_FAILED"],
])(
  "%s preserves refusal attribution and original closure",
  async (mode, code) => {
    const f = fixture(),
      task = f.start(),
      child = f.children[0],
      port = f.channels[0].port1;
    child.emit("spawn");
    port.emit("message", { data: '{"type":"ready"}' });
    await task.ready;
    if (mode === "duplicate-ready")
      port.emit("message", { data: '{"type":"ready"}' });
    if (mode === "malformed") port.emit("message", { data: "{" });
    if (mode === "extra-key")
      port.emit("message", { data: '{"type":"ready","extra":true}' });
    if (mode === "transferred-port")
      port.emit("message", { data: '{"type":"ready"}', ports: [{}] });
    if (mode === "parent-message") child.emit("message", "{}");
    if (mode === "child-error")
      child.emit("error", Error("controlled failure"));
    if (mode === "disconnect") port.emit("close");
    if (["egress", "job", "protocol"].includes(mode))
      port.emit("message", {
        data: JSON.stringify({ type: "failure", reason: mode }),
      });
    expect(task.getStatus().code).toBe(code);
    expect(() => f.start()).toThrow();
    child.emit("exit", 15);
    expect(await task.closed).toMatchObject({
      code,
      peerDisconnected: mode === "disconnect",
    });
  },
);
test("spawn timeout rejects readiness promptly but never releases an unobserved child", async () => {
  jest.useFakeTimers();
  const f = fixture(),
    task = f.start({ startupMs: 10 }),
    child = f.children[0];
  jest.advanceTimersByTime(11);
  await expect(task.ready).rejects.toMatchObject({
    code: "RAILGUN_PROCESS_SPAWN_TIMEOUT",
  });
  let closed = false;
  task.closed.then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  expect(() => f.start()).toThrow();
  child.emit("exit", 9);
  await task.closed;
});
test("global two slots and same owner exclusion release only original exited children", async () => {
  const f = fixture(),
    first = f.start();
  expect(() => f.start()).toThrow();
  f.subject.principal = "railgun:1";
  const second = f.start();
  f.subject.principal = "railgun:2";
  expect(() => f.start()).toThrow();
  first.close();
  expect(() => f.start()).toThrow();
  f.children[0].emit("exit", 15);
  await first.closed;
  const third = f.start();
  second.close();
  third.close();
  f.children[1].emit("exit", 15);
  f.children[2].emit("exit", 15);
  await Promise.all([second.closed, third.closed]);
});
test("throwing original fork releases absent-child slot without revoking borrowed broker", async () => {
  const f = fixture();
  f.broker.close = jest.fn();
  f.platform.spawnUtility.mockImplementationOnce(() => {
    throw Error("fork refused");
  });
  const task = f.start();
  expect(await task.closed).toMatchObject({
    code: "RAILGUN_PROCESS_FAILED",
    exitCode: null,
  });
  expect(f.broker.close).not.toHaveBeenCalled();
  const next = f.start();
  next.close();
  f.children[0].emit("exit", 15);
  await next.closed;
});
test.each([
  "wrong-purpose",
  "wrong-id",
  "wrong-method",
  "backing-store",
  "short-key",
])("%s binary reply refuses and wipes actual returned bytes", async (mode) => {
  const f = fixture(),
    task = f.start(),
    child = f.children[0],
    port = f.channels[0].port1;
  const bytes =
    mode === "backing-store"
      ? new Uint8Array(new ArrayBuffer(64), 16, 32)
      : new Uint8Array(mode === "short-key" ? 31 : 32);
  bytes.fill(7);
  f.broker.dispatch.mockResolvedValue(bytes);
  child.emit("spawn");
  port.emit("message", {
    data: JSON.stringify({
      type: "command",
      wire: JSON.stringify({
        id: mode === "wrong-id" ? 2 : 1,
        method: mode === "wrong-method" ? "read" : "key",
        purpose: mode === "wrong-purpose" ? "spending-sign" : "relay-sign",
      }),
    }),
  });
  await Promise.resolve();
  expect(port.postMessage).not.toHaveBeenCalled();
  expect(bytes.every((n) => n === 0)).toBe(true);
  expect(task.getStatus().code).toBe("RAILGUN_PROCESS_FAILED");
  child.emit("exit", 15);
  await task.closed;
});

test.each(names)('only fixed eligibility permits one %s binary reply', async (job) => {
  const keyed = [
    'spending-public', 'viewing-identity', 'spending-sign', 'relay-sign',
    'wallet-viewing', 'private-prepare', 'private-operate', 'private-recover',
    'private-receive', 'relay-pre-poi', 'relay-prove-local', 'relay-prepare',
    'relay-reconstruct', 'poi-prove', 'poi-transact-selector', 'poi-output-recover', 'shield-receive',
  ].includes(job);
  const f = fixture(job), task = f.start(), child = f.children[0], port = f.channels[0].port1;
  const bytes = new Uint8Array(32).fill(6);
  f.broker.dispatch.mockResolvedValue(bytes);
  child.emit('spawn');
  port.emit('message', { data: JSON.stringify({ type: 'command', wire: JSON.stringify({
    id: 1, method: 'key', purpose: f.subject.operation,
  }) }) });
  await Promise.resolve();
  expect(port.postMessage).toHaveBeenCalledTimes(keyed ? 1 : 0);
  expect(bytes.every((n) => n === 0)).toBe(true);
  expect(task.getStatus().code).toBe(keyed ? null : 'RAILGUN_PROCESS_FAILED');
  task.close(); child.emit('exit', 15); await task.closed;
});
