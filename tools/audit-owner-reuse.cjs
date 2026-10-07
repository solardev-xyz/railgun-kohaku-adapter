"use strict";
// Build-time source parsing only: no mapped module, engine, or archive is loaded.
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { execFileSync } = require("child_process");
const { createHash } = require("crypto");
const ts = require(process.env.TYPESCRIPT_PATH);
const root = path.join(__dirname, "..");
const sha = (value) => createHash("sha256").update(value).digest("hex");
function surface(name, text) {
  const source = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  assert.equal(source.parseDiagnostics.length, 0);
  let assigned = false;
  const names = [];
  function visit(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.left.getText(source) === "module.exports"
    ) {
      assert.equal(node.operatorToken.kind, ts.SyntaxKind.EqualsToken);
      assert.equal(
        assigned,
        false,
        "multiple export assignments need explicit review",
      );
      assigned = true;
      assert.ok(
        ts.isObjectLiteralExpression(node.right),
        "computed export surface needs explicit review",
      );
      for (const item of node.right.properties) {
        assert.ok(
          !ts.isSpreadAssignment(item) &&
            item.name &&
            !ts.isComputedPropertyName(item.name),
        );
        names.push(item.name.text);
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      /^exports\./.test(node.left.getText(source))
    ) {
      assert.equal(node.operatorToken.kind, ts.SyntaxKind.EqualsToken);
      assert.ok(ts.isPropertyAccessExpression(node.left));
      names.push(node.left.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(new Set(names).size, names.length);
  return names.sort();
}
function check(source, destination) {
  assert.deepEqual(
    surface("destination.js", destination),
    surface("source.js", source),
  );
}
if (process.argv[2] === "--self-test") {
  check(
    "module.exports = { a, b: c, d() {} };",
    "module.exports = {d() {}, b: e, a};",
  );
  assert.throws(() =>
    check("module.exports = {a,b};", "module.exports = {a};"),
  );
  assert.throws(() => surface("x", "module.exports = {...unknown};"));
  assert.throws(() => surface("x", 'module.exports = require("./unknown");'));
  assert.throws(() =>
    surface("x", "module.exports = {}; module.exports = {};"),
  );
  process.stdout.write("5 export surface controls passed\n");
} else {
  const translation = JSON.parse(
    fs.readFileSync(path.join(root, "docs/owners/TRANSLATION.json")),
  );
  const rows = [];
  for (const row of translation.files) {
    if (row.disposition !== "existing package implementation") continue;
    const original = execFileSync(
      "git",
      ["show", `${translation.sourceRevision}:${row.source}`],
      {
        cwd: "/private/tmp/freedom-kernel-observers-oct8",
        encoding: "utf8",
      },
    );
    const destination = fs.readFileSync(
      path.join(root, row.destination),
      "utf8",
    );
    assert.equal(sha(original), row.sourceSha256);
    const json = row.source.endsWith(".json");
    if (!json) check(original, destination);
    rows.push({
      source: row.source,
      destination: row.destination,
      sourceSha256: sha(original),
      destinationSha256: sha(destination),
      exports: json ? null : surface(row.source, original),
      destinationExports: json ? null : surface(row.destination, destination),
      scope: json
        ? "JSON pinned separately; not an export surface"
        : "exact static named export surface; not semantic equivalence",
    });
  }
  process.stdout.write(
    JSON.stringify(
      { sourceRevision: translation.sourceRevision, rows },
      null,
      2,
    ) + "\n",
  );
}
