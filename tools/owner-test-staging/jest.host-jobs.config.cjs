module.exports = {
  "rootDir": "../..",
  "transform": {},
  "maxWorkers": 2,
  "workerIdleMemoryLimit": "256MB",
  "testMatch": [
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-poi-output-recover-job.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-poi-transact-selector-job.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-txid-job.test.js"
  ]
};
