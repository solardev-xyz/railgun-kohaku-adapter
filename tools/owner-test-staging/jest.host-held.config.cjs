// Separate explicit conformance only. No runtime selector or global module path.
const path = require('path');
const input = require('../../docs/owners/test-staging/HELD-HOST-INPUTS.json');
require('./held-host-inputs.cjs').verifyHostInputs();
module.exports = {
  rootDir: '../..', transform: {}, maxWorkers: 2, workerIdleMemoryLimit: '256MB',
  setupFiles: ['<rootDir>/tools/owner-test-staging/held-host-setup.cjs'],
  testMatch: ['<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-submission-held.test.js'],
  moduleNameMapper: Object.fromEntries(Object.entries(input.aliases).map(([alias, name]) => [
    '^' + alias + '$', path.join(input.hostRoot, name),
  ])),
};
