/** Trusted-host journal classification and retained outcome data only.
 * These original helpers do not authorize signing, resolve live owner receipts,
 * verify proofs, or release reservations. No owner bootstrap is required.
 */
const {
  railgunTransactJournalIntent,
  validRailgunTransactIntent,
} = require("./src/owners/railgun-transact-intent.js");
const {
  validRailgunTransactResolution,
  freezeRailgunTransactResolution,
} = require("./src/owners/railgun-transact-resolution.js");
const {
  shieldIntentBinding,
  validShieldIntent,
  isRailgunTarget,
} = require("./src/owners/railgun-shield-intent.js");
const {
  validRailgunShieldResolution,
  freezeRailgunShieldResolution,
} = require("./src/owners/railgun-shield-resolution.js");
module.exports = Object.freeze({
  railgunTransactJournalIntent,
  validRailgunTransactIntent,
  validRailgunTransactResolution,
  freezeRailgunTransactResolution,
  shieldIntentBinding,
  validShieldIntent,
  isRailgunTarget,
  validRailgunShieldResolution,
  freezeRailgunShieldResolution,
});
