const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const sourceMap = require("../docs/qualification-tools/SOURCE-MAP.json");

test("all staged qualification sources retain original bytes, Git blobs and modes", () => {
  expect(sourceMap.files).toHaveLength(21);
  expect(new Set(sourceMap.files.map((row) => row.destination)).size).toBe(21);
  for (const row of sourceMap.files) {
    expect(row.destination).toBe("tools/qualification/" + row.source);
    expect(row.source.startsWith("scripts/")).toBe(true);
    expect(row.source.split("/")).not.toContain("..");
    const filename = path.join(__dirname, "..", row.destination);
    const info = fs.lstatSync(filename);
    expect(info.isFile()).toBe(true);
    expect(info.isSymbolicLink()).toBe(false);
    const bytes = fs.readFileSync(filename);
    expect(bytes.length).toBe(row.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(row.sha256);
    expect(
      createHash("sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex"),
    ).toBe(row.sourceBlob);
    expect(info.mode & 0o777).toBe(parseInt(row.mode, 8) & 0o777);
  }
});

test("qualification tooling remains outside public exports and the npm files list", () => {
  const manifest = require("../package.json");
  expect(JSON.stringify(manifest.exports)).not.toContain("qualification");
  expect(
    manifest.files.some(
      (entry) => entry === "tools" || entry.startsWith("tools/qualification"),
    ),
  ).toBe(false);
});
