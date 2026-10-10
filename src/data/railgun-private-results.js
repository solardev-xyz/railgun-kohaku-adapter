/** Historical host data composition; retained-format support is internal. */
const { LEGACY_MAX } = require("../amount-bounds");
const { createPrivateResults } = require("./railgun-private-results-core");
module.exports = createPrivateResults(LEGACY_MAX, require("./railgun-private-intent"));
