"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const manifest = require("../docs/qualification-tools/HISTORICAL-FREEDOM-SOURCES.json");
const pkg = require("../package.json");
const root = path.resolve(__dirname, "..");

test("historical qualification sources preserve original bytes and Git blobs", () => {
  expect(manifest.sourceCount).toBe(360);
  expect(manifest.files).toHaveLength(manifest.sourceCount);
  expect(new Set(manifest.files.map((row) => row.source)).size).toBe(360);
  expect(manifest.deletionAuthorizedByManifest).toBe(false);
  for (const row of manifest.files) {
    expect(row.source.startsWith("scripts/")).toBe(true);
    expect(row.destination.startsWith("tools/")).toBe(true);
    expect(row.destination.split("/")).not.toContain("..");
    const bytes = fs.readFileSync(path.join(root, row.destination));
    expect(bytes.length).toBe(row.bytes);
    expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(row.sha256);
    expect(crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"))
      .toBe(row.sourceBlob);
    expect(fs.statSync(path.join(root, row.destination)).mode & 0o111)
      .toBe(row.mode === "100755" ? 0o111 : 0);
  }
});

test("historical commands cannot enter the shipped or default executable surfaces", () => {
  expect(pkg.files.every((entry) => !entry.startsWith("tools") && entry !== "*" && entry !== "**/*"))
    .toBe(true);
  expect(JSON.stringify(pkg.exports)).not.toContain("tools/");
  const config = require("../jest.config.js");
  expect(config.modulePathIgnorePatterns).toContain("<rootDir>/tools/freedom-legacy-qualification/");
  const discovery = config.testMatch;
  expect(discovery.every((entry) => !entry.includes("freedom-legacy-qualification"))).toBe(true);
  expect(manifest.files.filter((row) => row.destination.startsWith("tools/freedom-legacy-qualification/")))
    .toHaveLength(327);
});
