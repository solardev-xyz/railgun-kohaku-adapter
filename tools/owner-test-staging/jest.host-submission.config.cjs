module.exports = {
  "rootDir": "../..",
  "transform": {},
  "maxWorkers": 2,
  "workerIdleMemoryLimit": "256MB",
  "testMatch": [
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-submission-boundaries.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-submission-diagnostic.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-submission-recovered.test.js"
  ]
};
