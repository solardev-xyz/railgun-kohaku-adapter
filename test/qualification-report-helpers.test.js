const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { execFileSync } = require("child_process");
const sourceMap = require("../docs/qualification-tools/REPORT-HELPERS-SOURCES.json");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const root = path.resolve(__dirname, "..");

test("the report helper relocation changes only the three recorded private pin imports", () => {
  expect(sourceMap.files).toHaveLength(15);
  expect(sourceMap.files.reduce((sum, row) => sum + row.edits.length, 0)).toBe(
    3,
  );
  for (const row of sourceMap.files) {
    const filename = path.join(root, row.destination);
    const st = fs.lstatSync(filename);
    expect(st.isFile() && !st.isSymbolicLink()).toBe(true);
    expect(st.mode & 0o777).toBe(parseInt(row.mode, 8) & 0o777);
    const destination = fs.readFileSync(filename, "utf8");
    expect(sha(destination)).toBe(row.destinationSha256);
    let restored = destination;
    for (let i = row.edits.length - 1; i >= 0; i--) {
      const edit = row.edits[i];
      const offset =
        edit.start +
        row.edits
          .slice(0, i)
          .reduce(
            (sum, prior) => sum + prior.after.length - prior.before.length,
            0,
          );
      expect(restored.slice(offset, offset + edit.after.length)).toBe(
        edit.after,
      );
      expect(edit.target).toBe("src/railgun-shield-pins.json");
      restored =
        restored.slice(0, offset) +
        edit.before +
        restored.slice(offset + edit.after.length);
    }
    expect(Buffer.byteLength(restored)).toBe(row.sourceBytes);
    expect(sha(restored)).toBe(row.sourceSha256);
    expect(
      createHash("sha1")
        .update(`blob ${row.sourceBytes}\0`)
        .update(restored)
        .digest("hex"),
    ).toBe(row.sourceBlob);
  }
  for (const [filename, hash] of Object.entries(
    sourceMap.privateCanonicalInputs,
  )) {
    expect(sha(fs.readFileSync(path.join(root, filename)))).toBe(hash);
  }
});

test("actual helper imports need only builtins and the canonical pin, with no owner or profile setup", () => {
  const files = sourceMap.files
    .filter((row) => !row.destination.endsWith(".test.js"))
    .map((row) => path.join(root, row.destination));
  const pinFile = path.join(root, "src/railgun-shield-pins.json");
  const script = `
    const Module = require('module');
    const assert = require('assert/strict');
    const files = ${JSON.stringify(files)};
    const allowed = new Set([...files, ${JSON.stringify(pinFile)}]);
    const builtins = new Set(['assert/strict', 'fs', 'path', 'crypto']);
    const original = Module._load;
    Module._load = function (request, parent, isMain) {
      const filename = Module._resolveFilename(request, parent, isMain);
      assert.ok(builtins.has(filename) || allowed.has(filename), 'Unexpected helper dependency: ' + filename);
      return Reflect.apply(original, this, arguments);
    };
    for (const file of files) require(file);
    assert.ok(Object.keys(require.cache).every((name) => allowed.has(name)));
    process.stdout.write(String(files.length));
  `;
  expect(
    execFileSync(process.execPath, ["-e", script], {
      encoding: "utf8",
      timeout: 10000,
    }),
  ).toBe("8");
});
