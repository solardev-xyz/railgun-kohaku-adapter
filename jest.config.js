/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['<rootDir>/test/**/*.test.js'],
  // The package ships byte-exact CommonJS sources with no build step, so the
  // tests run those exact bytes rather than a transpiled copy.
  transform: {},
};
