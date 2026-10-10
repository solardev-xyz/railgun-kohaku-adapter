/** Historical host/data contract: legacy formats and amounts only. */
const { createPrivateCapsule } = require("./railgun-private-capsule-core");
module.exports = createPrivateCapsule(
  require("./railgun-private-offer"),
  (_value, partial) => partial ? 2 : 1,
);
