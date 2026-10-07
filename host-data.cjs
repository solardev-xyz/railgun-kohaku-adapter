/** Trusted-host compatibility primitives; these may throw raw assertions.
 * Never call on untrusted objects or expose their errors in application reports.
 * These data checks grant no signing, spending, storage or network authority.
 */
module.exports = Object.freeze({
  ...require("./src/data/railgun-private-policy"),
  ...require("./src/data/railgun-private-intent"),
  ...require("./src/data/railgun-private-offer"),
  ...require("./src/data/railgun-private-capsule"),
  ...require("./src/data/railgun-private-destination"),
  ...require("./src/data/railgun-private-signature"),
  ...require("./src/data/railgun-private-preparation"),
  ...require("./src/data/railgun-private-results"),
  ...require("./src/data/railgun-private-recovery-data"),
});
