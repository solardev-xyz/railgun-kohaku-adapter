'use strict';
const { spawn: originalSpawn } = require('child_process');
/** Retain one original process through close, including spawn/record failures. */
async function ownProcess(
  command,
  options,
  { spawn = originalSpawn, timeoutMs = 900000, graceMs = 10000, record = () => {} } = {}
) {
  let child, timer, escalator, finalTimer, failure;
  const state = {
    pid: null,
    exitObserved: false,
    closeObserved: false,
    code: null,
    signal: null,
    timedOut: false,
    interrupted: false,
    terminateRequested: false,
    killRequested: false,
    natural: false,
  };
  const update = () => {
    try {
      record({ ...state });
    } catch (error) {
      failure ||= error;
      stop();
    }
  };
  function stop() {
    if (!child || state.closeObserved || state.terminateRequested) return;
    state.terminateRequested = true;
    try {
      child.kill('SIGTERM');
    } catch (error) {
      failure ||= error;
    }
    escalator = setTimeout(() => {
      if (state.closeObserved) return;
      state.killRequested = true;
      try {
        child.kill('SIGKILL');
      } catch (error) {
        failure ||= error;
      }
    }, graceMs);
  }
  const interrupt = () => {
    state.interrupted = true;
    failure ||= Error('Outer interrupted');
    stop();
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    child = spawn(command[0], command.slice(1), options);
    const closed = new Promise((resolve, reject) => {
      child.once('error', (error) => {
        failure ||= error;
        stop();
      });
      child.once('exit', (code, signal) => {
        state.exitObserved = true;
        state.code = code;
        state.signal = signal;
      });
      child.once('close', (code, signal) => {
        state.closeObserved = true;
        state.code = code;
        state.signal = signal;
        state.natural =
          state.exitObserved &&
          !failure &&
          !state.timedOut &&
          !state.terminateRequested &&
          !state.killRequested;
        resolve();
      });
      finalTimer = setTimeout(
        () => {
          failure ||= Error('Original child close unobserved');
          stop();
          reject(failure);
        },
        timeoutMs + graceMs * 3
      );
    });
    state.pid = child.pid ?? null;
    timer = setTimeout(() => {
      state.timedOut = true;
      failure ||= Error('Original child deadline');
      stop();
    }, timeoutMs);
    update();
    await closed;
    update();
  } catch (error) {
    failure ||= error;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    clearTimeout(timer);
    clearTimeout(escalator);
    clearTimeout(finalTimer);
  }
  if (failure) Object.defineProperty(failure, 'processObservation', { value: { ...state } });
  if (failure) throw failure;
  return Object.freeze({ ...state });
}
module.exports = { ownProcess };
