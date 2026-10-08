module.exports = {
  "rootDir": "../..",
  "transform": {},
  "maxWorkers": 2,
  "workerIdleMemoryLimit": "256MB",
  "testMatch": [
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-account-public.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-account-txid.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-relay-operation-cold.test.js"
  ]
};
