"use strict";
const {
  assertEnvironment,
  assertLockedDependencies,
  install,
} = require("../tools/conformance/install-reference.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
test.each([
  "NODE_OPTIONS",
  "NODE_PATH",
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_OVERRIDE_DIST_PATH",
  "ELECTRON_SKIP_BINARY_DOWNLOAD",
  "ELECTRON_MIRROR",
  "ELECTRON_CUSTOM_DIR",
  "ELECTRON_CUSTOM_FILENAME",
])("explicit %s refuses even an empty override before installing", (name) => {
  expect(() => assertEnvironment({ [name]: "" })).toThrow(
    "Unset runtime override",
  );
});
test("adding the packed adapter must not re-resolve any locked dependency", () => {
  const before = {
    packages: {
      "": { name: "example" },
      "node_modules/ethers": {
        version: "6.17.0",
        resolved: "https://registry.npmjs.org/ethers/-/ethers-6.17.0.tgz",
        integrity: "sha512-public-fixture",
      },
    },
  };
  const after = structuredClone(before);
  after.packages["node_modules/@freedom/railgun-kohaku-adapter"] = {
    version: "0.6.0",
  };
  expect(() => assertLockedDependencies(before, after)).not.toThrow();
  for (const field of ["version", "resolved", "integrity"]) {
    const changed = structuredClone(after);
    changed.packages["node_modules/ethers"][field] = "changed";
    expect(() => assertLockedDependencies(before, changed)).toThrow(
      "Locked dependency changed",
    );
  }
  delete after.packages["node_modules/ethers"];
  expect(() => assertLockedDependencies(before, after)).toThrow(
    "Locked dependency changed",
  );
});
test("installer refuses an existing directory without overwriting its files", () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "reference-install-refusal-")),
  );
  fs.writeFileSync(path.join(root, "preserve"), "original");
  expect(() => install(root)).toThrow("new absolute directory");
  expect(fs.readdirSync(root)).toEqual(["preserve"]);
  expect(fs.readFileSync(path.join(root, "preserve"), "utf8")).toBe("original");
});
test("child environment retains only the documented host variables", () => {
  const {
    childEnvironment,
  } = require("../tools/conformance/install-reference.cjs");
  expect(
    childEnvironment({
      PATH: "/usr/bin",
      HOME: "/fixture",
      TMPDIR: "/tmp",
      LANG: "C",
      LC_ALL: "C",
      SECRET_TOKEN: "not-for-child",
      HTTPS_PROXY: "not-implicitly-authorized",
    }),
  ).toEqual({
    PATH: "/usr/bin",
    HOME: "/fixture",
    TMPDIR: "/tmp",
    LANG: "C",
    LC_ALL: "C",
  });
  for (const name of [
    "electron_use_remote_checksums",
    "npm_config_electron_use_remote_checksums",
    "ELECTRON_INSTALL_ARCH",
    "npm_config_registry",
  ])
    expect(() => childEnvironment({ [name]: "override" })).toThrow(
      "Unset runtime override",
    );
});
test("parent and global user module trees refuse dependency borrowing", () => {
  const {
    assertNoParentModules,
  } = require("../tools/conformance/install-reference.cjs");
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "reference-install-parent-")),
  );
  const parent = path.join(root, "parent"),
    home = path.join(root, "home");
  fs.mkdirSync(parent);
  fs.mkdirSync(home);
  expect(() =>
    assertNoParentModules(path.join(parent, "app"), home),
  ).not.toThrow();
  fs.mkdirSync(path.join(home, ".node_modules"));
  expect(() => assertNoParentModules(path.join(parent, "app"), home)).toThrow(
    "Global user modules",
  );
  fs.mkdirSync(path.join(parent, "node_modules"));
  expect(() => assertNoParentModules(path.join(parent, "app"), home)).toThrow(
    "Parent node_modules",
  );
});
