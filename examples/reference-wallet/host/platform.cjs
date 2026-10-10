"use strict";
const path = require("node:path");
const { types } = require("node:util");
const { isMainThread, Worker } = require("node:worker_threads");
function refuse() {
  throw Object.assign(new Error("Reference execution platform unavailable"), {
    code: "RAILGUN_PLATFORM_REFUSED",
  });
}
function record(value, required, optional = []) {
  if (
    !value ||
    typeof value !== "object" ||
    types.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    refuse();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    required.some((key) => !Object.hasOwn(descriptors, key)) ||
    Reflect.ownKeys(descriptors).some(
      (key) =>
        ![...required, ...optional].includes(key) ||
        !Object.hasOwn(descriptors[key], "value") ||
        !descriptors[key].enumerable,
    )
  )
    refuse();
  return Object.fromEntries(
    Object.entries(descriptors).map(([key, value]) => [key, value.value]),
  );
}
function storageInput(input) {
  const { workerData: raw, transferList } = record(input, [
    "workerData",
    "transferList",
  ]);
  const data = record(
    raw,
    ["profileId", "subject", "requirements", "storage", "revoked"],
    ["readOnly"],
  );
  const subject = record(data.subject, [
    "kind",
    "principal",
    "chainId",
    "protocol",
    "deployment",
    "role",
  ]);
  const requirements = record(data.requirements, [
    "origin",
    "content",
    "correctness",
    "maxAgeMs",
  ]);
  const storage = record(data.storage, [
    "filename",
    "key",
    "binding",
    "create",
    "format",
  ]);
  if (
    typeof data.profileId !== "string" ||
    !data.profileId ||
    data.profileId.length > 256 ||
    subject.kind !== "private-account" ||
    !/^railgun:(0|[1-9][0-9]{0,4})$/.test(subject.principal) ||
    Number(subject.principal.slice(8)) > 65535 ||
    subject.chainId !== 11155111 ||
    subject.protocol !== "railgun" ||
    subject.deployment !== "sepolia" ||
    subject.role !== "engine" ||
    requirements.origin !== "tor" ||
    !["public", "pir"].includes(requirements.content) ||
    !["any", "quorum", "proof"].includes(requirements.correctness) ||
    (requirements.maxAgeMs !== null &&
      (!Number.isSafeInteger(requirements.maxAgeMs) ||
        requirements.maxAgeMs < 0)) ||
    typeof storage.filename !== "string" ||
    !path.isAbsolute(storage.filename) ||
    path.resolve(storage.filename) !== storage.filename ||
    typeof storage.binding !== "string" ||
    !/^[0-9a-f]{64}$/.test(storage.binding) ||
    typeof storage.create !== "boolean" ||
    storage.format !== "paged-v2" ||
    (Object.hasOwn(data, "readOnly") &&
      (data.readOnly !== true || storage.create))
  )
    refuse();
  const key = storage.key;
  if (
    !types.isUint8Array(key) ||
    types.isProxy(key) ||
    Object.getPrototypeOf(key) !== Uint8Array.prototype ||
    key.byteLength !== 32 ||
    key.byteOffset !== 0 ||
    !types.isArrayBuffer(key.buffer) ||
    key.buffer.byteLength !== 32 ||
    Reflect.ownKeys(key).length !== 32 ||
    Reflect.ownKeys(key.buffer).length !== 0 ||
    !types.isSharedArrayBuffer(data.revoked) ||
    data.revoked.byteLength !== 8 ||
    Reflect.ownKeys(data.revoked).length !== 0 ||
    !Array.isArray(transferList) ||
    types.isProxy(transferList) ||
    Object.getPrototypeOf(transferList) !== Array.prototype ||
    Reflect.ownKeys(transferList).length !== 2 ||
    transferList.length !== 1 ||
    Object.getOwnPropertyDescriptor(transferList, "0")?.value !== key.buffer
  )
    refuse();
  return {
    workerData: {
      profileId: data.profileId,
      subject,
      requirements,
      storage,
      revoked: data.revoked,
      ...(data.readOnly ? { readOnly: true } : {}),
    },
    transferList: [key.buffer],
  };
}
function createPlatformHost() {
  if (!isMainThread || !process.versions.electron || process.type !== "browser")
    refuse();
  const { app, utilityProcess, MessageChannelMain } = require("electron");
  const lifetime = new AbortController(),
    children = new WeakMap();
  app.once("before-quit", () => lifetime.abort());
  function ready() {
    if (!app.isReady() || lifetime.signal.aborted) refuse();
  }
  return Object.freeze({
    applicationLifetime() {
      return lifetime.signal;
    },
    spawnUtility(input) {
      const { entry, heapMb } = record(input, ["entry", "heapMb"]);
      if (
        entry !== "railgun-utility-v1" ||
        !Number.isSafeInteger(heapMb) ||
        heapMb < 16 ||
        heapMb > 1024
      )
        refuse();
      ready();
      const child = utilityProcess.fork(
        require.resolve("./utility-entry.cjs"),
        [],
        {
          cwd: app.getPath("temp"),
          env: Object.fromEntries(
            Object.keys(process.env).map((key) => [key, ""]),
          ),
          stdio: "ignore",
          execArgv: [`--max-old-space-size=${heapMb}`],
          serviceName: "Railgun reference utility",
        },
      );
      const state = { pid: null, exited: false };
      children.set(child, state);
      child.once("spawn", () => {
        state.pid = child.pid;
      });
      child.once("exit", () => {
        state.exited = true;
      });
      return child;
    },
    createUtilityChannel() {
      ready();
      return new MessageChannelMain();
    },
    memorySamples() {
      ready();
      return app.getAppMetrics();
    },
    terminateUtility(child, signal) {
      const state = children.get(child);
      if (
        !state ||
        state.exited ||
        !["SIGTERM", "SIGKILL"].includes(signal) ||
        !Number.isSafeInteger(state.pid) ||
        state.pid < 1 ||
        child.pid !== state.pid
      )
        refuse();
      return process.platform === "win32" && signal === "SIGTERM"
        ? child.kill()
        : process.kill(state.pid, signal);
    },
    spawnStorageWorker(input) {
      ready();
      const options = storageInput(input);
      const worker = new Worker(require.resolve("./storage-entry.cjs"), {
        ...options,
        env: {},
        execArgv: [],
        stdout: true,
        stderr: true,
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      worker.stdout.resume();
      worker.stderr.resume();
      return worker;
    },
  });
}
module.exports = { createPlatformHost };
