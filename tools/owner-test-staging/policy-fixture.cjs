/* global jest */
/** Source-byte/host-port controls only; archive verification is a fixed mock.
 * No engine, prover, native utility, profile or encrypted store is opened. */
const fs = require("fs"),
  path = require("path"),
  vm = require("vm");
const root = path.join(__dirname, "../..");
const files = require("../../src/owners/source-files.json");
const helper = fs.readFileSync(
  path.join(root, "src/owners/source-identity.js"),
  "utf8",
);
const original = new Map(
  files.map((name) => [name, fs.readFileSync(path.join(root, name))]),
);
function fixture(verifyArchive) {
  const bytes = new Map(original),
    reads = [],
    lstat = [],
    checks = [];
  let initialized = true,
    host = "a".repeat(64);
  const hostRead = jest.fn(() => host);
  const assertHost = jest.fn(() => {
    if (!initialized) throw Error("Uninitialized owner");
  });
  const fakeFs = {
    realpathSync: (file) => file,
    lstatSync(file) {
      const relative = path.relative(root, file).split(path.sep).join("/");
      lstat.push(relative);
      if (
        ["src", "src/owners", "src/execution", "src/data", "src/poi"].includes(
          relative,
        )
      )
        return { isDirectory: () => true, isSymbolicLink: () => false };
      if (!bytes.has(relative)) throw Error("Missing source");
      return {
        isFile: () => true,
        isSymbolicLink: () => false,
        size: bytes.get(relative).length,
      };
    },
    readFileSync(file) {
      const relative = path.relative(root, file).split(path.sep).join("/");
      reads.push(relative);
      if (!bytes.has(relative)) throw Error("Missing source");
      return bytes.get(relative);
    },
    readdirSync: jest.fn(() => {
      throw Error("Runtime source walk forbidden");
    }),
  };
  function load(text, filename, requireModule) {
    const module = { exports: {} };
    vm.runInNewContext(
      text,
      { module, require: requireModule, __dirname: path.dirname(filename) },
      { filename },
    );
    return module.exports;
  }
  const source = load(
    helper,
    path.join(root, "src/owners/source-identity.js"),
    (name) => {
      if (name === "fs") return fakeFs;
      if (name === "./host-bindings")
        return {
          assertRailgunOwnerHost: assertHost,
          sourceIdentity: { readDigest: hostRead },
        };
      return require(name);
    },
  );
  const loaded = {};
  function policy(name) {
    if (loaded[name]) return loaded[name];
    const file = path.join(root, "src/owners", name + ".js");
    loaded[name] = load(fs.readFileSync(file, "utf8"), file, (request) => {
      if (request === "../deployment") return require("../../src/deployment");
      if (request === "./source-identity") return source;
      if (request === "./source-files.json") return [...files];
      if (request.includes("railgun-engine-runtime"))
        return {
          verifyRailgunEngineRuntime: (archive) => {
            checks.push(archive);
            if (verifyArchive) return verifyArchive(archive);
            if (archive !== "/public-fixture.asar")
              throw Error("Unverified archive");
          },
        };
      if (request.includes("railgun-engine-manifest"))
        return require("../../src/execution/railgun-engine-manifest.json");
      if (request.includes("railgun-public-policy"))
        return policy("railgun-public-policy");
      return require(request);
    });
    return loaded[name];
  }
  return {
    bytes,
    reads,
    lstat,
    fakeFs,
    checks,
    source,
    capture: () => source.captureRailgunPolicySourceIdentity(hostRead()),
    policy,
    hostRead,
    assertHost,
    setHost: (value) => {
      host = value;
    },
    revoke: () => {
      initialized = false;
    },
  };
}

module.exports = { fixture, files, root };
