module.exports = {
  "rootDir": "../..",
  "transform": {},
  "maxWorkers": 2,
  "workerIdleMemoryLimit": "256MB",
  "testMatch": [
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-capsule-store.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-reservations.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-public-catalog.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-wallet-catalog.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-scan-journal.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-txid-journal.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-wallet-journal.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-recovery-history.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-relay-recovery-store.test.js",
    "<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-poi-intent-store.test.js"
  ]
};
