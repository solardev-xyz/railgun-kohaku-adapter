/** Historical host data composition; retained-format support is internal. */
const { createPoiShieldSelectorData } = require("./railgun-poi-shield-selector-data-core");
module.exports = createPoiShieldSelectorData(require("./railgun-private-capsule"));
