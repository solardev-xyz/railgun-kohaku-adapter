module.exports = {
  "rootDir": "../..",
  "transform": {},
  "maxWorkers": 2,
  "workerIdleMemoryLimit": "256MB",
  "testMatch": [
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-own-receipt-destination.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-shield-operation.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-shield-recovery.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-transact-recovery.test.js"
  ]
};
