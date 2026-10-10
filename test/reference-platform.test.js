"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const { EventEmitter } = require("node:events");
const source = fs.readFileSync(
  path.resolve(__dirname, "../examples/reference-wallet/host/platform.cjs"),
  "utf8",
);
function fixture() {
  const app = new EventEmitter();
  app.isReady = () => true;
  app.getPath = () => "/public-test-temp";
  app.getAppMetrics = jest.fn(() => []);
  const child = new EventEmitter();
  child.pid = 12345;
  child.kill = jest.fn();
  const fork = jest.fn(() => child),
    workerCalls = [];
  const kill = jest.fn();
  const fakeRequire = (name) => {
    if (name === "electron")
      return { app, utilityProcess: { fork }, MessageChannelMain: class {} };
    if (name === "node:worker_threads")
      return {
        isMainThread: true,
        Worker: class {
          constructor(file, options) {
            workerCalls.push({ file, options });
            this.stdout = this.stderr = { resume() {} };
          }
        },
      };
    return require(name);
  };
  fakeRequire.resolve = (name) =>
    path.resolve(__dirname, "../examples/reference-wallet/host", name);
  const module = { exports: {} };
  // Host call controls, not native evidence. The separate Electron probe checks
  // the actual fixed utility entry and observes its original process exit.
  new Function("require", "module", "process", source)(fakeRequire, module, {
    versions: { electron: "fixture" },
    type: "browser",
    platform: "darwin",
    env: { EXAMPLE: "not forwarded" },
    kill,
  });
  return {
    host: module.exports.createPlatformHost(),
    child,
    fork,
    kill,
    workerCalls,
    app,
  };
}
test("only fixed utility entry is launched, without inherited environment values", () => {
  const fixtureHost = fixture();
  expect(() =>
    fixtureHost.host.spawnUtility({ entry: "/arbitrary", heapMb: 64 }),
  ).toThrow();
  expect(fixtureHost.fork).not.toHaveBeenCalled();
  expect(
    fixtureHost.host.spawnUtility({ entry: "railgun-utility-v1", heapMb: 64 }),
  ).toBe(fixtureHost.child);
  const [filename, args, options] = fixtureHost.fork.mock.calls[0];
  expect(filename.endsWith("/host/utility-entry.cjs")).toBe(true);
  expect(args).toEqual([]);
  expect(options.env).toEqual({ EXAMPLE: "" });
  expect(options.execArgv).toEqual(["--max-old-space-size=64"]);
});
test("termination needs the exact spawned live child and PID", () => {
  const f = fixture();
  const child = f.host.spawnUtility({
    entry: "railgun-utility-v1",
    heapMb: 64,
  });
  expect(() => f.host.terminateUtility(child, "SIGTERM")).toThrow();
  child.emit("spawn");
  expect(() =>
    f.host.terminateUtility({ pid: child.pid }, "SIGTERM"),
  ).toThrow();
  f.host.terminateUtility(child, "SIGKILL");
  expect(f.kill).toHaveBeenCalledWith(12345, "SIGKILL");
  child.emit("exit");
  expect(() => f.host.terminateUtility(child, "SIGTERM")).toThrow();
});
test("shutdown revokes the lifetime and prevents new platform work", () => {
  const f = fixture();
  f.app.emit("before-quit");
  expect(f.host.applicationLifetime().aborted).toBe(true);
  expect(() => f.host.createUtilityChannel()).toThrow();
  expect(() =>
    f.host.spawnUtility({ entry: "railgun-utility-v1", heapMb: 64 }),
  ).toThrow();
});
test("worker entry and exact key transfer are fixed; extra authority fields refuse", () => {
  const f = fixture(),
    key = new Uint8Array(32);
  const input = {
    workerData: {
      profileId: "public-test",
      subject: {
        kind: "private-account",
        principal: "railgun:0",
        chainId: 11155111,
        protocol: "railgun",
        deployment: "sepolia",
        role: "engine",
      },
      requirements: {
        origin: "tor",
        content: "public",
        correctness: "any",
        maxAgeMs: null,
      },
      storage: {
        filename: "/public-test/profile.sqlite",
        key,
        binding: "a".repeat(64),
        create: true,
        format: "paged-v2",
      },
      revoked: new SharedArrayBuffer(8),
    },
    transferList: [key.buffer],
  };
  expect(() =>
    f.host.spawnStorageWorker({ ...input, entry: "/arbitrary" }),
  ).toThrow();
  expect(() =>
    f.host.spawnStorageWorker({
      ...input,
      transferList: [new ArrayBuffer(32)],
    }),
  ).toThrow();
  f.host.spawnStorageWorker(input);
  expect(f.workerCalls[0].file.endsWith("/host/storage-entry.cjs")).toBe(true);
  expect(f.workerCalls[0].options.transferList[0]).toBe(key.buffer);
  expect(f.workerCalls[0].options.env).toEqual({});
});
