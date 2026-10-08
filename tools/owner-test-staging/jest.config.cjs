/** Explicit unchanged-assertion package-only subset. Remaining tests are staged, not skipped. */
module.exports = {
  rootDir: '../..',
  transform: {},
  testMatch: [
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-relay-witness.test.js',
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-reservation-ledger.test.js',
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-relay-review-summary.test.js',
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-private-creator.test.js',
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-txid-coverage.test.js',
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-wallet-storage.test.js',
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-event-projector.test.js',
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-wallet-read.test.js',
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-wallet-coverage.test.js',
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-account-phase.test.js',
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-wallet-state.test.js',
    '<rootDir>/tools/owner-test-staging/tests/src/main/wallet/railgun-recovery-finality.test.js',
  ],
};
