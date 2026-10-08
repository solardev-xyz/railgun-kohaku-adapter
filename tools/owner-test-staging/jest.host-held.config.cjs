// Separate explicit conformance only. No runtime selector or global module path.
const { hostModuleAliases } = require('./held-host-inputs.cjs');
module.exports = {
  rootDir: '../..', transform: {}, maxWorkers: 2, workerIdleMemoryLimit: '256MB',
  modulePathIgnorePatterns: ['<rootDir>/tools/freedom-legacy-qualification/'],
  setupFiles: ['<rootDir>/tools/owner-test-staging/held-host-setup.cjs'],
  testMatch: ['<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-submission-held.test.js'],
  moduleNameMapper: hostModuleAliases(),
};
