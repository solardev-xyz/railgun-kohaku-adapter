import { createRequire } from "node:module";
import assert from "node:assert/strict";
import * as esm from "@freedom/railgun-kohaku-adapter/data";
const require = createRequire(import.meta.url);
const cjs = require("@freedom/railgun-kohaku-adapter/data");
const { vectors } = require("../fixtures/private-capsule-vectors.json");
for (const name of Object.keys(cjs)) assert.equal(cjs[name], esm[name]);
for (const vector of vectors) {
  assert.equal(
    JSON.stringify(cjs.normalizeRailgunPrivateCapsule(vector.input)),
    vector.canonical,
  );
  assert.equal(esm.digestRailgunPrivateCapsule(vector.input), vector.digest);
}
assert.throws(() => require("@freedom/railgun-kohaku-adapter/src/data"), {
  code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
});
assert.equal(
  Object.keys(require.cache).some((file) => file.includes("/src/main/")),
  false,
);
console.log(
  JSON.stringify({
    vectors: vectors.length,
    sameFunctions: true,
    internalExportRefused: true,
  }),
);
