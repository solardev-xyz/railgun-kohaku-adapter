"use strict";
const fs = require("fs"),
  path = require("path"),
  vm = require("vm");
const source = fs.readFileSync(
  path.join(__dirname, "../src/owners/host-bindings.js"),
  "utf8",
);
const schema = {
  context: ["getPrivacyContext", "createPrivacyScope"],
  artifacts: ["createPrivacyArtifactLoader"],
  credentials: ["currentSession", "withMaterial"],
  platform: [
    "applicationLifetime",
    "spawnUtility",
    "createUtilityChannel",
    "memorySamples",
    "terminateUtility",
    "spawnStorageWorker",
  ],
  profiles: ["getActiveProfile"],
  sessions: ["openPrivacySession"],
  storage: ["createPrivacyStorage", "getPrivacyStoragePath"],
  rpc: [
    "assertPrivateRpcDestination",
    "createPrivateRpc",
    "createPrivateRpcDestinationConstraint",
    "createPrivateRpcReadBudget",
    "getPrivateRpcDestination",
    "getPrivateRpcDestinationDetails",
    "getPrivateRpcReadBudgetOutcome",
  ],
  transport: ["createWalletTorTransport"],
  settings: ["isWalletTorExperimentAvailable"],
  tor: ["getWalletSocksEndpoint"],
  signers: ["getSigner"],
  transactionIntent: ["transactionIntent", "validIntent"],
  transactionNetwork: [
    "assertPrivateTransactionNetworkDestination",
    "getPrivateTransactionNetwork",
    "getPrivateTransactionNetworkDestination",
  ],
  submissionJournal: ["getPrivateSubmissionJournal"],
  journalRetention: ["validArchive"],
  transactions: ["signAndSendTransaction"],
  submitter: ["readMetadata"],
};
const refused = expect.objectContaining({
  code: "RAILGUN_OWNER_HOST_UNAVAILABLE",
});
function realm({ type, main = true } = {}) {
  const imports = [];
  let execution;
  const context = vm.createContext({
    Reflect,
    process: { type },
    require(name) {
      imports.push(name);
      if (name === "worker_threads") return { isMainThread: main };
      if (name === "../execution/host-bindings") {
        if (!execution)
          execution = vm.runInContext(
            `(function(){const module={exports:{}};${fs.readFileSync(path.join(__dirname, "../src/execution/host-bindings.js"), "utf8")}\n;return module.exports;})()`,
            context,
          );
        return execution;
      }
      return require(name);
    },
  });
  return {
    context,
    imports,
    execution: () => execution,
    copy() {
      return vm.runInContext(
        `(function(){const module={exports:{}};${source}\n;return module.exports;})()`,
        context,
      );
    },
  };
}
function bindings() {
  return Object.assign(
    Object.create(null),
    Object.fromEntries(
      Object.entries(schema).map(([family, names]) => [
        family,
        Object.assign(
          Object.create(null),
          Object.fromEntries(names.map((name) => [name, jest.fn()])),
        ),
      ]),
    ),
  );
}

test("uninitialized closed families refuse, no imports of owners or raw key getter", () => {
  const r = realm(),
    port = r.copy();
  expect(r.imports).toEqual(["util", "worker_threads"]);
  expect(Object.keys(port)).toEqual([
    "initializeRailgunOwnerHost",
    "assertRailgunOwnerHost",
    ...Object.keys(schema),
  ]);
  expect(Object.isFrozen(port)).toBe(true);
  for (const [family, names] of Object.entries(schema)) {
    expect(Object.keys(port[family])).toEqual(names);
    expect(Object.isFrozen(port[family])).toBe(true);
    for (const name of names)
      expect(() => port[family][name]()).toThrow(refused);
  }
});
test("captures originals and receivers without adopting or wrapping original promises", async () => {
  const r = realm(),
    port = r.copy(),
    input = bindings();
  const original = input.credentials.withMaterial,
    task = Promise.resolve({ opaque: true });
  const args = [{ handle: {} }, () => {}];
  original.mockReturnValue(task);
  expect(port.initializeRailgunOwnerHost(input)).toBeUndefined();
  input.credentials.withMaterial = () => {
    throw new Error("replacement");
  };
  expect(port.credentials.withMaterial(...args)).toBe(task);
  expect(original.mock.contexts).toEqual([input.credentials]);
  expect(original.mock.calls).toEqual([args]);
  expect(await task).toEqual({ opaque: true });
});
test("preserves sync errors and rejected original promise identity", async () => {
  const port = realm().copy(),
    input = bindings(),
    error = new Error("original");
  const promise = Promise.reject(error);
  promise.catch(() => {});
  input.platform.spawnUtility.mockImplementation(() => {
    throw error;
  });
  input.storage.createPrivacyStorage.mockReturnValue(promise);
  port.initializeRailgunOwnerHost(input);
  expect(() => port.platform.spawnUtility({})).toThrow(error);
  expect(port.storage.createPrivacyStorage({})).toBe(promise);
  await expect(promise).rejects.toBe(error);
});
test("strict once includes identical input and a second physical-module evaluation", () => {
  const r = realm(),
    first = r.copy(),
    input = bindings();
  first.initializeRailgunOwnerHost(input);
  expect(() => first.initializeRailgunOwnerHost(input)).toThrow(refused);
  const second = r.copy();
  expect(() => second.initializeRailgunOwnerHost(input)).toThrow(refused);
  expect(() => second.context.getPrivacyContext({})).toThrow(refused);
  first.context.getPrivacyContext({});
  expect(input.context.getPrivacyContext).toHaveBeenCalledTimes(1);
});
test.each(["renderer", "utility"])(
  "refuses %s realm before binding",
  (type) => {
    expect(() =>
      realm({ type }).copy().initializeRailgunOwnerHost(bindings()),
    ).toThrow(refused);
  },
);
test("refuses worker realm", () => {
  expect(() =>
    realm({ main: false }).copy().initializeRailgunOwnerHost(bindings()),
  ).toThrow(refused);
});
test.each([
  [
    "missing family",
    (i) => {
      delete i.context;
    },
  ],
  [
    "extra resolver",
    (i) => {
      i.resolve = () => {};
    },
  ],
  [
    "raw seed",
    (i) => {
      i.credentials.seed = () => {};
    },
  ],
  [
    "arbitrary derive",
    (i) => {
      i.credentials.derive = () => {};
    },
  ],
  [
    "key job callback",
    (i) => {
      i.platform.onKey = () => {};
    },
  ],
  [
    "generic spawn",
    (i) => {
      i.platform.spawn = () => {};
    },
  ],
  [
    "nonfunction",
    (i) => {
      i.storage.createPrivacyStorage = true;
    },
  ],
  [
    "symbol",
    (i) => {
      i[Symbol("extra")] = true;
    },
  ],
])("invalid %s poisons the attempted bootstrap", (_name, mutate) => {
  const r = realm(),
    port = r.copy(),
    input = bindings();
  mutate(input);
  expect(() => port.initializeRailgunOwnerHost(input)).toThrow(refused);
  expect(() => port.initializeRailgunOwnerHost(bindings())).toThrow(refused);
  expect(() => r.copy().initializeRailgunOwnerHost(bindings())).toThrow(
    refused,
  );
});
test("rejects getters and proxies without traps, including function proxies", () => {
  const trap = jest.fn(() => {
    throw new Error("trap");
  });
  for (const change of [
    (i) => new Proxy(i, { ownKeys: trap }),
    (i) => {
      Object.defineProperty(i, "context", { get: trap });
      return i;
    },
    (i) => {
      Object.defineProperty(i.context, "getPrivacyContext", { get: trap });
      return i;
    },
    (i) => {
      i.context.getPrivacyContext = new Proxy(() => {}, { apply: trap });
      return i;
    },
  ])
    expect(() =>
      realm().copy().initializeRailgunOwnerHost(change(bindings())),
    ).toThrow(refused);
  expect(trap).not.toHaveBeenCalled();
});
test("extra positional input also consumes the single attempt", () => {
  const port = realm().copy();
  expect(() => port.initializeRailgunOwnerHost(bindings(), {})).toThrow(
    refused,
  );
  expect(() => port.initializeRailgunOwnerHost(bindings())).toThrow(refused);
});
test("a preexisting realm marker is never adopted or reset", () => {
  const r = realm();
  vm.runInContext(
    "Object.defineProperty(globalThis, Symbol.for('@freedom/railgun-kohaku-adapter/owner-host-v1'), {value: {}})",
    r.context,
  );
  expect(() => r.copy().initializeRailgunOwnerHost(bindings())).toThrow(
    refused,
  );
});
test("main and existing execution helpers use the same captured actual host functions", () => {
  const r = realm(),
    port = r.copy(),
    value = bindings(),
    context = {},
    loader = {};
  value.context.getPrivacyContext.mockReturnValue(context);
  value.artifacts.createPrivacyArtifactLoader.mockReturnValue(loader);
  port.initializeRailgunOwnerHost(value);
  expect(port.context.getPrivacyContext("owner")).toBe(context);
  expect(r.execution().getPrivacyContext("execution")).toBe(context);
  expect(r.execution().createPrivacyArtifactLoader("artifact")).toBe(loader);
  expect(value.context.getPrivacyContext.mock.contexts).toEqual([
    value.context,
    value.context,
  ]);
  expect(value.artifacts.createPrivacyArtifactLoader.mock.contexts).toEqual([
    value.artifacts,
  ]);
  expect(() =>
    r.execution().initializeRailgunExecutionHost({
      context: value.context,
      artifacts: value.artifacts,
    }),
  ).toThrow();
});
test("execution-host preemption prevents main owner initialization and cannot be adopted", () => {
  const r = realm();
  vm.runInContext(
    "Object.defineProperty(globalThis,Symbol.for('@freedom/railgun-kohaku-adapter/execution-host-v1'),{value:{}})",
    r.context,
  );
  const port = r.copy();
  expect(() => port.initializeRailgunOwnerHost(bindings())).toThrow();
  expect(() => port.context.getPrivacyContext({})).toThrow(refused);
  expect(() => port.initializeRailgunOwnerHost(bindings())).toThrow(refused);
});

test("private authority assertion exposes no host data and refuses uninitialized/second copies", () => {
  const r = realm(),
    first = r.copy(),
    second = r.copy(),
    input = bindings();
  expect(() => first.assertRailgunOwnerHost()).toThrow(refused);
  first.initializeRailgunOwnerHost(input);
  expect(first.assertRailgunOwnerHost()).toBeUndefined();
  expect(() => first.assertRailgunOwnerHost({})).toThrow(refused);
  expect(() => second.assertRailgunOwnerHost()).toThrow(refused);
  for (const family of Object.values(input))
    for (const fn of Object.values(family)) expect(fn).not.toHaveBeenCalled();
});
test("malformed owner registration permanently poisons both initializer domains", () => {
  const r = realm(),
    port = r.copy(),
    input = bindings();
  delete input.credentials;
  expect(() => port.initializeRailgunOwnerHost(input)).toThrow(refused);
  expect(() =>
    r.execution().initializeRailgunExecutionHost({
      context: input.context,
      artifacts: input.artifacts,
    }),
  ).toThrow();
  expect(() => r.execution().getPrivacyContext({})).toThrow();
  expect(() => port.assertRailgunOwnerHost()).toThrow(refused);
});
