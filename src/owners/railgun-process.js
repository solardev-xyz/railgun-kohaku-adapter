/** Main-owned persistent Electron utility session. No renderer channel. The
 * caller selects a closed job enum and minimum non-spending JSON input.
 * Only the dedicated identity and vault-bound viewing-wallet entries can
 * receive one binary key response. Other runtime entries cannot opt in.
 * A supplied host broker is borrowed for this job; its owner retains storage
 * lifetime and must drain its own dispatches. It is mutually exclusive with
 * process-owned storage/provider sessions.
 * Ready means initialization completed, never a balance/proof result. RSS limits
 * are sampled soft limits; these JavaScript processes are not an OS sandbox.
 */
const { types } = require('util');
const { getPrivacyContext } = require('./context-bindings');
const { platform } = require('./host-bindings');
const { createRailgunSession } = require('./railgun-session.js');
const { startRailgunSessionWorker } = require('./railgun-session-worker.js');
const { getProcessJob, admitsProcessJob } = require('./process-jobs');
const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
const listen = EventTarget.prototype.addEventListener;
const unlisten = EventTarget.prototype.removeEventListener;
function abortedSignal(signal) {
  if (
    types.isProxy(signal) ||
    Object.getPrototypeOf(signal) !== AbortSignal.prototype ||
    Object.hasOwn(signal, 'aborted') ||
    Object.hasOwn(signal, 'reason')
  )
    throw fail('RAILGUN_PROCESS_INVALID');
  return abortedGetter.call(signal);
}
const owners = new Set();
const fail = (code) => Object.assign(new Error('Railgun process unavailable'), { code });
function startRailgunProcess(options) {
  const {
    handle,
    executionJob,
    input,
    storage,
    createProvider,
    broker,
    storageWorker = false,
    startupMs = 30000,
    lifetimeMs = 600000,
    heapMb = 256,
    rssMb = 768,
  } = options;
  const context = getPrivacyContext(handle);
  const specification = getProcessJob(executionJob);
  const application = platform.applicationLifetime();
  const binaryKey = specification?.key;
  if (
    !specification ||
    Object.hasOwn(options, 'filename') ||
    Object.hasOwn(options, 'binaryKey') ||
    !admitsProcessJob(executionJob, context.subject) ||
    abortedSignal(application) ||
    abortedSignal(context.signal) ||
    typeof input !== 'string' ||
    Buffer.byteLength(input) > 65536 ||
    typeof storageWorker !== 'boolean' ||
    !broker ||
    typeof broker.dispatch !== 'function' ||
    abortedSignal(broker.signal) ||
    storage !== undefined ||
    createProvider !== undefined ||
    storageWorker ||
    !Number.isInteger(startupMs) ||
    startupMs < 1 ||
    startupMs > 120000 ||
    !Number.isInteger(lifetimeMs) ||
    lifetimeMs < startupMs ||
    lifetimeMs > 1800000 ||
    !Number.isInteger(heapMb) ||
    heapMb < 16 ||
    heapMb > 1024 ||
    !Number.isInteger(rssMb) ||
    rssMb < 64 ||
    rssMb > 2048
  )
    throw fail('RAILGUN_PROCESS_INVALID');
  const owner = JSON.stringify([context.profileId, context.generation, context.subject]);
  if (owners.size >= 2 || owners.has(owner)) throw fail('RAILGUN_PROCESS_BUSY');
  owners.add(owner);
  const controller = new AbortController();
  let child,
    channel,
    session,
    exited = false,
    stopping = false,
    spawned = false,
    cause,
    escalation,
    startup,
    deadline,
    memoryPoll,
    peakRssBytes = 0,
    missingMetrics = 0,
    binaryKeyUsed = false,
    readySeen = false,
    brokerReady = !storageWorker,
    readyDelivered = false,
    escalated = false,
    peerDisconnected = false,
    resolveReady,
    rejectReady,
    resolveClosed;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // A caller may immediately close and await closed only. Keep readiness failure
  // observed internally without changing what awaiting ready reports.
  ready.catch(() => {});
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  function terminate() {
    if (exited || !child?.pid) return;
    const pid = child.pid;
    try {
      // Electron kill() also schedules Chromium termination/reaping. On POSIX
      // send TERM ourselves so our bounded grace interval owns escalation.
      platform.terminateUtility(child, 'SIGTERM');
    } catch {
      /* Escalation and observed exit remain authoritative. */
    }
    if (exited) return;
    escalation ||= setTimeout(() => {
      if (!exited && child.pid === pid) {
        escalated = true;
        try {
          platform.terminateUtility(child, 'SIGKILL');
        } catch {
          /* Never release a living process slot. */
        }
      }
    }, 250);
  }
  function stop(code = 'RAILGUN_PROCESS_CLOSED') {
    if (exited || stopping) return;
    cause ||= code;
    stopping = true;
    controller.abort();
    if (!readyDelivered) rejectReady(fail(cause));
    if (!broker) session?.close();
    closePorts();
    terminate();
  }
  function closePorts() {
    for (const port of [channel?.port1, channel?.port2]) {
      try {
        port?.close();
      } catch {
        /* A transferred endpoint may already be detached. */
      }
    }
  }
  const aborted = () => {
    if (abortedGetter.call(context.signal)) stop('PRIVACY_CONTEXT_REVOKED');
  };
  const quit = () => {
    if (abortedGetter.call(application)) stop('RAILGUN_PROCESS_CLOSED');
  };
  const brokerAborted = () => {
    if (abortedGetter.call(broker.signal)) stop('RAILGUN_SESSION_REVOKED');
  };
  function finish(exitCode = null) {
    if (exited) return;
    exited = true;
    controller.abort();
    cause ||= 'RAILGUN_PROCESS_EXITED';
    if (!broker) session?.close();
    closePorts();
    clearTimeout(escalation);
    clearTimeout(startup);
    clearTimeout(deadline);
    clearInterval(memoryPoll);
    unlisten.call(context.signal, 'abort', aborted);
    unlisten.call(broker.signal, 'abort', brokerAborted);
    unlisten.call(application, 'abort', quit);
    if (!readyDelivered) rejectReady(fail(cause));
    const release = () => {
      owners.delete(owner);
      resolveClosed(
        Object.freeze({ code: cause, peakRssBytes, exitCode, escalated, peerDisconnected })
      );
    };
    // A stopped engine cannot release a database still owned by its host worker.
    if (!broker && session?.closed) session.closed.then(release);
    else release();
  }
  function sampleMemory() {
    if (!spawned || exited || stopping) return;
    try {
      getPrivacyContext(handle);
      const value = platform.memorySamples().find((entry) => entry.pid === child.pid)
        ?.memory?.workingSetSize;
      if (!Number.isFinite(value) || value <= 0) {
        if (++missingMetrics >= 20) stop('RAILGUN_PROCESS_MEMORY_UNAVAILABLE');
        return;
      }
      missingMetrics = 0;
      peakRssBytes = Math.max(peakRssBytes, value * 1024);
      if (peakRssBytes > rssMb * 1024 * 1024) {
        stop('RAILGUN_PROCESS_MEMORY_LIMIT');
        return;
      }
      if (readySeen && brokerReady && !readyDelivered) {
        readyDelivered = true;
        clearTimeout(startup);
        resolveReady();
      }
    } catch {
      stop('RAILGUN_PROCESS_MEMORY_UNAVAILABLE');
    }
  }
  try {
    const createSession = storageWorker ? startRailgunSessionWorker : createRailgunSession;
    session = broker
      ? Object.freeze({ dispatch: broker.dispatch.bind(broker), signal: broker.signal })
      : createSession({
          handle,
          storage,
          createProvider,
          onClose: () =>
            stop(context.signal.aborted ? 'PRIVACY_CONTEXT_REVOKED' : 'RAILGUN_SESSION_REVOKED'),
        });
    if (storageWorker)
      session.ready.then(
        () => {
          if (stopping || exited) return;
          brokerReady = true;
          sampleMemory();
        },
        () => stop('RAILGUN_SESSION_REVOKED')
      );
    listen.call(context.signal, 'abort', aborted);
    listen.call(broker.signal, 'abort', brokerAborted);
    listen.call(application, 'abort', quit);
    if (
      abortedSignal(application) ||
      context.signal.aborted ||
      session.signal.aborted ||
      stopping
    ) {
      stop(context.signal.aborted ? 'PRIVACY_CONTEXT_REVOKED' : 'RAILGUN_SESSION_REVOKED');
      finish();
    } else {
      channel = platform.createUtilityChannel();
      getPrivacyContext(handle);
      if (stopping || abortedGetter.call(application) || abortedGetter.call(session.signal))
        throw fail('RAILGUN_PROCESS_CLOSED');
      child = platform.spawnUtility({ entry: 'railgun-utility-v1', heapMb });
      child.once('exit', finish);
      child.once('error', () => stop('RAILGUN_PROCESS_FAILED'));
      child.once('spawn', () => {
        spawned = true;
        if (stopping || session.signal.aborted) {
          terminate();
          return;
        }
        try {
          getPrivacyContext(handle);
          child.postMessage(JSON.stringify({ type: 'init', job: executionJob, input }), [
            channel.port2,
          ]);
          sampleMemory();
        } catch {
          stop('RAILGUN_PROCESS_FAILED');
        }
      });
      // All commands belong to this single transferred channel. ParentPort is
      // initialization-only and never provides a second authority path.
      child.on('message', () => stop('RAILGUN_PROCESS_FAILED'));
      channel.port1.on('close', () => {
        if (!stopping && !exited) peerDisconnected = true;
        stop('RAILGUN_PROCESS_CHANNEL_CLOSED');
      });
      channel.port1.on('message', ({ data: wire, ports = [] }) => {
        if (stopping || exited) return;
        try {
          getPrivacyContext(handle);
          if (
            !spawned ||
            ports.length ||
            typeof wire !== 'string' ||
            wire.length > 4 * 1024 * 1024 + 128 ||
            Buffer.byteLength(wire) > 4 * 1024 * 1024 + 128
          )
            throw new Error();
          const message = JSON.parse(wire);
          if (
            message?.type === 'failure' &&
            Object.keys(message).length === 2 &&
            ['egress', 'job', 'protocol'].includes(message.reason)
          ) {
            stop(
              message.reason === 'egress'
                ? 'RAILGUN_PROCESS_EGRESS_REFUSED'
                : 'RAILGUN_PROCESS_FAILED'
            );
            return;
          }
          if (message?.type === 'ready' && Object.keys(message).length === 1 && !readySeen) {
            readySeen = true;
            sampleMemory();
            return;
          }
          if (
            message?.type !== 'command' ||
            Object.keys(message).length !== 2 ||
            typeof message.wire !== 'string'
          )
            throw new Error();
          // Do not await, enqueue, or schedule before dispatch. Its arrival order
          // establishes storage ordering and reserves the host request slot.
          session.dispatch(message.wire).then(
            (reply) => {
              const bytes = reply instanceof Uint8Array;
              try {
                if (stopping || exited || session.signal.aborted) return;
                getPrivacyContext(handle);
                if (bytes) {
                  const request = JSON.parse(message.wire);
                  if (
                    !binaryKey ||
                    binaryKeyUsed ||
                    reply.byteLength !== 32 ||
                    reply.byteOffset !== 0 ||
                    reply.buffer.byteLength !== 32 ||
                    !(reply.buffer instanceof ArrayBuffer) ||
                    request.id !== 1 ||
                    request.method !== 'key' ||
                    request.purpose !== context.subject.operation
                  )
                    throw new Error();
                  binaryKeyUsed = true;
                  // Electron MessagePortMain supports transferable ports, not
                  // transferable ArrayBuffers. Structured clone avoids immutable
                  // hex/JSON key strings; wipe owned buffers after the copy.
                  channel.port1.postMessage({ type: 'key-reply', id: 1, bytes: reply });
                } else {
                  if (typeof reply !== 'string') throw new Error();
                  channel.port1.postMessage(JSON.stringify({ type: 'reply', wire: reply }));
                }
              } catch {
                stop('RAILGUN_PROCESS_FAILED');
              } finally {
                if (bytes) reply.fill(0);
              }
            },
            () => stop('RAILGUN_SESSION_REVOKED')
          );
        } catch {
          stop('RAILGUN_PROCESS_FAILED');
        }
      });
      channel.port1.start();
      startup = setTimeout(
        () => stop(spawned ? 'RAILGUN_PROCESS_STARTUP_TIMEOUT' : 'RAILGUN_PROCESS_SPAWN_TIMEOUT'),
        startupMs
      );
      deadline = setTimeout(() => stop('RAILGUN_PROCESS_LIFETIME'), lifetimeMs);
      memoryPoll = setInterval(sampleMemory, 250);
    }
  } catch {
    stop('RAILGUN_PROCESS_FAILED');
    if (!child) finish();
  }
  return Object.freeze({
    ready,
    closed,
    close: () => stop(),
    signal: controller.signal,
    getStatus: () =>
      Object.freeze({
        phase: exited ? 'exited' : stopping ? 'stopping' : spawned ? 'running' : 'starting',
        code: cause ?? null,
        peakRssBytes,
      }),
  });
}
module.exports = { startRailgunProcess };
