/** Fixed boolean-only selector diagnostic. The shared composition owns the
 * complete lifetime; no caller observation, continuation or authority override. */
const { deriveRailgunOwnTransactPoiSelectorDiagnostic } = require("./railgun-own-poi-membership.js");
exports.deriveRailgunOwnTransactPoiSelector = (options) =>
  deriveRailgunOwnTransactPoiSelectorDiagnostic(options);
