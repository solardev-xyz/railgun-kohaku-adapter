/** Historical host/data contract: legacy formats and amounts only. */
const { createPrivatePolicy } = require("./railgun-private-policy-core");
const { LEGACY_MAX } = require("../amount-bounds");
module.exports = createPrivatePolicy(LEGACY_MAX);
