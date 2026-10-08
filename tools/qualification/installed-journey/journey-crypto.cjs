/** Promise client for the harness crypto worker (pinned engine source tree). */
'use strict';
const { Worker } = require('worker_threads');
const path = require('path');
function createJourneyCrypto({ engineModules }) {
  const worker = new Worker(path.join(__dirname, 'journey-crypto-worker.cjs'), {
    workerData: { engineModules },
  });
  worker.unref();
  let next = 0,
    failed = null;
  const pending = new Map();
  worker.on('message', ({ id, value, error }) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) entry.reject(Object.assign(Error('Journey crypto refused: ' + error), { code: 'JOURNEY_CRYPTO_REFUSED' }));
    else entry.resolve(value);
  });
  worker.on('error', (error) => {
    failed = error;
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  });
  function call(op, args = {}) {
    if (failed) return Promise.reject(failed);
    const id = ++next;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, op, args });
    });
  }
  return Object.freeze({
    call,
    close: () => worker.terminate(),
  });
}
module.exports = { createJourneyCrypto };
