/** Historical host/data contract: legacy formats and amounts only. */
const { createPrivateOffer } = require("./railgun-private-offer-core");
const { LEGACY_MAX } = require("../amount-bounds");
module.exports = createPrivateOffer(LEGACY_MAX, require("./railgun-private-intent"));
