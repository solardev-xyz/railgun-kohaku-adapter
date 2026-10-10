"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const root = path.join(__dirname, "../examples/reference-wallet");
const files = require("../examples/reference-wallet/host/sources.json");
const source = fs.readFileSync(
  path.join(root, "host/source-identity.cjs"),
  "utf8",
);
function fixture() {
  const bytes = new Map(
    files.map((name) => [name, fs.readFileSync(path.join(root, name))]),
  );
  const reads = [];
  function host() {
    const module = { exports: {} };
    vm.runInNewContext(source, {
      module,
      __dirname: path.join(root, "host"),
      require(name) {
        if (name === "node:fs")
          return {
            realpathSync: (value) => value,
            readdirSync: (directory) =>
              directory === root
                ? [
                    ...new Set(
                      [...bytes.keys()].map((name) => name.split("/")[0]),
                    ),
                  ]
                : [...bytes.keys()]
                    .filter((name) => name.startsWith("host/"))
                    .map((name) => name.slice(5)),
          };
        if (name === "./sources.json") return [...files];
        if (name === "./files.cjs")
          return {
            readFile(_root, file) {
              const name = path.relative(root, file);
              reads.push(name);
              return bytes.get(name);
            },
          };
        return require(name);
      },
    });
    return module.exports.createSourceIdentityHost();
  }
  return { bytes, reads, host };
}
test("host attestation and cache ports share one immutable complete snapshot", () => {
  const f = fixture(),
    host = f.host();
  const full = host.readDigest();
  f.bytes.set("host/storage.cjs", Buffer.from("changed storage"));
  const caches = host.readCacheDigests();
  expect(f.reads).toEqual(files);
  expect(host.readDigest()).toBe(full);
  expect(host.readCacheDigests()).toBe(caches);
  expect(Object.isFrozen(caches)).toBe(true);
  const next = f.host();
  expect(next.readDigest()).not.toBe(full);
  for (const kind of ["public", "wallet", "txid"])
    expect(next.readCacheDigests()[kind]).not.toBe(caches[kind]);
});
test.each(["review.cjs", "terminal.cjs"])(
  "presentation change %s preserves cache compatibility, not full identity",
  (name) => {
    const f = fixture(),
      first = f.host(),
      full = first.readDigest(),
      caches = first.readCacheDigests();
    f.bytes.set(
      name,
      Buffer.concat([f.bytes.get(name), Buffer.from("\n// wording\n")]),
    );
    const next = f.host();
    expect(next.readDigest()).not.toBe(full);
    expect(next.readCacheDigests()).toEqual(caches);
  },
);
test.each([
  "main.cjs",
  "package.json",
  "package-lock.json",
  "host/vault.cjs",
  "host/files.cjs",
  "host/source-identity.cjs",
  "host/storage.cjs",
  "host/transport.cjs",
  "account-command.cjs",
])("%s is still a compatibility input", (name) => {
  const f = fixture(),
    first = f.host().readCacheDigests();
  f.bytes.set(
    name,
    Buffer.concat([
      f.bytes.get(name),
      Buffer.from("\n// changed implementation\n"),
    ]),
  );
  const next = f.host().readCacheDigests();
  for (const kind of ["public", "wallet", "txid"])
    expect(next[kind]).not.toBe(first[kind]);
});
test("an unlisted runtime file is refused, not silently excluded", () => {
  const f = fixture();
  f.bytes.set("extra.cjs", Buffer.from("unexpected"));
  expect(() => f.host().readDigest()).toThrow("inventory mismatch");
});
test("installed documentation does not become executable source identity", () => {
  const f = fixture(),
    before = f.host();
  const digest = before.readDigest(),
    caches = before.readCacheDigests();
  for (const name of [
    "README.md",
    "JOURNEY.md",
    "ARTI.md",
    "LICENSE",
    "REFERENCE-HOST-PROVENANCE.json",
  ])
    f.bytes.set(name, Buffer.from("documentation"));
  const installed = f.host();
  expect(installed.readDigest()).toBe(digest);
  expect(installed.readCacheDigests()).toEqual(caches);
  f.bytes.set("ARTI.cjs", Buffer.from("unexpected executable"));
  expect(() => f.host().readDigest()).toThrow("inventory mismatch");
});
