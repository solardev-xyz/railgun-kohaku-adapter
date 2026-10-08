/** @type {import('jest').Config} */
module.exports = {
  testMatch: [
    '<rootDir>/test/**/*.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-relay-wire/policy.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-relay-wire/recipe.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-relay-keys/recipe.test.js',
  ],
  // The package ships byte-exact CommonJS sources with no build step, so the
  // tests run those exact bytes rather than a transpiled copy.
  transform: {},
};
