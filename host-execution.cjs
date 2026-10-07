'use strict';
// Trusted host integration, never a renderer/RPC surface or a key authority.
module.exports = Object.freeze({
  initializeRailgunExecutionHost: require('./src/execution/host-bindings')
    .initializeRailgunExecutionHost,
  getRailgunExecutionJob: require('./src/execution/job-locations').getRailgunExecutionJob,
});
