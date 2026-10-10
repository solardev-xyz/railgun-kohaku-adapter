/** Historical host/data contract: legacy formats and amounts only. */
const { createPrivateIntent } = require("./railgun-private-intent-core");
module.exports = createPrivateIntent(require("./railgun-private-policy"));
