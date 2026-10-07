/** Electron utility only. The host entry must require this before other package
 * or host service modules. Guard installation precedes host binding and every
 * fixed job import. This keeps the original one-key protocol and failure flow.
 */
'use strict';
let installed = false;
function installRailgunExecutionBootstrap() {
  const key = Symbol.for('@freedom/railgun-kohaku-adapter/execution-bootstrap-v1');
  if (
    arguments.length ||
    installed ||
    Object.hasOwn(globalThis, key) ||
    !process.versions.electron ||
    process.type !== 'utility' ||
    !process.parentPort
  )
    throw new Error('Railgun execution bootstrap unavailable');
  installed = true;
  Object.defineProperty(globalThis, key, { value: true, configurable: false });
  let bound = false;
  for (const key of Object.keys(process.env)) delete process.env[key];
  // ws is imported transitively by the pinned engine, but these compute jobs
  // never use its transports. Keep its optional helpers on their JS fallback;
  // the guards below refuse all normal Node native-addon loading.
  process.env.WS_NO_BUFFER_UTIL = '1';
  process.env.WS_NO_UTF_8_VALIDATE = '1';
  const parent = process.parentPort;
  const pending = new Map();
  const controller = new AbortController();
  let initialized = false,
    stopped = false,
    port;
  function fail(reason = 'protocol') {
    if (stopped) return;
    stopped = true;
    controller.abort();
    for (const task of pending.values()) task.reject(new Error('Railgun session unavailable'));
    pending.clear();
    if (!port) {
      process.exit(1);
      return;
    }
    // Failure and close use one ordered channel. Reasons contain no job/network
    // diagnostics and never compete with a separate parentPort notification.
    try {
      port.postMessage(JSON.stringify({ type: 'failure', reason }));
    } finally {
      port.close();
    }
  }
  function receive({ data, ports = [] }) {
    if (stopped) return;
    try {
      if (data && typeof data === 'object' && data.type === 'key-reply') {
        const task = pending.get(data.id);
        if (
          ports.length ||
          Object.keys(data).sort().join(',') !== 'bytes,id,type' ||
          data.id !== 1 ||
          !task?.binary ||
          !(data.bytes instanceof Uint8Array) ||
          !(data.bytes.buffer instanceof ArrayBuffer) ||
          data.bytes.byteLength !== 32 ||
          data.bytes.byteOffset !== 0 ||
          data.bytes.buffer.byteLength !== 32
        )
          throw new Error();
        pending.delete(data.id);
        task.resolve(data.bytes);
        return;
      }
      if (
        ports.length ||
        typeof data !== 'string' ||
        data.length > 4 * 1024 * 1024 + 128 ||
        Buffer.byteLength(data) > 4 * 1024 * 1024 + 128
      )
        throw new Error();
      const message = JSON.parse(data);
      if (
        !message ||
        Object.keys(message).length !== 2 ||
        message.type !== 'reply' ||
        typeof message.wire !== 'string' ||
        Buffer.byteLength(message.wire) > 2 * 1024 * 1024
      )
        throw new Error();
      const id = JSON.parse(message.wire).id,
        task = pending.get(id);
      if (!task || task.binary) throw new Error();
      pending.delete(id);
      task.resolve(message.wire);
    } catch {
      fail();
    }
  }
  const guard = require('./src/execution/railgun-process-guards').installRailgunProcessGuards({
    electronNet: require('electron').net,
    onRefusal: () => fail('egress'),
  });
  function initialize(bindings) {
    if (bound || stopped) throw new Error('Railgun execution bootstrap unavailable');
    bound = true;
    try {
      require('./src/execution/host-bindings').initializeRailgunExecutionHost(bindings);
    } catch {
      fail('job');
      throw new Error('Railgun execution bootstrap unavailable');
    }
    parent.on('message', ({ data, ports = [] }) => {
      try {
        if (
          initialized ||
          stopped ||
          ports.length !== 1 ||
          typeof data !== 'string' ||
          Buffer.byteLength(data) > 132000
        )
          throw new Error();
        const message = JSON.parse(data);
        if (
          !message ||
          Object.keys(message).length !== 3 ||
          message.type !== 'init' ||
          typeof message.job !== 'string' ||
          typeof message.input !== 'string' ||
          Buffer.byteLength(message.input) > 65536
        )
          throw new Error();
        initialized = true;
        port = ports[0];
        port.on('message', receive);
        port.on('close', () => {
          stopped = true;
          controller.abort();
          for (const task of pending.values())
            task.reject(new Error('Railgun session unavailable'));
          pending.clear();
          process.exit(1);
        });
        port.start();
        let job;
        try {
          if (
            ['spending-public', 'viewing-identity'].includes(message.job) &&
            JSON.parse(message.input)?.purpose !== message.job
          )
            throw new Error('Railgun identity purpose unavailable');
          switch (message.job) {
            case 'spending-public':
            case 'viewing-identity':
              job = require('./src/execution/railgun-identity-job');
              break;
            case 'spending-sign':
              job = require('./src/execution/railgun-spend-sign-job');
              break;
            case 'wallet-viewing':
              job = require('./src/execution/railgun-wallet-job');
              break;
            case 'private-prepare':
              job = require('./src/execution/railgun-private-prepare-job');
              break;
            case 'private-operate':
              job = require('./src/execution/railgun-private-operate-job');
              break;
            case 'private-recover':
              job = require('./src/execution/railgun-private-recover-job');
              break;
            case 'private-receive':
              job = require('./src/execution/railgun-private-receive-job');
              break;
            case 'private-verify':
              job = require('./src/execution/railgun-private-verify-job');
              break;
            default:
              throw new Error('Railgun execution job unavailable');
          }
        } catch {
          fail('job');
          return;
        }
        const request = (wire, binary = false) => {
          if (
            controller.signal.aborted ||
            typeof wire !== 'string' ||
            Buffer.byteLength(wire) > 2 * 1024 * 1024 ||
            pending.size >= 8
          )
            return Promise.reject(new Error('Railgun session unavailable'));
          const id = JSON.parse(wire).id;
          if (!Number.isSafeInteger(id) || id < 1 || pending.has(id))
            return Promise.reject(new Error('Railgun session unavailable'));
          return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject, binary });
            port.postMessage(JSON.stringify({ type: 'command', wire }));
          });
        };
        Promise.resolve()
          .then(() =>
            job.run(message.input, {
              request: (wire) => request(wire),
              requestKey:
                message.job === 'private-verify'
                  ? () => Promise.reject(new Error('Railgun session unavailable'))
                  : (wire) => request(wire, true),
              signal: controller.signal,
              guardReport: guard.report,
              close: () => port.close(),
            })
          )
          .then(
            () => {
              if (!stopped) port.postMessage(JSON.stringify({ type: 'ready' }));
            },
            () => fail('job')
          );
      } catch {
        fail();
      }
    });
  }
  return Object.freeze({ initialize });
}
module.exports = { installRailgunExecutionBootstrap };
