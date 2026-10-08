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
  assertRailgunFencedAccountEnrollment: (value) => {
    if (!state.enrollments.includes(value) || state.unfenced)
      throw Error("unfenced");
  },
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
  openRailgunCompletedAccountWallet: (input) => state.openCompleted(input),
  readRailgunAccountOwnedNotes: (account, owners) =>
    state.ownedNotes(account, owners),
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
jest.mock("../src/owners/railgun-relay-operation.js", () => ({
  proveRailgunAccountRelayOperation: (options) => state.proveRelay(options),
  listRailgunAccountRelayOperations: (options) => state.listRelay(options),
  resumeRailgunAccountRelayOperation: (options) => state.resumeRelay(options),
  discardRailgunAccountRelayOperation: (options) => state.discardRelay(options),
}));
jest.mock("../src/owners/railgun-relay-transact-staging.js", () => ({
  stageRailgunRelayTransactInput: (options) => state.stageRelay(options),
}));
jest.mock("../src/execution/railgun-relay-quote-data.js", () => ({
  normalizeRailgunRelayQuote: (quote, gas) => ({
    quote: structuredClone(quote),
    gas: structuredClone(gas),
  }),
}));
jest.mock("../src/owners/railgun-account-txid.js", () => ({
  openRailgunAccountTxid: (options) => state.openTxid(options),
}));
jest.mock("../src/owners/railgun-public-services.js", () => ({
  POI_URL: "https://ppoi.fdi.network",
  INDEXER_URL:
    "https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql",
}));
jest.mock("../src/owners/operational-poi-lane.js", () => ({
  createRailgunPoiLane: (input) => state.createPoi(input),
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
  const drain = deferred(),
    controller = new AbortController();
  const value = {
    signal: controller.signal,
    controller,
    originalClosed: drain.promise,
    close: jest.fn(() => {
      controller.abort();
      drain.resolve();
    }),
    drain,
  };
  state.enrollments.push(value);
  return value;
}
function publicOwner() {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    controller,
    coordinator: Object.freeze({}),
    close: jest.fn(() => {
      controller.abort();
      return Promise.resolve();
    }),
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
    openTxid: jest.fn(async () => {
      const result = {
        checkpoint: { state: { count: 4, root: "a".repeat(64) } },
        pending: null,
        serviceLatestIndex: 3,
      };
      return {
        close: jest.fn(() => Promise.resolve()),
        inspect: jest.fn(() => Promise.resolve(result)),
        advance: jest.fn(() => Promise.resolve(result)),
      };
    }),
    openWallet: jest.fn(async () => walletOwner()),
    openCompleted: jest.fn(async () => {
      const controller = new AbortController();
      return { ...walletOwner(), signal: controller.signal, controller };
    }),
    ownedNotes: jest.fn(() => ({
      ownedPoi: [{ id: "selected", type: "Shield" }],
    })),
    proveRelay: jest.fn(() =>
      Promise.resolve({ status: "ready-local", operationId: "a".repeat(64) }),
    ),
    stageRelay: jest.fn(async () => ({
      status: "staged",
      account: walletOwner(),
      receipt: Object.freeze({}),
      close: jest.fn(),
    })),
    listRelay: jest.fn(() => Promise.resolve({ records: [], nextAfter: null })),
    resumeRelay: jest.fn(() =>
      Promise.resolve({ status: "ready-local", operationId: "a".repeat(64) }),
    ),
    discardRelay: jest.fn(() =>
      Promise.resolve({ status: "discarded", operationId: "a".repeat(64) }),
    ),
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
    createPoi: jest.fn((input) => {
      const value = plugin(input);
      for (const name of [
        "prepareShield",
        "prepareTransact",
        "submit",
        "recoverOutput",
        "recoverAttemptedOutput",
      ])
        value[name] = jest.fn(() =>
          Promise.resolve({ status: "refused", stage: "controlled" }),
        );
      return value;
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
      "synchronizeTxid",
      "openRecovery",
      "openPoiRecovery",
      "openRelayLocal",
      "openRelayRecovery",
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
test.each([
  { gasLimit: 0n },
  { gasLimit: 3000001n },
  { gasLimit: 1 },
  { maxGasFee: 0n },
  { maxGasFee: 2000000000000001n },
  { maxGasFee: "1" },
])(
  "invalid recovery gas refuses before lane admission: %p",
  async (invalid) => {
    const f = fixture();
    const account = await f.api.openAccount(f.options);
    expect(() =>
      account.openRecovery({
        ...recoveryOptions(f.options.signal),
        ...invalid,
      }),
    ).toThrow();
    expect(state.createRecovery).not.toHaveBeenCalled();
    expect(account.signal.aborted).toBe(false);
    expect(state.enrollments[0].close).not.toHaveBeenCalled();
    const lane = await account.openRead({
      wallet: "active",
      signal: f.options.signal,
    });
    expect(await lane.instanceId()).toBe("id");
    await account.close();
  },
);
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

const relayOptions = (signal) => ({
  signal,
  wallet: "active",
  review: () => Promise.resolve(true),
  reviewDisclosure: () => Promise.resolve(true),
  reviewStagingDisclosure: () => Promise.resolve(true),
  reviewRootDisclosure: () => Promise.resolve(true),
});
const relayRequest = (signal) => ({
  signal,
  noteId: "selected",
  quote: { original: 1 },
  gas: { price: 1 },
  maxFee: "1",
});
test("Shield local relay keeps all proof ownership private and never stages a Transact receipt", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  const options = relayOptions(f.options.signal),
    lane = await account.openRelayLocal(options);
  const request = relayRequest(f.options.signal),
    result = await lane.prepare(request);
  expect(result).toEqual({
    status: "ready-local",
    operationId: "a".repeat(64),
  });
  expect(Object.keys(lane).sort()).toEqual([
    "close",
    "closed",
    "prepare",
    "signal",
  ]);
  expect(state.stageRelay).not.toHaveBeenCalled();
  const input = state.proveRelay.mock.calls[0][0];
  expect(input.account).toBe(await state.openWallet.mock.results[0].value);
  expect(input.owners.enrollment).toBe(state.enrollments[0]);
  expect(input.request.signal).toBe(request.signal);
  expect(input.review).toBe(options.review);
  expect(input).not.toHaveProperty("stagingReceipt");
  expect(input).not.toHaveProperty("reviewRootDisclosure");
  expect(() => lane.prepare(request)).toThrow();
  await lane.closed;
  await account.close();
});
test("Transact relay retains the exact replacement account, receipt and original request signal", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  state.ownedNotes.mockReturnValue({
    ownedPoi: [{ id: "selected", type: "Transact" }],
  });
  const options = relayOptions(f.options.signal),
    lane = await account.openRelayLocal(options);
  const request = relayRequest(f.options.signal),
    proof = deferred();
  state.proveRelay.mockReturnValue(proof.promise);
  const work = lane.prepare(request);
  await tick();
  const staged = await state.stageRelay.mock.results[0].value;
  const input = state.proveRelay.mock.calls[0][0];
  expect(input.account).toBe(staged.account);
  expect(input.stagingReceipt).toBe(staged.receipt);
  expect(input.request).toBe(state.stageRelay.mock.calls[0][0].request);
  expect(input.request.signal).toBe(request.signal);
  expect(input.reviewRootDisclosure).toBe(options.reviewRootDisclosure);
  request.quote.original = 2;
  expect(input.request.quote.original).toBe(1);
  expect(staged.close).not.toHaveBeenCalled();
  proof.resolve({ status: "ready-local", operationId: "b".repeat(64) });
  await work;
  await lane.closed;
  expect(staged.close).toHaveBeenCalledTimes(1);
  expect(staged.account.close).toHaveBeenCalledTimes(1);
  await account.close();
});
test("late Transact replacement after cancellation is closed without proof or lost drain", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  state.ownedNotes.mockReturnValue({
    ownedPoi: [{ id: "selected", type: "Transact" }],
  });
  const lane = await account.openRelayLocal(relayOptions(f.options.signal));
  const staging = deferred(),
    closing = deferred();
  state.stageRelay.mockReturnValue(staging.promise);
  const work = lane.prepare(relayRequest(f.options.signal));
  work.catch(() => {});
  lane.close();
  let closed = false;
  lane.closed.then(() => {
    closed = true;
  });
  const late = {
    status: "staged",
    account: { close: jest.fn(() => closing.promise) },
    receipt: Object.freeze({}),
    close: jest.fn(),
  };
  staging.resolve(late);
  await expect(work).rejects.toThrow();
  await tick();
  expect(state.proveRelay).not.toHaveBeenCalled();
  expect(closed).toBe(false);
  expect(late.account.close).toHaveBeenCalledTimes(1);
  closing.resolve();
  await lane.closed;
  expect(closed).toBe(true);
  await account.close();
});
test("typed staging drain failure remains exclusion, with no proof or automatic retry", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  state.ownedNotes.mockReturnValue({
    ownedPoi: [{ id: "selected", type: "Transact" }],
  });
  const lane = await account.openRelayLocal(relayOptions(f.options.signal));
  const failure = Object.assign(Error("original staging drain"), {
    code: "RAILGUN_RELAY_TRANSACT_STAGING_DRAIN_FAILED",
  });
  state.stageRelay.mockRejectedValue(failure);
  await expect(lane.prepare(relayRequest(f.options.signal))).rejects.toBe(
    failure,
  );
  await expect(lane.closed).rejects.toBe(failure);
  expect(state.proveRelay).not.toHaveBeenCalled();
  await expect(account.close()).rejects.toBe(failure);
  expect(() => f.api.openAccount(f.options)).toThrow();
});
test("completed relay uses one original account and no new quote, disclosure, stage or lifetime option", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  const lane = await account.openRelayRecovery({ signal: f.options.signal });
  const actual = await state.openCompleted.mock.results[0].value;
  expect(state.openWallet).not.toHaveBeenCalled();
  const opening = state.openCompleted.mock.calls[0][0];
  expect(opening).not.toHaveProperty("timeoutMs");
  expect(opening).not.toHaveProperty("mode");
  expect(opening.destination).toBe(state.destination.mock.results[0].value);
  const original = Promise.resolve({ records: [] });
  state.listRelay.mockReturnValue(original);
  expect(lane.list()).toBe(original);
  await original;
  await tick();
  await lane.resume("a".repeat(64));
  await tick();
  await lane.discard("b".repeat(64));
  await tick();
  expect(state.openCompleted).toHaveBeenCalledTimes(1);
  for (const spy of [state.listRelay, state.resumeRelay, state.discardRelay]) {
    expect(spy.mock.calls[0][0].account).toBe(actual);
    expect(spy.mock.calls[0][0]).not.toHaveProperty("quote");
    expect(spy.mock.calls[0][0]).not.toHaveProperty("review");
    expect(spy.mock.calls[0][0]).not.toHaveProperty("timeoutMs");
  }
  expect(state.stageRelay).not.toHaveBeenCalled();
  expect(state.proveRelay).not.toHaveBeenCalled();
  actual.controller.abort();
  await lane.closed;
  expect(() => lane.list()).toThrow();
  await account.close();
});
test("legacy unfenced enrollment cannot acquire either relay lane", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  state.unfenced = true;
  await expect(
    account.openRelayLocal(relayOptions(f.options.signal)),
  ).rejects.toThrow("unfenced");
  await expect(
    account.openRelayRecovery({ signal: f.options.signal }),
  ).rejects.toThrow("unfenced");
  expect(state.openWallet).not.toHaveBeenCalled();
  expect(state.openCompleted).not.toHaveBeenCalled();
  await account.close();
});

test("await-then-action sees the original settled lane and cold method immediately", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  const read = await account.openRead(laneOptions(f.options.signal));
  read.close();
  await read.closed;
  const recovery = await account.openRecovery(
    recoveryOptions(f.options.signal),
  );
  recovery.close();
  await recovery.closed;
  const cold = await account.openRelayRecovery({ signal: f.options.signal });
  await cold.list();
  await cold.resume("a".repeat(64));
  await cold.discard("b".repeat(64));
  cold.close();
  await cold.closed;
  await account.advancePublic({ to: 1, anchor: "public" });
  await account.close();
});

test.each([
  ["initialize", true, false],
  ["advance", false, false],
  ["checkpoint", false, true],
])(
  "TXID %s reviews before opening and delegates exact fixed mode once",
  async (mode, create, checkpointOnly) => {
    const f = fixture(),
      account = await f.api.openAccount(f.options);
    const review = jest.fn((summary) => {
      expect(state.openTxid).not.toHaveBeenCalled();
      expect(summary).toMatchObject({
        purpose: "railgun-public-txid-synchronization-disclosure-v1",
        mode,
        createIfMissing: create,
        selectedMembershipPermitted: false,
        selectedNullifierQueryPermitted: false,
      });
      expect(summary.queries[1].exactPointAvailableBeforeOpen).toBe(false);
      expect(summary.queries.some((v) => v.method === "txidPage")).toBe(
        !checkpointOnly,
      );
      return Promise.resolve(true);
    });
    const outcome = await account.synchronizeTxid({
      mode,
      signal: f.options.signal,
      reviewDisclosure: review,
    });
    expect(outcome).toEqual({
      count: 4,
      root: "a".repeat(64),
      checkpointAvailable: true,
      capacityReached: false,
      serviceLatestIndex: 3,
      pending: false,
      unverified: true,
      spendingEnabled: false,
    });
    const input = state.openTxid.mock.calls[0][0],
      actual = await state.openTxid.mock.results[0].value;
    expect(input).toMatchObject({
      enrollment: state.enrollments[0],
      archive: runtime.archive,
      create,
      checkpointOnly,
    });
    expect(Object.keys(input).sort()).toEqual(
      [
        "archive",
        "checkpointOnly",
        "coordinator",
        "create",
        "enrollment",
        "signal",
      ].sort(),
    );
    expect(
      actual[checkpointOnly ? "inspect" : "advance"],
    ).toHaveBeenCalledTimes(1);
    expect(
      actual[checkpointOnly ? "advance" : "inspect"],
    ).not.toHaveBeenCalled();
    expect(actual.close).toHaveBeenCalledTimes(1);
    await account.close();
  },
);
test("declined TXID consent does not open storage/services and leaves account reusable", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  await expect(
    account.synchronizeTxid({
      mode: "initialize",
      signal: f.options.signal,
      reviewDisclosure: () => Promise.resolve(false),
    }),
  ).rejects.toThrow();
  expect(state.openTxid).not.toHaveBeenCalled();
  expect(account.describe().accountIndex).toBe(0);
  const lane = await account.openRead(laneOptions(f.options.signal));
  lane.close();
  await lane.closed;
  await account.close();
});
test("TXID original review promise holds close and exclusion until it actually settles", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options),
    held = deferred();
  const work = account.synchronizeTxid({
    mode: "advance",
    signal: f.options.signal,
    reviewDisclosure: () => held.promise,
  });
  work.catch(() => {});
  let closed = false;
  account.close().then(() => {
    closed = true;
  });
  await tick();
  expect(closed).toBe(false);
  expect(state.openTxid).not.toHaveBeenCalled();
  expect(() => f.api.openAccount(f.options)).toThrow();
  held.resolve(true);
  await expect(work).rejects.toThrow();
  await account.closed;
  expect(closed).toBe(true);
});
test("late native true cannot bypass actual 30-second TXID review deadline when timer is delayed", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  let now = 100;
  const clock = jest.spyOn(performance, "now").mockImplementation(() => now);
  try {
    await expect(
      account.synchronizeTxid({
        mode: "checkpoint",
        signal: f.options.signal,
        reviewDisclosure: () => {
          now = 30100;
          return Promise.resolve(true);
        },
      }),
    ).rejects.toThrow();
    expect(state.openTxid).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
    await account.close();
  }
});
test("already fulfilled object with a later then cannot turn into TXID approval", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options),
    value = {},
    original = Promise.resolve(value),
    called = jest.fn();
  await expect(
    account.synchronizeTxid({
      mode: "advance",
      signal: f.options.signal,
      reviewDisclosure: () => {
        value.then = called;
        return original;
      },
    }),
  ).rejects.toThrow();
  expect(called).not.toHaveBeenCalled();
  expect(state.openTxid).not.toHaveBeenCalled();
  await account.close();
});
test("unknown thenable review quarantines facade admission without opening TXID", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options),
    called = jest.fn();
  await expect(
    account.synchronizeTxid({
      mode: "advance",
      signal: f.options.signal,
      reviewDisclosure: () => ({ then: called }),
    }),
  ).rejects.toMatchObject({ code: "RAILGUN_WALLET_EXIT_UNOBSERVED" });
  await expect(account.closed).rejects.toMatchObject({
    code: "RAILGUN_WALLET_EXIT_UNOBSERVED",
  });
  expect(called).not.toHaveBeenCalled();
  expect(state.openTxid).not.toHaveBeenCalled();
  expect(() => f.api.openAccount(f.options)).toThrow();
});
test("TXID return waits original worker drain and late cancellation still closes exact owner", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options),
    held = deferred(),
    drain = deferred();
  state.openTxid.mockReturnValue(held.promise);
  const work = account.synchronizeTxid({
    mode: "advance",
    signal: f.options.signal,
    reviewDisclosure: () => true,
  });
  work.catch(() => {});
  await tick();
  let closed = false;
  account.close().then(() => {
    closed = true;
  });
  const late = { close: jest.fn(() => drain.promise), advance: jest.fn() };
  held.resolve(late);
  await tick();
  expect(late.close).toHaveBeenCalledTimes(1);
  expect(late.advance).not.toHaveBeenCalled();
  expect(closed).toBe(false);
  drain.resolve();
  await expect(work).rejects.toThrow();
  await account.closed;
  expect(closed).toBe(true);
});

test("an original cleanup rejection without an Error cannot become successful closure", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options);
  (await state.openPublic.mock.results[0].value).close.mockImplementation(() =>
    Promise.reject(undefined),
  );
  await expect(account.close()).rejects.toMatchObject({
    code: "RAILGUN_ACCOUNT_FACADE_REFUSED",
  });
  expect(() => f.api.openAccount(f.options)).toThrow();
});
test("a rejected review error getter is never executed by bookkeeping", async () => {
  const f = fixture(),
    account = await f.api.openAccount(f.options),
    getter = jest.fn(() => {
      throw Error("getter");
    });
  const error = {};
  Object.defineProperty(error, "code", { get: getter });
  await expect(
    account.synchronizeTxid({
      mode: "advance",
      signal: f.options.signal,
      reviewDisclosure: () => Promise.reject(error),
    }),
  ).rejects.toBe(error);
  expect(getter).not.toHaveBeenCalled();
  expect(state.openTxid).not.toHaveBeenCalled();
  await account.close();
});

test.each(["identity", "enrollment", "public"])(
  "genuine %s revocation closes the whole session, including its signal",
  async (kind) => {
    const f = fixture(),
      account = await f.api.openAccount(f.options);
    const owner =
      kind === "identity"
        ? await state.openIdentity.mock.results[0].value
        : kind === "enrollment"
          ? state.enrollments[0]
          : await state.openPublic.mock.results[0].value;
    if (kind === "identity") owner.close();
    else owner.controller.abort();
    expect(account.signal.aborted).toBe(true);
    expect(() => account.describe()).toThrow();
    await account.closed;
  },
);

test.each([false, true])(
  "TXID original drain failure overrides operation outcome (operation fails: %s)",
  async (operationFails) => {
    const f = fixture();
    const account = await f.api.openAccount(f.options);
    const drain = deferred();
    const operationError = Error("operation failed");
    const cleanupError = Error("original cleanup failed");
    const txid = {
      advance: jest.fn(() =>
        operationFails
          ? Promise.reject(operationError)
          : Promise.resolve({
              checkpoint: { state: { count: 1, root: "a".repeat(64) } },
              pending: null,
              serviceLatestIndex: 0,
            }),
      ),
      close: jest.fn(() => drain.promise),
    };
    state.openTxid.mockResolvedValue(txid);
    const original = account.synchronizeTxid({
      mode: "advance",
      signal: f.options.signal,
      reviewDisclosure: () => true,
    });
    let settled = false;
    original.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await tick();
    expect(txid.close).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    drain.reject(cleanupError);
    await expect(original).rejects.toBe(cleanupError);
    await expect(account.closed).rejects.toBe(cleanupError);
    expect(() => f.api.openAccount(f.options)).toThrow();
  },
);

test("retained POI companion uses fixed owners and excludes simultaneous lanes", async () => {
  const f = fixture(),
    session = await f.api.openAccount(f.options);
  const reviewDisclosures = jest.fn(() => true);
  const lane = await session.openPoiRecovery({
    signal: f.caller.signal,
    reviewDisclosures,
  });
  expect(Object.keys(lane).sort()).toEqual(
    [
      "prepareShield",
      "prepareTransact",
      "submit",
      "recoverOutput",
      "recoverAttemptedOutput",
      "signal",
      "closed",
      "close",
    ].sort(),
  );
  const original = state.createPoi.mock.results[0].value;
  expect(original.input.owners.enrollment).toBe(state.enrollments[0]);
  expect(original.input.reviewDisclosures).toBe(reviewDisclosures);
  expect(() => session.openRead(laneOptions(f.caller.signal))).toThrow();
  expect(() =>
    session.openPoiRecovery({
      signal: f.caller.signal,
      reviewDisclosures,
      proof: {},
    }),
  ).toThrow();
  await lane.prepareShield("a".repeat(64));
  expect(original.prepareShield).toHaveBeenCalledWith("a".repeat(64));
  const other = await f.api.openAccount({ ...f.options, accountIndex: 1 });
  expect(state.createPoi).toHaveBeenCalledTimes(1);
  lane.close();
  await lane.closed;
  await session.close();
  await other.close();
});
test("retained POI unknown original drain preserves account exclusion", async () => {
  const f = fixture(),
    session = await f.api.openAccount(f.options);
  const lane = await session.openPoiRecovery({
    signal: f.caller.signal,
    reviewDisclosures: () => true,
  });
  const original = state.createPoi.mock.results[0].value;
  original.close.mockImplementation(() =>
    original.drain.reject(Error("original unknown")),
  );
  lane.close();
  await expect(lane.closed).rejects.toThrow("original unknown");
  await expect(session.closed).rejects.toThrow("original unknown");
  expect(() => f.api.openAccount(f.options)).toThrow();
});
