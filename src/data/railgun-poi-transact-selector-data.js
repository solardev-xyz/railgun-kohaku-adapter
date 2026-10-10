/** Historical host data composition; retained-format support is internal. */
const { createPoiTransactSelectorData } = require("./railgun-poi-transact-selector-data-core");
module.exports = createPoiTransactSelectorData(require("./railgun-private-capsule"));
