module.exports = {
  "rootDir": "../..",
  "transform": {},
  "maxWorkers": 2,
  "workerIdleMemoryLimit": "256MB",
  "testMatch": [
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-own-poi-checks.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-own-transact-poi-membership.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-paged-store.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-poi-transact-selector.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-shield-intent.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-shield-receipt.test.js"
  ]
};
