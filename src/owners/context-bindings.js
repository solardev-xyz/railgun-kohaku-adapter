/** Fixed realm selection, not caller-selectable host routing. Workers never load
 * the main owner binding module; utility contexts use the existing guarded
 * execution binding. Actual host initialization must precede protocol loading.
 */
"use strict";
const { isMainThread } = require("worker_threads");
if (!isMainThread) {
  module.exports = require("./worker-host-bindings").context;
} else if (process.type === "utility") {
  const {
    getPrivacyContext,
    createPrivacyScope,
  } = require("../execution/host-bindings");
  module.exports = Object.freeze({ getPrivacyContext, createPrivacyScope });
} else {
  module.exports = require("./host-bindings").context;
}
