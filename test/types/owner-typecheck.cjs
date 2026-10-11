"use strict";
// Compile-only standalone NodeNext consumers. OWNER_PACKAGE_MANIFEST may point
// to the parent's reviewed activation manifest before it is merged here. Copy
// declarations into an isolated directory; never install or execute a runtime.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const root = path.resolve(__dirname, "../..");
const configured = process.env.TYPESCRIPT_PATH === undefined
  ? path.join(root, "node_modules", "typescript")
  : process.env.TYPESCRIPT_PATH;
assert.ok(configured, "TYPESCRIPT_PATH must identify a compiler directory; omit it for the locked compiler");
const ts = require(path.join(path.resolve(configured), "lib/typescript.js"));
const manifest = JSON.parse(
  fs.readFileSync(
    process.env.OWNER_PACKAGE_MANIFEST || path.join(root, "package.json"),
    "utf8",
  ),
);
assert.deepEqual(manifest.exports["./host/owner"], {
  import: { types: "./types/host-owner.d.mts", default: "./host-owner.mjs" },
  require: { types: "./types/host-owner.d.ts", default: "./host-owner.cjs" },
});
assert.deepEqual(manifest.exports["./host/owner-worker-bootstrap"], {
  types: "./types/host-owner-worker-bootstrap.d.ts",
  default: "./host-owner-worker-bootstrap.cjs",
});
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "railgun-owner-types-"),
);
fs.mkdirSync(path.join(temporary, "types"));
fs.mkdirSync(path.join(temporary, "test/types"), { recursive: true });
fs.writeFileSync(
  path.join(temporary, "package.json"),
  JSON.stringify(manifest),
);
for (const name of fs.readdirSync(path.join(root, "types")))
  if (/\.d\.(ts|mts)$/.test(name))
    fs.copyFileSync(
      path.join(root, "types", name),
      path.join(temporary, "types", name),
    );
const options = {
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  types: [],
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
};
const files = [
  "consumer-owner.cts",
  "consumer-owner.mts",
  "consumer-owner-negative.cts",
  "consumer-owner-negative.mts",
];
for (const name of files) {
  const file = path.join(temporary, "test/types", name);
  fs.copyFileSync(path.join(__dirname, name), file);
  const program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => temporary,
      getCanonicalFileName: (v) => v,
      getNewLine: () => "\n",
    }),
  );
  assert.ok(
    program
      .getSourceFiles()
      .every(
        (source) =>
          !source.fileName.includes("node_modules") ||
          source.fileName.startsWith(path.resolve(configured)),
      ),
    "no external declaration dependency",
  );
  if (name === "consumer-owner.cts") {
    const checker = program.getTypeChecker();
    const declaration = program.getSourceFile(
      path.join(temporary, "types/host-owner.d.ts"),
    );
    const exported = checker.getExportsOfModule(
      checker.getSymbolAtLocation(declaration),
    );
    assert.deepEqual(
      exported
        .filter((symbol) => symbol.flags & ts.SymbolFlags.Value)
        .map((symbol) => symbol.name),
      ["initializeRailgunMain"],
    );
    const host = exported.find((symbol) => symbol.name === "RailgunMainHost");
    const families = checker.getDeclaredTypeOfSymbol(host).getProperties();
    const source = fs
      .readFileSync(path.join(root, "src/owners/host-bindings.js"), "utf8")
      .split("const SCHEMA = Object.freeze({")[1]
      .split("\n});")[0];
    const rows = [
      ...source.matchAll(/(\w+): Object\.freeze\(\[([\s\S]*?)\]\)/g),
    ].map((match) => [
      match[1],
      [...match[2].matchAll(/"([^"]+)"/g)].map((item) => item[1]).sort(),
    ]);
    assert.equal(rows.length, 20);
    assert.deepEqual(
      families.map((symbol) => symbol.name).sort(),
      rows.map(([name]) => name).sort(),
    );
    for (const [name, requiredMethods] of rows) {
      const methods = name === "sourceIdentity" ? [...requiredMethods, "readCacheDigests"].sort() : requiredMethods;
      const family = families.find((symbol) => symbol.name === name);
      assert.deepEqual(
        checker
          .getTypeOfSymbolAtLocation(family, declaration)
          .getProperties()
          .map((symbol) => symbol.name)
          .sort(),
        methods,
      );
    }
  }
}
// Discriminating control: removing every expectation must expose each rejected
// capability, not silently pass because the declaration or import became any.
let expectations = 0;
for (const name of files.filter((name) => name.includes("negative"))) {
  const negative = path.join(temporary, "test/types", name);
  const original = fs.readFileSync(negative, "utf8");
  const count = (original.match(/@ts-expect-error/g) || []).length;
  fs.writeFileSync(
    negative,
    original.replace(/@ts-expect-error/g, "expected refusal"),
  );
  const refused = ts.getPreEmitDiagnostics(
    ts.createProgram([negative], options),
  );
  assert.equal(refused.length, count, ts.formatDiagnosticsWithColorAndContext(refused, {
    getCurrentDirectory: () => temporary,
    getCanonicalFileName: (value) => value,
    getNewLine: () => "\n",
  }));
  expectations += count;
}
console.log(
  JSON.stringify({
    compiler: ts.version,
    programs: files.length,
    negativeControls: expectations,
    hostFamilies: 20,
    runtimeExports: ["initializeRailgunMain"],
    nativeExecution: false,
  }),
);
