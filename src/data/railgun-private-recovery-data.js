/** Historical host data composition; retained-format support is internal. */
const { LEGACY_MAX } = require("../amount-bounds");
const { createPrivateRecoveryData } = require("./railgun-private-recovery-data-core");
module.exports = createPrivateRecoveryData(LEGACY_MAX, require("./railgun-private-capsule"), require("./railgun-private-preparation"));
