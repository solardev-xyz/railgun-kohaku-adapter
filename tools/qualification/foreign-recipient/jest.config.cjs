/** Repo-only real-engine fixture. No application, utility process or profile. */
const path = require('path');
module.exports = {
  rootDir: path.join(__dirname, '../../..'),
  testMatch: [
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-foreign-recipient-job.test.js',
  ],
  globalSetup: path.join(__dirname, 'preflight.cjs'),
  testTimeout: 60000,
  maxWorkers: 1,
  modulePathIgnorePatterns: ['<rootDir>/tools/freedom-legacy-qualification/'],
  transform: {},
};
