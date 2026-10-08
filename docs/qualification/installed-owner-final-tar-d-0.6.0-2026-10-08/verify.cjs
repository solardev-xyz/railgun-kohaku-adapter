"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { createHash } = require("crypto");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (name) => fs.readFileSync(path.join(__dirname, name));
const json = (name) => JSON.parse(read(name));
function safe(value) {
  if (typeof value === "string")
    assert.ok(
      !value.startsWith("/") &&
        !value.includes("/private/") &&
        !value.includes("/Users/") &&
        !value.includes("file://"),
    );
  else if (Array.isArray(value)) value.forEach(safe);
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      safe(key);
      safe(item);
    }
}
const manifest = json("MANIFEST.json");
for (const [name, pin] of Object.entries(manifest.files)) {
  assert.equal(path.basename(name), name);
  const bytes = read(name);
  assert.equal(bytes.length, pin.bytes);
  assert.equal(sha(bytes), pin.sha256);
  if (name.endsWith(".json")) safe(JSON.parse(bytes));
}
for (const [name, digest, contract] of [
  [
    "private",
    "4660b18d2b7f6f543988e72da1925ac29fc13806d63a5e642e74682756221a51",
    "report.cjs",
  ],
  [
    "recovery",
    "4f58bf66872aa30197513b6c87aefd5366f7fd616532d14137fdcc42a76320c6",
    "recovery-report.cjs",
  ],
]) {
  assert.equal(sha(read(name + "-launcher-freeze.json")), digest);
  assert.equal(
    sha(read(contract)),
    json(name + "-launcher-freeze.json").artifacts[contract].sha256,
  );
}
const validate = require("./recovery-report.cjs").validate;
const bindings = json("bindings.json");
const modes = [
  "prepare",
  "stored-proof-cold",
  "unchanged-list",
  "signed-unfinished",
  "signed-proof-cold",
];
assert.deepEqual(
  bindings.cases.map((x) => x.mode),
  modes,
);
for (const item of bindings.cases) {
  const mode = item.mode,
    wrapper = json(mode + "-report.json"),
    result = json(mode + "-result.json");
  const post = json(mode + "-post.json"),
    main = json(mode + "-main-process.json"),
    driver = json(mode + "-driver-observation.json");
  validate(wrapper.report);
  assert.equal(wrapper.report.mode, mode);
  assert.equal(result.mode, mode);
  assert.equal(item.hostCommit, "dcd242f13da2a1e9b49a1ac092ba42ef45f1be20");
  assert.equal(item.packageCommit, "fb3add6aa411375b42ed84735d4901bbc491c68e");
  assert.equal(
    item.packageTar.sha256,
    "6169f7445db3306feae9a16f35d6665e9f767e59b071a41a05e5f14fef02c59c",
  );
  assert.equal(item.inventories.installedPackage.files, 279);
  assert.equal(result.qualified, true);
  assert.equal(result.postUnchanged, true);
  assert.equal(post.unchanged, true);
  assert.equal(wrapper.original.sha256, result.report.sha256);
  assert.equal(wrapper.original.bytes, result.report.bytes);
  assert.deepEqual(wrapper.original, item.originalInputs.report);
  assert.equal(item.originalInputs.request.sha256, result.requestSha256);
  assert.equal(item.originalInputs.freeze.sha256, result.sourceFreezeSha256);
  for (const [suffix, key] of [
    ["result", "result"],
    ["post", "post"],
    ["main-process", "process"],
    ["driver-observation", "driverObservation"],
  ]) {
    const bytes = read(mode + "-" + suffix + ".json");
    assert.deepEqual(
      { bytes: bytes.length, sha256: sha(bytes) },
      item.originalInputs[key],
    );
  }
  assert.equal(
    driver.schema,
    "railgun-installed-owner-private-first-driver-v1",
  );
  assert.equal(driver.firstRequestSha256, result.requestSha256);
  assert.equal(driver.firstResultSha256, sha(read(mode + "-result.json")));
  assert.equal(driver.rootOriginalDriver.exitCode, 0);
  assert.equal(driver.rootOriginalDriver.natural, true);
  assert.equal(driver.rootOriginalDriver.signal, null);
  assert.notEqual(driver.rootOriginalDriver.pid, main.pid);
  for (const key of ["natural", "exitObserved", "closeObserved"])
    assert.equal(main[key], true);
  for (const key of [
    "timedOut",
    "interrupted",
    "terminateRequested",
    "killRequested",
  ])
    assert.equal(main[key], false);
  assert.equal(main.code, 0);
  assert.equal(main.signal, null);
  assert.deepEqual(item.originalProcesses, {
    driver: driver.rootOriginalDriver,
    main,
  });
  assert.deepEqual(wrapper.report.cacheBefore.native, []);
  assert.deepEqual(wrapper.report.cacheAfter.native, [
    "better-sqlite3/prebuilds/darwin-arm64.node",
  ]);
  assert.equal(wrapper.normalizations.length, 1);
  assert.deepEqual(wrapper.normalizations[0].pointerTokens, [
    "report",
    "cacheAfter",
    "native",
    0,
  ]);
  const family = mode.startsWith("signed-") ? "recovery" : "private";
  assert.equal(
    item.launcherFreezeSha256,
    sha(read(family + "-launcher-freeze.json")),
  );
  assert.equal(item.limits.profilePayloadRead, false);
  assert.equal(item.limits.utilityModuleCacheObserved, false);
  if (item.firstMode) {
    const first = bindings.cases.find((x) => x.mode === item.firstMode);
    const firstReport = json(item.firstMode + "-report.json").report;
    assert.equal(
      item.firstMode,
      mode === "stored-proof-cold" ? "prepare" : "signed-unfinished",
    );
    for (const key of [
      "buildSha256",
      "launcherFreezeSha256",
      "runtime",
      "inventories",
      "recipeFiles",
    ])
      assert.deepEqual(item[key], first[key]);
    for (const key of mode === "stored-proof-cold"
      ? ["holdId", "transactionDigest"]
      : ["signatureSha256", "capsuleSha256"])
      assert.equal(wrapper.report.scenario[key], firstReport.scenario[key]);
    assert.notEqual(main.pid, json(item.firstMode + "-main-process.json").pid);
  }
}
process.stdout.write(
  JSON.stringify({
    cases: 5,
    manifestAndDerivedJoins: true,
    externalInventoriesRehashed: false,
    originalProcessHistoryIndependentlyAuthenticated: false,
  }) + "\n",
);
