/** Historical host data composition; retained-format support is internal. */
const { createOwnPoiShapeData } = require("./railgun-own-poi-shape-data-core");
module.exports = createOwnPoiShapeData(require("./railgun-private-capsule"));
