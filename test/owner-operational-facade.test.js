/** Controlled original owner promises; no crypto, native workers or runtime archives. */
"use strict";
let state;
jest.mock("../src/owners/host-bindings", () => ({
  initializeRailgunOwnerHost: (value) => {
    state.host = value;
  },
  assertRailgunOwnerHost: () => {
    if (!state.host) throw Error("uninitialized");
  },
  profiles: { getActiveProfile: () => state.profile },
  platform: { applicationLifetime: () => state.application.signal },
}));
jest.mock("../src/owners/railgun-identity.js", () => ({
  openRailgunIdentity: (input) => state.openIdentity(input),
}));
jest.mock("../src/owners/railgun-account-enrollment.js", () => ({
  openRailgunAccountEnrollment: (input) => state.openEnrollment(input, false),
  openRailgunCooperativeAccountEnrollment: (input) =>
    state.openEnrollment(input, true),
  observeRailgunEnrollmentClosure: (value) => {
    if (!state.enrollments.includes(value)) throw Error("foreign enrollment");
    return value.originalClosed;
  },
}));
jest.mock("../src/owners/railgun-account-public.js", () => ({
  openRailgunAccountPublic: (input) => state.openPublic(input),
  getRailgunAccountPublicDestination: (coordinator, enrollment) =>
    state.destination(coordinator, enrollment),
}));
jest.mock("../src/owners/railgun-account-wallet.js", () => ({
  openRailgunAccountWallet: (input) => state.openWallet(input),
}));
jest.mock("../src/owners/railgun-kohaku-plugin.js", () => ({
  createRailgunKohakuPlugin: (input) => state.createPlugin(input),
  broadcastRailgunKohakuOperation: (plugin, operation) =>
    state.submit(plugin, operation, "private"),
  submitRailgunKohakuPublicOperation: (plugin, operation) =>
    state.submit(plugin, operation, "public"),
}));
jest.mock("../src/owners/railgun-kohaku-recovery.js", () => ({
  createRailgunKohakuRecovery: (options) => state.createRecovery(options),
}));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  promise.catch(() => {});
  return { promise, resolve, reject };
};
const tick = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
function identity(index) {
  const signal = new AbortController();
  return {
    descriptor: { instanceId: "public-" + index },
    signal: signal.signal,
    close: jest.fn(() => signal.abort()),
  };
}
function enrollment() {
  const drain = deferred();
  const value = {
    originalClosed: drain.promise,
    close: jest.fn(() => drain.resolve()),
    drain,
  };
  state.enrollments.push(value);
  return value;
}
function publicOwner() {
  return {
    coordinator: Object.freeze({}),
    close: jest.fn(() => Promise.resolve()),
    advance: jest.fn((range) => Promise.resolve(range)),
  };
}
function walletOwner() {
  return { close: jest.fn(() => Promise.resolve()) };
}
function plugin(input) {
  const drain = deferred(),
    controller = new AbortController();
  const value = {
    input,
    closed: drain.promise,
    signal: controller.signal,
    close: jest.fn(() => {
      controller.abort();
      drain.resolve();
    }),
    instanceId: jest.fn(() => Promise.resolve("id")),
    balance: jest.fn(() => Promise.resolve([])),
    notes: jest.fn(() => Promise.resolve([])),
    prepareTransfer: jest.fn(() => Promise.resolve(Object.freeze({}))),
    prepareUnshield: jest.fn(() => Promise.resolve(Object.freeze({}))),
    prepareShield: jest.fn(() => Promise.resolve(Object.freeze({}))),
    drain,
  };
  state.plugins.push(value);
  return value;
}
const runtime = Object.freeze({
  archive: "/public/engine.asar",
  proverArchive: "/public/prover.asar",
  artifactDirectory: "/public/artifacts",
});
function fixture() {
  jest.resetModules();
  state = {
    application: new AbortController(),
    profile: { userDataDir: "/public/profile" },
    enrollments: [],
    plugins: [],
    openIdentity: jest.fn(async ({ accountIndex }) => identity(accountIndex)),
    openEnrollment: jest.fn(async () => enrollment()),
    openPublic: jest.fn(async () => publicOwner()),
    openWallet: jest.fn(async () => walletOwner()),
    createPlugin: jest.fn(plugin),
    destination: jest.fn(() => Object.freeze({ genuineDestination: true })),
    createRecovery: jest.fn((input) => {
      const drain = deferred(),
        controller = new AbortController();
      return {
        input,
        signal: controller.signal,
        closed: drain.promise,
        drain,
        close: jest.fn(() => {
          controller.abort();
          drain.resolve();
        }),
        history: jest.fn(() =>
          Promise.resolve({ records: [], nextAfter: null }),
        ),
        resumeProof: jest.fn(() => Promise.resolve({ status: "proof-stored" })),
        submitStored: jest.fn(() => Promise.resolve({ status: "submitted" })),
      };
    }),
    submit: jest.fn(() => Promise.resolve({ status: "submitted" })),
  };
  const initialize =
    require("../src/owners/operational-facade").initializeRailgunMain;
  const api = initialize({
    host: Object.freeze({ controlled: true }),
    runtime,
  });
  const caller = new AbortController();
  const options = { accountIndex: 0, signal: caller.signal };
  return { api, initialize, caller, options };
}
const laneOptions = (signal, mode = "read") => ({
  wallet: "active",
  signal,
  ...(mode === "read"
    ? {}
    : {
        reviewPreparation: () => Promise.resolve(true),
        reviewTransaction: () => Promise.resolve(true),
        gasLimit: 1500000n,
        maxGasFee: 1n,
      }),
});

test("closed one-shot initializer and exact account options expose no owner authority", async () => {
  const f = fixture();
  expect(() => f.initialize({ host: {}, runtime })).toThrow();
  expect(() => f.api.openAccount({ ...f.options, enrollment: {} })).toThrow();
  const account = await f.api.createAccount(f.options);
  expect(state.openEnrollment).toHaveBeenCalledWith(
    { identity: await state.openIdentity.mock.results[0].value, create: true },
    true,
  );
  expect(state.openPublic.mock.calls[0][0]).toEqual({
    enrollment: state.enrollments[0],
    archive: runtime.archive,
    create: true,
  });
  expect(Object.keys(account).sort()).toEqual(
    [
      "advancePublic",
      "close",
      "closed",
      "describe",
      "openPrivate",
      "openRecovery",
      "rebuildPublic",
      "resumePublic",
      "openPublic",
      "openRead",
      "signal",
    ].sort(),
  );
  expect(account.describe()).toEqual({
    accountIndex: 0,
    instanceId: "public-0",
    chainId: 11155111,
    deployment: "sepolia",
  });
  expect(() => f.api.openAccount(f.options)).toThrow();
  await account.close();
});
test.each(["identity", "enrollment", "public"])(
  "close during %s opening retains and closes the late original owner",
  async (kind) => {
    const f = fixture(),
      held = deferred();
    const method = {
      identity: "openIdentity",
      enrollment: "openEnrollment",
      public: "openPublic",
    }[kind];
    state[method].mockImplementation(() => held.promise);
    const work = f.api.openAccount(f.options);
    work.catch(() => {});
    await tick();
    f.caller.abort();
    await tick();
    let settled = false;
    work.catch(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    const nextSignal = new AbortController().signal;
    expect(() =>
      f.api.openAccount({ accountIndex: 0, signal: nextSignal }),
    ).toThrow();
    const value =
      kind === "identity"
        ? identity(0)
        : kind === "enrollment"
          ? enrollment()
          : publicOwner();
    held.resolve(value);
    await expect(work).rejects.toThrow();
    await tick();
    expect(value.close).toHaveBeenCalledTimes(1);
  },
);
test("session closure waits original public and root-loan drains; unrelated account can open", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  const publicValue = await state.openPublic.mock.results[0].value;
  const publicDrain = deferred(),
    loan = state.enrollments[0];
  publicValue.close.mockImplementation(() => publicDrain.promise);
  loan.close.mockImplementation(() => {});
  let closed = false;
  const work = account.close();
  work.then(() => {
    closed = true;
  });
  await tick();
  expect(closed).toBe(false);
  expect(() => f.api.openAccount(f.options)).toThrow();
  const unrelated = await f.api.openAccount({ ...f.options, accountIndex: 1 });
  publicDrain.resolve();
  await tick();
  expect(closed).toBe(false);
  loan.drain.resolve();
  await work;
  expect(closed).toBe(true);
  await unrelated.close();
});
test("unknown original closure keeps same-account exclusion after rejection", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  const owner = await state.openPublic.mock.results[0].value;
  const unknown = Object.assign(Error("original unobserved"), {
    code: "RAILGUN_WALLET_EXIT_UNOBSERVED",
  });
  owner.close.mockImplementation(() => Promise.reject(unknown));
  await expect(account.close()).rejects.toBe(unknown);
  expect(() => f.api.openAccount(f.options)).toThrow();
  const other = await f.api.openAccount({ ...f.options, accountIndex: 1 });
  await other.close();
});
test("public construction failure preserves original error and drains acquired owners", async () => {
  const f = fixture(),
    failure = Error("public construction");
  state.openPublic.mockRejectedValue(failure);
  await expect(f.api.openAccount(f.options)).rejects.toBe(failure);
  await tick();
  expect(state.enrollments[0].close).toHaveBeenCalledTimes(1);
  expect(
    (await state.openIdentity.mock.results[0].value).close,
  ).toHaveBeenCalledTimes(1);
});
test("read lane preserves original method promise and transfers the exact wallet into plugin", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  const lane = await account.openRead(laneOptions(f.options.signal));
  const actual = state.plugins[0],
    original = Promise.resolve([{ value: 1 }]);
  actual.balance.mockReturnValue(original);
  expect(lane.balance([])).toBe(original);
  expect(actual.input.account).toBe(
    await state.openWallet.mock.results[0].value,
  );
  expect(actual.input.owners.enrollment).toBe(state.enrollments[0]);
  expect(Object.keys(actual.input).sort()).toEqual([
    "account",
    "mode",
    "owners",
    "signal",
  ]);
  expect(Object.keys(lane).sort()).toEqual([
    "balance",
    "close",
    "closed",
    "instanceId",
    "notes",
    "signal",
  ]);
  expect(() => account.openRead(laneOptions(f.options.signal))).toThrow();
  lane.close();
  await lane.closed;
  await tick();
  await account.close();
});
test.each(["private", "public"])(
  "%s lane wraps and consumes exact original operations once",
  async (mode) => {
    const f = fixture(),
      account = await f.api.openAccount(f.options);
    const lane = await account[
      mode === "private" ? "openPrivate" : "openPublic"
    ](laneOptions(f.options.signal, mode));
    const actual = state.plugins[0];
    const original = Object.freeze({ genuine: "opaque-private-operation" });
    actual[
      mode === "private" ? "prepareTransfer" : "prepareShield"
    ].mockResolvedValue(original);
    const prepared = await lane[
      mode === "private" ? "prepareTransfer" : "prepareShield"
    ](1n, "target");
    expect(Object.keys(prepared.handle)).toEqual([]);
    const submit = mode === "private" ? "broadcast" : "submit";
    expect(() => lane[submit]({ ...prepared.handle })).toThrow();
    const response = Promise.resolve({ status: "original-result" });
    state.submit.mockReturnValue(response);
    expect(lane[submit](prepared.handle)).toBe(response);
    expect(state.submit).toHaveBeenCalledWith(actual, original, mode);
    expect(() => lane[submit](prepared.handle)).toThrow();
    if (mode === "public") {
      expect(actual.input).not.toHaveProperty("proverArchive");
      expect(actual.input).not.toHaveProperty("artifactDirectory");
    } else expect(actual.input.proverArchive).toBe(runtime.proverArchive);
    await account.close();
  },
);
test("close during wallet open observes late wallet cleanup before releasing the account", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options),
    hold = deferred(),
    drain = deferred();
  state.openWallet.mockReturnValue(hold.promise);
  const opening = account.openRead(laneOptions(f.options.signal));
  opening.catch(() => {});
  let closed = false;
  account.close().then(() => {
    closed = true;
  });
  const late = { close: jest.fn(() => drain.promise) };
  hold.resolve(late);
  await expect(opening).rejects.toThrow();
  await tick();
  expect(closed).toBe(false);
  expect(late.close).toHaveBeenCalledTimes(1);
  drain.resolve();
  await account.closed;
  expect(closed).toBe(true);
});
test("abandoning a held plugin result does not release its original closed barrier", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  const lane = await account.openRead(laneOptions(f.options.signal));
  const hold = deferred(),
    actual = state.plugins[0];
  actual.balance.mockReturnValue(hold.promise);
  actual.close.mockImplementation(() => {});
  lane.balance([]);
  let closed = false;
  account.close().then(() => {
    closed = true;
  });
  hold.resolve([]);
  await tick();
  expect(closed).toBe(false);
  actual.drain.resolve();
  await account.closed;
  expect(closed).toBe(true);
});
test("signal, profile, accessor and policy substitutions refuse before new owners", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  expect(() =>
    account.openRead({ ...laneOptions(f.options.signal), policy: "override" }),
  ).toThrow();
  const getter = jest.fn();
  expect(() =>
    account.openRead({
      wallet: "active",
      get signal() {
        getter();
        return f.options.signal;
      },
    }),
  ).toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(() =>
    f.api.openAccount({ ...f.options, signal: { aborted: false } }),
  ).toThrow();
  state.profile = { userDataDir: "/public/other" };
  expect(() => account.describe()).toThrow();
  await account.close();
});

test("lane cancellation during wallet construction revokes original owners and drains late wallet", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options),
    held = deferred();
  const laneSignal = new AbortController();
  state.openWallet.mockReturnValue(held.promise);
  const pending = account.openRead(laneOptions(laneSignal.signal));
  pending.catch(() => {});
  laneSignal.abort();
  await tick();
  expect(
    (await state.openIdentity.mock.results[0].value).close,
  ).toHaveBeenCalledTimes(1);
  const late = walletOwner();
  held.resolve(late);
  await expect(pending).rejects.toThrow();
  await account.closed;
  expect(late.close).toHaveBeenCalledTimes(1);
});
test("synthetic abort events cannot revoke a live session or consume the real listener", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  account.signal.dispatchEvent(new Event("abort"));
  expect(account.describe().accountIndex).toBe(0);
  f.caller.abort();
  await account.closed;
  expect(() => account.describe()).toThrow();
});
test("species-return thenables cannot fake a held original method settlement", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  const lane = await account.openRead(laneOptions(f.options.signal));
  const held = deferred(),
    actual = state.plugins[0],
    invoked = jest.fn();
  held.promise.constructor = {
    [Symbol.species]: function (executor) {
      executor(
        () => {},
        () => {},
      );
      return { then: invoked };
    },
  };
  actual.balance.mockReturnValue(held.promise);
  expect(lane.balance([])).toBe(held.promise);
  let closed = false;
  account.close().then(() => {
    closed = true;
  });
  await tick();
  expect(closed).toBe(false);
  expect(invoked).not.toHaveBeenCalled();
  held.resolve([]);
  await account.closed;
  expect(closed).toBe(true);
});
test("failure to register on original native work retains exclusion", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  const lane = await account.openRead(laneOptions(f.options.signal));
  const held = deferred(),
    actual = state.plugins[0];
  Object.defineProperty(held.promise, "constructor", {
    get() {
      throw Error("registration failed");
    },
  });
  actual.balance.mockReturnValue(held.promise);
  lane.balance([]);
  await expect(account.close()).rejects.toThrow("registration failed");
  expect(() => f.api.openAccount(f.options)).toThrow();
  held.resolve();
});

test("reentrant cancellation inside the first opener cannot resolve shutdown before late identity", async () => {
  const f = fixture(),
    held = deferred();
  state.openIdentity.mockImplementation(() => {
    f.caller.abort();
    return held.promise;
  });
  const work = f.api.openAccount(f.options);
  work.catch(() => {});
  await tick();
  expect(() =>
    f.api.openAccount({
      accountIndex: 0,
      signal: new AbortController().signal,
    }),
  ).toThrow();
  const late = identity(0);
  held.resolve(late);
  await expect(work).rejects.toThrow();
  await tick();
  expect(late.close).toHaveBeenCalledTimes(1);
});

test.each([
  ["rebuildPublic", "new"],
  ["resumePublic", "pending"],
])(
  "%s closes the original public owner before fixed replacement",
  async (method, mode) => {
    const f = fixture(),
      account = await f.api.openAccount(f.options);
    const previous = await state.openPublic.mock.results[0].value,
      drain = deferred();
    previous.close.mockReturnValue(drain.promise);
    const work = account[method]();
    expect(state.openPublic).toHaveBeenCalledTimes(1);
    expect(() => account.openRead(laneOptions(f.options.signal))).toThrow();
    drain.resolve();
    await expect(work).resolves.toEqual({ status: "public-cache-open", mode });
    expect(state.openPublic.mock.calls[1][0]).toEqual({
      enrollment: state.enrollments[0],
      archive: runtime.archive,
      create: false,
      mode,
    });
    expect(() => account[method]({ policy: "arbitrary" })).toThrow();
    await account.close();
  },
);
test("public replacement original close failure is not converted to a fresh generation", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  const previous = await state.openPublic.mock.results[0].value;
  const failure = Error("public original close failed");
  previous.close.mockRejectedValue(failure);
  await expect(account.rebuildPublic()).rejects.toBe(failure);
  await expect(account.closed).rejects.toBe(failure);
  expect(state.openPublic).toHaveBeenCalledTimes(1);
  expect(() => f.api.openAccount(f.options)).toThrow();
});
const recoveryOptions = (signal) => ({
  signal,
  reviewDisclosures: () => Promise.resolve(true),
  reviewTransaction: () => Promise.resolve(true),
  gasLimit: 1500000n,
  maxGasFee: 1n,
});
test("recovery history opens without any wallet and uses only genuine internal destination/owners", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  state.openWallet.mockRejectedValue(Error("wallet cache unavailable"));
  const options = recoveryOptions(f.options.signal);
  const lane = await account.openRecovery(options);
  const actual = state.createRecovery.mock.results[0].value;
  expect(state.openWallet).not.toHaveBeenCalled();
  expect(actual.input.owners.enrollment).toBe(state.enrollments[0]);
  expect(actual.input.destination).toBe(
    state.destination.mock.results[0].value,
  );
  expect(actual.input.reviewDisclosures).toBe(options.reviewDisclosures);
  expect(Object.keys(lane).sort()).toEqual(
    [
      "close",
      "closed",
      "history",
      "resumeProof",
      "signal",
      "submitStored",
    ].sort(),
  );
  const original = Promise.resolve({ records: [] });
  actual.history.mockReturnValue(original);
  expect(lane.history()).toBe(original);
  expect(actual.history).toHaveBeenCalledWith(null);
  await lane.resumeProof("a".repeat(64));
  await lane.submitStored("b".repeat(64));
  expect(actual.resumeProof).toHaveBeenCalledWith("a".repeat(64));
  expect(actual.submitStored).toHaveBeenCalledWith("b".repeat(64));
  await account.close();
});
test("recovery close retains original busy work and its independent closed promise", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  const lane = await account.openRecovery(recoveryOptions(f.options.signal));
  const actual = state.createRecovery.mock.results[0].value,
    held = deferred();
  actual.resumeProof.mockReturnValue(held.promise);
  actual.close.mockImplementation(() => {});
  lane.resumeProof("a".repeat(64));
  let closed = false;
  account.close().then(() => {
    closed = true;
  });
  actual.drain.resolve();
  await tick();
  expect(closed).toBe(false);
  held.resolve({ status: "proof-stored" });
  await account.closed;
  expect(closed).toBe(true);
});
