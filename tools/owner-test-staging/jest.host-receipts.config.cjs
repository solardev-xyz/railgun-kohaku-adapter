module.exports = {
  "rootDir": "../..",
  "transform": {},
  "maxWorkers": 2,
  "workerIdleMemoryLimit": "256MB",
  "testMatch": [
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-own-operation.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-own-receipt.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-preflight.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-shield-preflight.test.js"
  ]
};
