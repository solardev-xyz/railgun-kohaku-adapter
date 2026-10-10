/** Historical host data composition; retained-format support is internal. */
const { LEGACY_MAX } = require("../amount-bounds");
const { createPrivatePreparation } = require("./railgun-private-preparation-core");
module.exports = createPrivatePreparation(LEGACY_MAX, require("./railgun-private-offer"), require("./railgun-private-intent"));
