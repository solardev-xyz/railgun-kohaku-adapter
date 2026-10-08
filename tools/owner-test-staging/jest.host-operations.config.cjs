module.exports = {
  "rootDir": "../..",
  "transform": {},
  "maxWorkers": 2,
  "workerIdleMemoryLimit": "256MB",
  "testMatch": [
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-operation.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-submission.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-poi-submission.test.js"
  ]
};
