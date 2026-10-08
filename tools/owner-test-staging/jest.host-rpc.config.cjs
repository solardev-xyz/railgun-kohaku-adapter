module.exports = {
  "rootDir": "../..",
  "transform": {},
  "maxWorkers": 2,
  "workerIdleMemoryLimit": "256MB",
  "testMatch": [
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-account-public-destination.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-scan-coordinator-completed.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-scan-source-completed.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-scan-source-destination.test.js"
  ]
};
