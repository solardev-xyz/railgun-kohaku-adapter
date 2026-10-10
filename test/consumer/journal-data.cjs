const assert = require("assert/strict");
const path = require("path");
const Module = require("module");
const { pathToFileURL } = require("url");
const root = path.resolve(__dirname, "../..");
const allowed = new Set([
  "src/deployment.js",
  "src/amount-bounds.js",
  "src/data/railgun-private-policy-core.js",
  "src/data/railgun-private-intent-core.js",
  "src/owners/railgun-transact-intent.js",
  "src/owners/railgun-transact-resolution.js",
  "src/owners/railgun-transact-receipt-policy.js",
  "src/owners/railgun-shield-intent.js",
  "src/owners/railgun-shield-resolution.js",
  "src/owners/railgun-shield-policy.js",
  "src/data/railgun-private-policy.js",
  "src/data/railgun-private-intent.js",
  "src/railgun-shield-pins.json",
]);
const load = Module._load;
Module._load = function (request, parent, isMain) {
  const filename = Module._resolveFilename(request, parent, isMain);
  const relative = path.relative(root, filename);
  if (relative.startsWith("src/") || relative.startsWith("host-")) {
    assert.ok(
      allowed.has(relative) || relative === "host-journal-data.cjs",
      `unexpected owner/bootstrap/runtime import: ${relative}`,
    );
  }
  return Reflect.apply(load, this, arguments);
};
(async () => {
  try {
    const cjs = require("../../host-journal-data.cjs");
    const esm = await import(
      pathToFileURL(path.join(root, "host-journal-data.mjs"))
    );
    assert.equal(Object.keys(cjs).length, 9);
    assert.deepEqual(Object.keys(esm).sort(), Object.keys(cjs).sort());
    assert.equal(Object.isFrozen(cjs), true);
    for (const filename of [
      "railgun-transact-intent",
      "railgun-transact-resolution",
      "railgun-shield-intent",
      "railgun-shield-resolution",
    ]) {
      const canonical = require(
        path.join(root, "src/owners", filename + ".js"),
      );
      for (const key of Object.keys(canonical)) {
        if (Object.hasOwn(cjs, key)) assert.equal(cjs[key], canonical[key]);
      }
    }
    for (const key of Object.keys(cjs)) assert.equal(esm[key], cjs[key]);
    // Ordinary EOA targets can be classified before any owner bootstrap exists.
    assert.equal(cjs.isRailgunTarget("0x" + "12".repeat(20)), false);
    assert.equal(cjs.validRailgunTransactIntent({ kind: "ordinary" }), false);
    for (const filename of Object.keys(require.cache)) {
      const relative = path.relative(root, filename);
      if (relative.startsWith("src/"))
        assert.ok(allowed.has(relative), relative);
    }
    process.stdout.write(
      JSON.stringify({ exports: 9, bootstrapInitialized: false }),
    );
  } finally {
    Module._load = load;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
