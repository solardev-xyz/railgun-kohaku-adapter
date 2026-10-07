'use strict';
// Trusted main-only journal/submission bridge. These checks consult the original
// private owner registries; a data-shaped token never substitutes for a receipt.
const { assertRailgunOwnerHost } = require('./src/owners/host-bindings');
module.exports = Object.freeze({
  assertRailgunPrivateSubmission(...args) {
    assertRailgunOwnerHost();
    return require('./src/owners/railgun-private-submission').assertRailgunPrivateSubmission(
      ...args,
    );
  },
  assertRailgunShieldSubmission(...args) {
    assertRailgunOwnerHost();
    return require('./src/owners/railgun-shield-operation').assertRailgunShieldSubmission(
      ...args,
    );
  },
  assertRailgunTransactResolution(...args) {
    assertRailgunOwnerHost();
    return require('./src/owners/railgun-transact-recovery').assertRailgunTransactResolution(
      ...args,
    );
  },
  assertRailgunShieldResolution(...args) {
    assertRailgunOwnerHost();
    return require('./src/owners/railgun-shield-recovery').assertRailgunShieldResolution(
      ...args,
    );
  },
  authorizeRailgunTransactResolution(...args) {
    assertRailgunOwnerHost();
    return require('./src/owners/railgun-transact-recovery').authorizeRailgunResolution(
      ...args,
    );
  },
  authorizeRailgunShieldResolution(...args) {
    assertRailgunOwnerHost();
    return require('./src/owners/railgun-shield-recovery').authorizeRailgunResolution(
      ...args,
    );
  },
});
