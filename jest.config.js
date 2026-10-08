/** @type {import('jest').Config} */
module.exports = {
  testMatch: [
    '<rootDir>/test/**/*.test.js',
    ...require('./tools/owner-test-staging/jest.closed.config.cjs').testMatch,
    ...require('./tools/owner-test-staging/jest.context.config.cjs').testMatch,
  ],
  // The package ships byte-exact CommonJS sources with no build step, so the
  // tests run those exact bytes rather than a transpiled copy.
  transform: {},
};
