/** @type {import('jest').Config} */
module.exports = {
  testMatch: [
    '<rootDir>/test/**/*.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-relay-wire/policy.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-relay-wire/recipe.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-relay-keys/recipe.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-restart-counts.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-restart-data.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-second-cold-counts.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-second-handoff.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-second-recovery-data.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-second-sign-counts.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-public-cold-counts.test.js',
    ...require('./tools/owner-test-staging/jest.closed.config.cjs').testMatch,
    ...require('./tools/owner-test-staging/jest.context.config.cjs').testMatch,
  ],
  // The package ships byte-exact CommonJS sources with no build step, so the
  // tests run those exact bytes rather than a transpiled copy.
  transform: {},
};
