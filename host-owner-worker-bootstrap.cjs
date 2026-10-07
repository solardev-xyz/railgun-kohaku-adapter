/** Private fixed worker composition. Not exported or activated by this slice. */
'use strict';
const { isMainThread, parentPort, MessagePort } = require('worker_threads');
let installed = false;
function installRailgunStorageWorkerBootstrap(...args) {
  const marker = Symbol.for('@freedom/railgun-kohaku-adapter/owner-worker-bootstrap-v1');
  if (
    args.length ||
    installed ||
    isMainThread ||
    !(parentPort instanceof MessagePort) ||
    Object.hasOwn(globalThis, marker)
  )
    throw new Error('Railgun storage bootstrap unavailable');
  // Brand-check the original worker_threads endpoint before any binding load.
  MessagePort.prototype.hasRef.call(parentPort);
  installed = true;
  Object.defineProperty(globalThis, marker, { value: true, configurable: false });
  let initialized = false;
  return Object.freeze({
    initialize(...input) {
      if (initialized || input.length !== 1)
        throw new Error('Railgun storage bootstrap unavailable');
      initialized = true;
      require('./src/owners/worker-host-bindings').initializeRailgunWorkerHost(input[0]);
      require('./src/owners/railgun-session-worker-entry');
    },
  });
}
module.exports = { installRailgunStorageWorkerBootstrap };
