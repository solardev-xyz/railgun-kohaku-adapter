"use strict";
const fs = require("fs"),
  path = require("path"),
  vm = require("vm");
const code = fs.readFileSync(
  path.join(__dirname, "../src/owners/worker-host-bindings.js"),
  "utf8",
);
function realm(thread = { isMainThread: false, parentPort: {} }) {
  const imports = [];
  const context = vm.createContext({
    Object,
    require(name) {
      imports.push(name);
      return name === "worker_threads" ? thread : require(name);
    },
  });
  return {
    imports,
    copy() {
      context.module = { exports: {} };
      vm.runInContext(`(function(){${code}\n})()`, context);
      return context.module.exports;
    },
  };
}
const input = () => ({
  context: { getPrivacyContext: jest.fn(), createPrivacyScope: jest.fn() },
});
test("worker-only context binding is strict once and preserves exact originals", () => {
  const r = realm(),
    first = r.copy(),
    value = input(),
    result = { genuine: true };
  value.context.getPrivacyContext.mockReturnValue(result);
  expect(() => first.context.getPrivacyContext({})).toThrow();
  first.initializeRailgunWorkerHost(value);
  expect(first.context.getPrivacyContext({})).toBe(result);
  expect(value.context.getPrivacyContext.mock.contexts[0]).toBe(value.context);
  expect(() => first.initializeRailgunWorkerHost(value)).toThrow();
  expect(() => r.copy().initializeRailgunWorkerHost(value)).toThrow();
  expect(
    r.imports.every((name) => ["worker_threads", "util"].includes(name)),
  ).toBe(true);
  expect(Object.keys(first)).toEqual([
    "initializeRailgunWorkerHost",
    "context",
  ]);
  expect(Object.keys(first.context)).toEqual([
    "getPrivacyContext",
    "createPrivacyScope",
  ]);
});
test.each([
  { isMainThread: true, parentPort: {} },
  { isMainThread: false, parentPort: null },
])("refuses wrong worker realm %p", (thread) => {
  expect(() =>
    realm(thread).copy().initializeRailgunWorkerHost(input()),
  ).toThrow();
});
test("worker bootstrap refuses credential/main-family expansion and getter traps", () => {
  const trap = jest.fn(() => {
    throw new Error("trap");
  });
  for (const change of [
    (v) => ({ ...v, credentials: {} }),
    (v) => ({ context: new Proxy(v.context, { ownKeys: trap }) }),
    (v) => Object.defineProperty(v, "context", { get: trap }),
  ]) {
    const port = realm().copy();
    expect(() => port.initializeRailgunWorkerHost(change(input()))).toThrow();
    expect(() => port.initializeRailgunWorkerHost(input())).toThrow();
  }
  expect(trap).not.toHaveBeenCalled();
});
test.each([
  [false, undefined, "./worker-host-bindings"],
  [true, "utility", "../execution/host-bindings"],
  [true, "browser", "./host-bindings"],
])(
  "fixed realm routing main=%p type=%p loads only its binding",
  (main, type, target) => {
    const code = fs.readFileSync(
      path.join(__dirname, "../src/owners/context-bindings.js"),
      "utf8",
    );
    const imports = [],
      functions = { getPrivacyContext: () => {}, createPrivacyScope: () => {} },
      module = { exports: {} };
    vm.runInNewContext(code, {
      module,
      process: { type },
      require(name) {
        imports.push(name);
        if (name === "worker_threads") return { isMainThread: main };
        expect(name).toBe(target);
        return name.includes("execution/") ? functions : { context: functions };
      },
    });
    expect(imports).toEqual(["worker_threads", target]);
    expect(module.exports.getPrivacyContext).toBe(functions.getPrivacyContext);
    expect(module.exports.createPrivacyScope).toBe(
      functions.createPrivacyScope,
    );
  },
);
