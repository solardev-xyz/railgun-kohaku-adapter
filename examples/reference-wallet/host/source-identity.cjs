"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const { readFile } = require("./files.cjs");
const files = require("./sources.json");
function createSourceIdentityHost() {
  const root = fs.realpathSync(path.dirname(__dirname));
  function readDigest() {
    const actual = fs
      .readdirSync(root)
      .flatMap((name) => {
        if (["README.md", ".DS_Store", "node_modules"].includes(name))
          return [];
        if (name === "host")
          return fs
            .readdirSync(path.join(root, name))
            .filter((file) => file !== ".DS_Store")
            .map((file) => `${name}/${file}`);
        return [name];
      })
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(files))
      throw new Error("Reference source inventory mismatch");
    const rows = files.map((name) => [
      name,
      createHash("sha256")
        .update(readFile(root, path.join(root, name), 1024 * 1024))
        .digest("hex"),
    ]);
    return createHash("sha256")
      .update(JSON.stringify(["railgun-reference-host-v1", rows]))
      .digest("hex");
  }
  return Object.freeze({ readDigest });
}
module.exports = { createSourceIdentityHost };
