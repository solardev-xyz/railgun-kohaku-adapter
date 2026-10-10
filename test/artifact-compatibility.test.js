"use strict";
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");
const { manifest } = require("../src/execution/railgun-artifacts");
const { checkArtifacts } = require("../tools/artifact-compatibility.cjs");
function fixture(value) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "railgun-artifact-check-"));
  const file = path.join(root, "manifest.json");
  fs.writeFileSync(file, JSON.stringify(value));
  return { root, file };
}
const current = () => Object.fromEntries(Object.entries(manifest).map(([name, entries]) => [name,
  Object.fromEntries(entries.filter(e => e.kind !== "vkey").map(e => [e.kind, e.sha256]))]));
test("checks every supported circuit against supplied upstream hashes without local authority", () => {
  const { file } = fixture(current()), result = checkArtifacts(file);
  expect(result.pinsMatch).toBe(true);
  expect(result.localArtifactsChecked).toBe(false);
  expect(result.checks).toHaveLength(Object.keys(manifest).length * 2);
  expect(result.limits).toHaveLength(4);
});
test.each(["wasm", "zkey"])("retired POI %s is reported as drift, never adopted", (kind) => {
  const value = current(); value.POI_3x3[kind] = "a".repeat(64);
  const { file } = fixture(value), before = fs.readFileSync(file);
  const result = checkArtifacts(file);
  expect(result.pinsMatch).toBe(false);
  expect(result.checks.filter(c => c.status === "changed")).toEqual([
    expect.objectContaining({ circuit: "POI_3x3", kind, observed: "a".repeat(64) })]);
  expect(fs.readFileSync(file)).toEqual(before);
});
test.each([undefined, 4, "A".repeat(64), "not a digest"])("missing or invalid used hash refuses compatibility: %p", (hash) => {
  const value = current(); value.POI_3x3.zkey = hash;
  const result = checkArtifacts(fixture(value).file);
  expect(result.pinsMatch).toBe(false);
  expect(result.checks.find(c => c.circuit === "POI_3x3" && c.kind === "zkey").status).toBe("missing-or-invalid");
});
test("missing and changed local artifacts fail independently of a matching upstream manifest", () => {
  const { file, root } = fixture(current());
  fs.writeFileSync(path.join(root, "POI_3x3.vkey"), "{}");
  const result = checkArtifacts(file, root);
  expect(result.pinsMatch).toBe(false);
  expect(result.checks.find(c => c.source === "local-artifact" && c.kind === "vkey" && c.circuit === "POI_3x3").status).toBe("changed");
  expect(result.checks.some(c => c.status === "missing-or-refused")).toBe(true);
});
test("non-files, symlinks and oversized manifests are refused", () => {
  const { file, root } = fixture(current()), link = path.join(root, "link");
  fs.symlinkSync(file, link);
  expect(() => checkArtifacts(link)).toThrow();
  expect(() => checkArtifacts(root)).toThrow();
  fs.writeFileSync(path.join(root, "large"), Buffer.alloc(1024 * 1024 + 1));
  expect(() => checkArtifacts(path.join(root, "large"))).toThrow();
});
test("CLI exits nonzero on drift and emits only a closed error for malformed input", () => {
  const script = path.join(__dirname, "../tools/artifact-compatibility.cjs");
  const good = fixture(current());
  expect(JSON.parse(execFileSync(process.execPath, [script, good.file])).pinsMatch).toBe(true);
  const bad = fixture({});
  expect(spawnSync(process.execPath, [script, bad.file]).status).toBe(2);
  fs.writeFileSync(bad.file, "secret-looking invalid text");
  const refused = spawnSync(process.execPath, [script, bad.file], { encoding: "utf8" });
  expect(refused.status).toBe(1);
  expect(refused.stderr).toBe('{"pinsMatch":false,"code":"ARTIFACT_INPUT_REFUSED"}\n');
});

test("unpinned upstream circuit and artifact kinds are visible without implying support", () => {
  const value = current(); value.POI_13x13 = { wasm: "a".repeat(64) }; value.POI_3x3.dat = "b".repeat(64);
  const result = checkArtifacts(fixture(value).file);
  expect(result.pinsMatch).toBe(true);
  expect(result.scope).toBe("artifact-pin-comparison");
  expect(result.unpinned).toEqual([{ circuit: "POI_3x3", kind: "dat" }, { circuit: "POI_13x13", kind: null }]);
});
test("a nonexistent, non-directory or symlink artifact root is refused as input", () => {
  const { file, root } = fixture(current()), link = path.join(root, "directory-link");
  fs.symlinkSync(root, link);
  for (const directory of [path.join(root, "missing"), file, link])
    expect(() => checkArtifacts(file, directory)).toThrow();
});
