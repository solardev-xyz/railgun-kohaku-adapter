/** Source-byte/host-port controls only; archive verification is a fixed mock.
 * No engine, prover, native utility, profile or encrypted store is opened. */
const fs = require("fs"),
  path = require("path"),
  vm = require("vm");
const { createHash } = require("crypto");
const root = path.join(__dirname, "..");
const files = require("../src/owners/source-files.json");
const helper = fs.readFileSync(
  path.join(root, "src/owners/source-identity.js"),
  "utf8",
);
const original = new Map(
  files.map((name) => [name, fs.readFileSync(path.join(root, name))]),
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
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
      if (request === "./source-identity") return source;
      if (request === "./source-files.json") return [...files];
      if (request.includes("railgun-engine-runtime"))
        return {
          verifyRailgunEngineRuntime: (archive) => {
            checks.push(archive);
            if (!["/public-fixture.asar", "/second-location/public-fixture.asar"].includes(archive))
              throw Error("Unverified archive");
          },
        };
      if (request.includes("railgun-engine-manifest"))
        return require("../src/execution/railgun-engine-manifest.json");
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
const policies = [
  ["railgun-wallet-policy", "getRailgunWalletPolicy"],
  ["railgun-public-policy", "getRailgunPublicPolicy"],
  ["railgun-txid-policy", "getRailgunTxidPolicy"],
];
test.each(policies)(
  "%s uses one initialization snapshot and changed bytes affect only a fresh owner process",
  (name, method) => {
    const f = fixture(),
      read = () => f.policy(name)[method]("/public-fixture.asar");
    f.capture();
    const first = read(),
      reads = f.reads.length;
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    const target = "src/owners/railgun-identity.js";
    const changed = Buffer.concat([
      f.bytes.get(target),
      Buffer.from("\n// source-byte change\n"),
    ]);
    f.bytes.set(target, changed);
    f.setHost("b".repeat(64));
    expect(read()).toBe(first);
    expect(f.reads).toHaveLength(reads);
    expect(f.hostRead).toHaveBeenCalledTimes(1);
    expect(f.source.readRailgunPolicySourceIdentity().layout).toBe(
      "sources-v2",
    );
    expect(Object.isFrozen(f.source.readRailgunPolicySourceIdentity())).toBe(
      true,
    );
    const next = fixture();
    next.bytes.set(target, changed);
    next.capture();
    expect(next.policy(name)[method]("/public-fixture.asar")).not.toBe(first);
    const host = fixture();
    host.setHost("b".repeat(64));
    host.capture();
    expect(host.policy(name)[method]("/public-fixture.asar")).not.toBe(first);
    expect(() => f.capture()).toThrow();
    expect(f.fakeFs.readdirSync).not.toHaveBeenCalled();
    expect(new Set(f.reads)).toEqual(new Set(files));
  },
);
test.each([
  ["missing", (list) => list.slice(1)],
  ["extra", (list) => [...list, "src/owners/extra.js"]],
  ["traversal", (list) => ["../outside.js", ...list.slice(1)]],
  ["duplicate", (list) => [list[0], ...list]],
  ["reordered", (list) => [...list].reverse()],
])(
  "refuses %s source membership before any source read beyond the list",
  (_name, change) => {
    const f = fixture();
    f.bytes.set(
      "src/owners/source-files.json",
      Buffer.from(JSON.stringify(change(files))),
    );
    expect(() => f.capture()).toThrow();
    expect(f.reads).toEqual(["src/owners/source-files.json"]);
    expect(f.hostRead).toHaveBeenCalledTimes(1);
  },
);
test("missing listed files refuse and are never silently removed from identity", () => {
  const f = fixture();
  f.bytes.delete("src/owners/railgun-identity.js");
  expect(() => f.capture()).toThrow();
  expect(f.hostRead).toHaveBeenCalledTimes(1);
});
test.each([
  null,
  {},
  "A".repeat(64),
  "a".repeat(63),
  Promise.resolve("a".repeat(64)),
])("refuses malformed host digest %p", (value) => {
  const f = fixture();
  f.setHost(value);
  expect(() => f.capture()).toThrow();
});
test("uninitialized owner refuses before reading files or calling host source port", () => {
  const f = fixture();
  f.revoke();
  expect(() => f.source.readRailgunPolicySourceIdentity()).toThrow(
    "Uninitialized owner",
  );
  expect(f.reads).toEqual([]);
  expect(f.hostRead).not.toHaveBeenCalled();
});
test("historical qualification limit, domains, archive checks and TXID binding stay fixed", () => {
  const f = fixture();
  expect(f.policy("railgun-public-policy").QUALIFIED_THROUGH).toBe(11829346);
  const binding = "f".repeat(64),
    txid = f.policy("railgun-txid-policy");
  expect(txid.railgunTxidBinding(binding)).toBe(
    sha(JSON.stringify(["freedom:railgun:txid-store-v1", binding])),
  );
  expect(() => txid.railgunTxidBinding("wrong")).toThrow();
  for (const [name, method] of policies) {
    expect(() => f.policy(name)[method]("/wrong.asar")).toThrow(
      "Unverified archive",
    );
    expect(f.reads).toEqual([]);
    const text = fs.readFileSync(
      path.join(root, "src/owners", name + ".js"),
      "utf8",
    );
    expect(text).toContain(`freedom:railgun:${name.split("-")[1]}-policy-v1`);
    expect(text).not.toMatch(
      /require\.resolve|adapterSources|fs\.readFileSync/,
    );
  }
});
test("source manifest is sorted, explicit and includes itself, package exports and both staged bootstraps", () => {
  expect(files).toEqual([...new Set(files)].sort());
  for (const name of [
    "package.json",
    "src/owners/source-files.json",
    "src/owners/source-identity.js",
    "host-owner-authority.cjs",
    "host-owner-authority.mjs",
    "host-journal-data.cjs",
    "host-journal-data.mjs",
    "host-owner-worker-bootstrap.cjs",
  ])
    expect(files).toContain(name);
  expect(files.some((name) => name.endsWith(".mjs"))).toBe(true);
  expect(files).not.toContain("src/owners/railgun-process-entry.js");
  const list = fs.readFileSync(path.join(root, "src/owners/source-files.json"));
  expect(helper).toContain(`const LIST_SHA256 = '${sha(list)}';`);
  expect(
    files.every(
      (name) => !name.startsWith("test/") && !name.startsWith("docs/"),
    ),
  ).toBe(true);
});
test("ordinary data and POI helper imports never load the owner source port", () => {
  jest.isolateModules(() => {
    jest.doMock("../src/owners/host-bindings", () => {
      throw Error("Unexpected owner dependency");
    });
    expect(
      require("../host-data.cjs").normalizeRailgunSignature,
    ).toBeInstanceOf(Function);
    expect(require("../host-poi.cjs").verifyPoiEvent).toBeInstanceOf(Function);
    expect(require("../data.cjs")).toBeDefined();
  });
});

test("the private reader accepts no path/selection argument and suppresses raw filesystem errors", () => {
  const f = fixture();
  expect(() =>
    f.source.readRailgunPolicySourceIdentity("../caller-path"),
  ).toThrow(expect.objectContaining({ code: "RAILGUN_POLICY_SOURCE_REFUSED" }));
  expect(f.reads).toEqual([]);
  f.fakeFs.lstatSync = () => {
    throw Error("private filesystem path must not escape");
  };
  expect(() => f.capture()).toThrow("Railgun policy source unavailable");
});
test("listed symlink/non-file/oversized entries refuse before host source identity", () => {
  for (const kind of ["symlink", "directory", "oversized"]) {
    const f = fixture(),
      originalStat = f.fakeFs.lstatSync;
    f.fakeFs.lstatSync = (file) => {
      const stat = originalStat(file);
      if (
        !files.includes(path.relative(root, file)) ||
        file.endsWith("source-files.json")
      )
        return stat;
      return {
        ...stat,
        isSymbolicLink: () => kind === "symlink",
        isFile: () => kind !== "directory",
        size: kind === "oversized" ? 4 * 1024 * 1024 + 1 : stat.size,
      };
    };
    expect(() => f.capture()).toThrow();
    expect(f.hostRead).toHaveBeenCalledTimes(1);
  }
});

test("source initialization refuses ancestor symlinks and escaping canonical paths", () => {
  for (const kind of ["ancestor-link", "outside"]) {
    const f = fixture(),
      originalStat = f.fakeFs.lstatSync;
    if (kind === "ancestor-link")
      f.fakeFs.lstatSync = (file) => {
        const value = originalStat(file);
        return file === path.join(root, "src")
          ? { ...value, isSymbolicLink: () => true }
          : value;
      };
    else
      f.fakeFs.realpathSync = (file) =>
        file === root ? root : "/outside/source.js";
    expect(() => f.capture()).toThrow(
      expect.objectContaining({ code: "RAILGUN_POLICY_SOURCE_REFUSED" }),
    );
    expect(() => f.capture()).toThrow();
    expect(() => f.source.readRailgunPolicySourceIdentity()).toThrow();
  }
});

// Replaces the historical wrapper-by-wrapper rotation table: all explicitly
// shipped sources now enter the single initialization snapshot. The list itself
// has a separate exact-membership refusal control above, rather than rotation.
test.each(files.filter((name) => name !== "src/owners/source-files.json"))(
  "fresh owner wallet policy binds the actual shipped %s bytes",
  (name) => {
    const f = fixture();
    f.capture();
    const first = f
      .policy("railgun-wallet-policy")
      .getRailgunWalletPolicy("/public-fixture.asar");
    const changed = Buffer.concat([
      f.bytes.get(name),
      Buffer.from("\nchanged source byte\n"),
    ]);
    f.bytes.set(name, changed);
    expect(
      f
        .policy("railgun-wallet-policy")
        .getRailgunWalletPolicy("/public-fixture.asar"),
    ).toBe(first);
    const next = fixture();
    next.bytes.set(name, changed);
    next.capture();
    expect(
      next
        .policy("railgun-wallet-policy")
        .getRailgunWalletPolicy("/public-fixture.asar"),
    ).not.toBe(first);
    expect(next.fakeFs.readdirSync).not.toHaveBeenCalled();
  },
);

test("every fixed relative import in listed runtime source stays within the explicit source identity", () => {
  // Literal relative require closure only. Dynamic archive imports are not
  // claimed by this parser and remain authenticated by their fixed manifests.
  const covered = new Set(files);
  for (const name of files.filter((file) => /\.(?:js|cjs|mjs)$/.test(file))) {
    const text = fs.readFileSync(path.join(root, name), "utf8");
    for (const [, request] of text.matchAll(
      /require\(['"](\.\.?\/[^'"]*)['"]\)/g,
    )) {
      const target = require.resolve(
        path.resolve(root, path.dirname(name), request),
      );
      expect(target.startsWith(root + path.sep)).toBe(true);
      expect(
        covered.has(path.relative(root, target).split(path.sep).join("/")),
      ).toBe(true);
    }
  }
});


test("authenticated archive location alone cannot change captured policy identity", () => {
  const f = fixture();
  f.capture();
  for (const [name, method] of policies) {
    const get = f.policy(name)[method];
    expect(get("/second-location/public-fixture.asar")).toBe(get("/public-fixture.asar"));
  }
});
