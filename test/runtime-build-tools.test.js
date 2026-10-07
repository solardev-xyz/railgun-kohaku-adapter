const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const root = path.resolve(__dirname, "..");
const directory = path.join(root, "tools/railgun-runtime-build");
const provenance = require("../tools/railgun-runtime-build/PROVENANCE.json");
const {
  inventoryRailgunFixture,
  assertRailgunFixture,
} = require("../tools/railgun-runtime-build/scripts/railgun-fixture-integrity");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
let temporary;
afterEach(() => {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  temporary = undefined;
});
test.each(provenance.files)(
  "preserves committed build input $originalPath",
  (entry) => {
    const filename = path.join(root, entry.path);
    const stat = fs.lstatSync(filename);
    const bytes = fs.readFileSync(filename);
    expect(stat.isFile() && !stat.isSymbolicLink()).toBe(true);
    expect(bytes.length).toBe(entry.bytes);
    expect(sha(bytes)).toBe(entry.sha256);
    expect(
      crypto
        .createHash("sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex"),
    ).toBe(entry.gitBlob);
    expect(stat.mode & 0o777).toBe(parseInt(entry.mode, 8) & 0o777);
  },
);
test.each(["engine", "prover"])(
  "keeps the %s builder identity pinned by its original manifest",
  (name) => {
    const manifest = require(
      path.join(directory, `src/main/wallet/railgun-${name}-manifest.json`),
    );
    expect(
      sha(
        fs.readFileSync(
          path.join(directory, `scripts/build-railgun-${name}.js`),
        ),
      ),
    ).toBe(manifest.builderSha256);
  },
);
test("fixture inventory authenticates nested bytes and excludes only npm bookkeeping", () => {
  temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "railgun-build-input-test-"),
  );
  fs.mkdirSync(path.join(temporary, "pkg"));
  fs.writeFileSync(path.join(temporary, "pkg", "module.js"), "public fixture");
  const expected = crypto
    .createHash("sha256")
    .update("pkg/module.js\0" + "14\0" + sha("public fixture") + "\n")
    .digest("hex");
  const before = inventoryRailgunFixture(temporary);
  expect(before).toEqual({
    sha256: expected,
    files: 1,
    bytes: 14,
    nativeFiles: [],
  });
  fs.mkdirSync(path.join(temporary, ".bin"));
  fs.writeFileSync(path.join(temporary, ".bin", "ignored"), "not executed");
  fs.writeFileSync(path.join(temporary, ".package-lock.json"), "{}");
  expect(inventoryRailgunFixture(temporary)).toEqual(before);
  fs.writeFileSync(path.join(temporary, "pkg", "module.js"), "changed fixture");
  expect(inventoryRailgunFixture(temporary).sha256).not.toBe(before.sha256);
  expect(() => assertRailgunFixture(temporary)).toThrow(
    "Railgun fixture integrity mismatch",
  );
});
test("fixture inventory refuses symlinks instead of following an external input", () => {
  temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "railgun-build-input-test-"),
  );
  fs.symlinkSync(__filename, path.join(temporary, "alias.js"));
  expect(() => inventoryRailgunFixture(temporary)).toThrow(
    "Unexpected runtime symlink",
  );
});
test.each([
  "build-railgun-engine.js",
  "build-railgun-prover.js",
  "check-railgun-prover-build.js",
])("CLI %s parses without executing a dependency or build", (name) => {
  execFileSync(process.execPath, [
    "--check",
    path.join(directory, "scripts", name),
  ]);
});
test("build tools and source fixtures remain outside the runtime npm whitelist", () => {
  const pkg = require("../package.json");
  expect(
    pkg.files.every(
      (name) => !name.startsWith("tools") && !name.startsWith("test"),
    ),
  ).toBe(true);
  expect(JSON.stringify(pkg.exports)).not.toContain("tools/");
});
