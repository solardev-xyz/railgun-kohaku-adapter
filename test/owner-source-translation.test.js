"use strict";
const fs = require("fs"),
  path = require("path"),
  vm = require("vm"),
  { createHash } = require("crypto");
const root = path.join(__dirname, "..");
const translation = require("../docs/owners/TRANSLATION.json");
const narrowing = require("../docs/owners/KEY-NARROWING.json");
const staged = require("../docs/owners/STAGED-IMPORTS.json");
const persisted = require("../docs/owners/PERSISTED-LITERALS.json");
const imports = require("../docs/owners/IMPORTS.json");
const sha = (value) => createHash("sha256").update(value).digest("hex");
function undo(text, edits) {
  for (const edit of [...edits].reverse()) {
    expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(
      edit.after,
    );
    text =
      text.slice(0, edit.start) +
      edit.before +
      text.slice(edit.start + edit.after.length);
  }
  return text;
}

test("one immutable source basis, all36 owners and expanded R1/submission/worker closure", () => {
  expect(translation.sourceRevision).toBe(
    "c6afd0432918d1258c1aafe11117f133cdd21ef4",
  );
  expect(translation.packageBase).toBe(
    "714401ae4a6f18275829e297ef5856d305a820ae",
  );
  expect(translation.files).toHaveLength(186);
  expect(translation.originalScc).toHaveLength(36);
  const sources = new Set(translation.files.map((row) => row.source));
  for (const source of translation.originalScc)
    expect(sources.has(source)).toBe(true);
  for (const name of [
    "railgun-shield-receive",
    "railgun-poi-output-recovery",
    "railgun-poi-cold-validation",
    "railgun-private-submission",
    "railgun-shield-operation",
    "railgun-session-worker",
    "railgun-session-worker-entry",
    "railgun-process",
    "railgun-process-entry",
  ])
    expect(sources.has(`src/main/wallet/${name}.js`)).toBe(true);
});
test("every translated algorithm reconstructs its exact immutable original bytes", () => {
  let moved = 0,
    reused = 0;
  for (const row of translation.files) {
    let text = fs.readFileSync(path.join(root, row.destination), "utf8");
    expect(sha(text)).toBe(row.destinationSha256);
    expect(row.sourceBlob).toMatch(/^[a-f0-9]{40}$/);
    if (row.disposition === "existing package implementation") {
      reused++;
      continue;
    }
    moved++;
    const privateKeys = narrowing.changes.find(
      (change) => change.file === row.destination,
    );
    if (privateKeys) {
      expect(sha(text)).toBe(privateKeys.afterSha256);
      text = undo(text, privateKeys.replacements);
      expect(sha(text)).toBe(privateKeys.beforeSha256);
    }
    // Original import edits applied high-to-low; inverse is low-to-high.
    text = undo(
      text,
      [...row.edits].sort((a, b) => b.start - a.start),
    );
    expect(sha(text)).toBe(row.sourceSha256);
  }
  expect({ moved, reused }).toEqual({ moved: 135, reused: 51 });
});
test("every reused data/POI/execution implementation has only one destination", () => {
  const rows = translation.files.filter(
    (row) => row.disposition === "existing package implementation",
  );
  expect(new Set(rows.map((row) => row.destination)).size).toBe(rows.length);
  for (const row of rows) {
    expect(
      fs.existsSync(path.join(root, "src/owners", path.basename(row.source))),
    ).toBe(false);
    expect(row.edits).toEqual([]);
  }
  const map = new Map(
    rows.map((row) => [path.basename(row.source), row.destination]),
  );
  expect(map.get("railgun-artifacts.js")).toBe(
    "src/execution/railgun-artifacts.js",
  );
  expect(map.get("railgun-private-intent.js")).toBe(
    "src/data/railgun-private-intent.js",
  );
  expect(map.get("railgun-poi-records.js")).toBe(
    "src/data/railgun-poi-records.js",
  );
});
test("private files parse, fixed imports are local, and missing transitions are exactly inventoried", () => {
  const missing = new Set();
  for (const [name, audit] of Object.entries(staged)) {
    const text = fs.readFileSync(path.join(root, name), "utf8");
    expect(audit.syntaxDiagnostics).toBe(0);
    expect(() => new vm.Script(text, { filename: name })).not.toThrow();
    expect(text).not.toMatch(
      /require\(['"](?:\.\.\/(?:identity|networks)|\.\/privacy-)/,
    );
    for (const edge of audit.edges) {
      if (!edge.request.startsWith(".")) continue;
      const target = path.resolve(root, path.dirname(name), edge.request);
      if (edge.request.startsWith("./unbound/")) {
        missing.add(edge.request);
        expect(fs.existsSync(target + ".js")).toBe(false);
        continue;
      }
      expect(require.resolve(target).startsWith(root + path.sep)).toBe(true);
    }
  }
  expect([...missing].sort()).toEqual([
    "./unbound/credential-lifetime",
    "./unbound/credential-session-transition",
    "./unbound/eoa-wallet-record-transition",
    "./unbound/storage-root-guard-transition",
    "./unbound/storage-root-loan-transition",
  ]);
  expect(
    imports.literalEdges.filter((edge) => edge.status === "activation-blocker"),
  ).toHaveLength(6);
});
test("persisted schema, floor, record and store literals remain exactly unchanged", () => {
  expect(persisted.files).toHaveLength(135);
  const all = new Set();
  for (const row of persisted.files) {
    expect(row.literals).toEqual(
      translation.files.find((source) => source.source === row.source)
        .sourcePersistedLiterals,
    );
    for (const literal of row.literals) all.add(literal);
  }
  for (const literal of [
    "railgun-private-reservations-floor-v1",
    "railgun-private-capsules-floor-v1",
    "railgun-poi-intents-floor-v1",
    "railgun-relay-local-recovery-floor-v4",
    "railgun-wallet-catalog-v1",
    "railgun-wallet-journal-v1",
    "railgun-store-v1",
    "railgun-paged-store-v2",
  ])
    expect(all.has(literal)).toBe(true);
});
test("key callbacks are private same-instance methods, never on returned enrollment", () => {
  const text = fs.readFileSync(
    path.join(root, "src/owners/railgun-account-enrollment.js"),
    "utf8",
  );
  const instance = text.slice(
    text.indexOf("  const instance = Object.freeze({"),
    text.indexOf("  keyMethods.set(instance"),
  );
  expect(instance).not.toMatch(/with(?:Public|Txid|Generation)/);
  expect(text).toContain("keyMethods = new WeakMap()");
  expect(text).toContain("keyMethods.set(instance, Object.freeze({");
  const names = [
    "PublicKeys",
    "PublicCatalogKey",
    "PublicGenerationKeys",
    "TxidGenerationKeys",
    "GenerationKeys",
  ];
  for (const name of names)
    expect(text).toContain(`return methods.with${name}(...args);`);
  for (const name of [
    "railgun-account-public.js",
    "railgun-account-store.js",
    "railgun-account-wallet.js",
  ]) {
    const caller = fs.readFileSync(path.join(root, "src/owners", name), "utf8");
    expect(caller).not.toMatch(/enrollment\.with(?:Public|Txid|Generation)/);
    expect(caller).toContain("withRailgunEnrollment");
  }
});
test("private key entry points refuse forged enrollment before any host activity", () => {
  const text = fs.readFileSync(
    path.join(root, "src/owners/railgun-account-enrollment.js"),
    "utf8",
  );
  const module = { exports: {} };
  vm.runInNewContext(text, {
    module,
    require(name) {
      if (name === "./host-bindings")
        return { profiles: {}, sessions: {}, storage: {} };
      if (["fs", "path", "crypto"].includes(name)) return require(name);
      return {};
    },
  });
  for (const [name, fn] of Object.entries(module.exports)) {
    if (!name.startsWith("withRailgunEnrollment")) continue;
    const callback = jest.fn();
    expect(() => fn({}, callback)).toThrow("Railgun account requires recovery");
    expect(callback).not.toHaveBeenCalled();
  }
});
test("no owner facade, raw-key package export or job activation is published", () => {
  const manifest = require("../package.json");
  expect(Object.keys(manifest.exports)).toEqual([
    ".",
    "./read",
    "./data",
    "./host/data",
    "./host/poi",
    "./host/execution",
    "./host/bootstrap",
  ]);
  expect(fs.existsSync(path.join(root, "host-owner.cjs"))).toBe(false);
  expect(manifest.version).toBe("0.5.0");
});
test("dynamic archive, legacy job loading and policy selectors remain explicit unfinished work", () => {
  const expressions = imports.dynamicExceptions.map((site) => site.expression);
  expect(expressions).toContain("require(message.filename)");
  expect(expressions).toContain("require.resolve('./' + name)");
  expect(
    expressions.some((value) =>
      value.includes("verifyRailgunProverRuntime(archive)"),
    ),
  ).toBe(true);
  expect(imports.dynamicExceptions).toHaveLength(82);
});

test("all reused static named export surfaces were checked, including the full current capsule wrapper", () => {
  const audit = require("../docs/owners/REUSED-EXPORTS.json");
  const rows = translation.files.filter(
    (row) => row.disposition === "existing package implementation",
  );
  expect(audit.sourceRevision).toBe(translation.sourceRevision);
  expect(audit.rows).toHaveLength(rows.length);
  for (const row of rows) {
    const found = audit.rows.find((item) => item.source === row.source);
    expect(found.destination).toBe(row.destination);
    expect(found.sourceSha256).toBe(row.sourceSha256);
    expect(found.destinationSha256).toBe(
      sha(fs.readFileSync(path.join(root, row.destination))),
    );
    expect(found.destinationExports).toEqual(found.exports);
  }
  const capsule = audit.rows.find((row) =>
    row.source.endsWith("/railgun-private-capsule.js"),
  );
  expect(capsule.destination).toBe("src/execution/railgun-private-capsule.js");
  expect(capsule.exports).toContain("normalizeRailgunNewCapsule");
  for (const name of [
    "railgun-account-wallet.js",
    "railgun-wallet-run.js",
    "railgun-private-operation.js",
  ])
    expect(
      fs.readFileSync(path.join(root, "src/owners", name), "utf8"),
    ).toContain('require("../execution/railgun-private-capsule.js")');
});
