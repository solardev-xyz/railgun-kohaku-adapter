"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const { readFile } = require("./files.cjs");
const files = require("./sources.json");
function createSourceIdentityHost() {
  const root = fs.realpathSync(path.dirname(__dirname));
  let snapshot;
  function capture() {
    if (snapshot) return snapshot;
    // Every runtime file is included by default. Only the terminal presentation
    // and manifest bytes are omitted from cache compatibility (never attestation).
    // Main, commands, storage, keys, transport and this reader remain inputs.
    const cacheExcluded = new Set([
      "review.cjs",
      "terminal.cjs",
      "host/sources.json",
    ]);
    const actual = fs
      .readdirSync(root)
      .flatMap((name) => {
        if (
          [
            "README.md",
            "JOURNEY.md",
            "ARTI.md",
            "LICENSE",
            "REFERENCE-HOST-PROVENANCE.json",
            ".DS_Store",
            "node_modules",
          ].includes(name)
        )
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
    const digest = (domain, value) =>
      createHash("sha256")
        .update(JSON.stringify([domain, value]))
        .digest("hex");
    const cacheRows = rows.filter(([name]) => !cacheExcluded.has(name));
    snapshot = Object.freeze({
      full: digest("railgun-reference-host-v1", rows),
      caches: Object.freeze(
        Object.fromEntries(
          ["public", "wallet", "txid"].map((kind) => [
            kind,
            digest(`railgun-reference-${kind}-cache-v1`, cacheRows),
          ]),
        ),
      ),
    });
    return snapshot;
  }
  return Object.freeze({
    readDigest: () => capture().full,
    readCacheDigests: () => capture().caches,
  });
}
module.exports = { createSourceIdentityHost };
