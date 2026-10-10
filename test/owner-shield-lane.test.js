/** Boundary tests; original receipt/finality/permit algorithms have their own
 * staged suites. These doubles measure admission, projection and lifetime. */
"use strict";
let state;
jest.mock("../src/owners/railgun-account-enrollment.js", () => ({
  isRailgunAccountEnrollment: (value) => value === state.enrollment,
}));
jest.mock("../src/owners/railgun-identity.js", () => ({
  assertRailgunIdentity: (value, handle) => {
    if (value !== state.identity || handle !== state.handle)
      throw Error("identity");
    return state.descriptor;
  },
}));
jest.mock("../src/owners/railgun-account-public.js", () => ({
  assertRailgunAccountPublicDestination: (
    coordinator,
    enrollment,
    destination,
  ) => {
    if (
      coordinator !== state.coordinator ||
      enrollment !== state.enrollment ||
      destination !== state.destination ||
      state.foreignDestination
    )
      throw Error("destination");
  },
}));
jest.mock("../src/owners/context-bindings.js", () => ({
  getPrivacyContext: (handle) => state.contexts.get(handle),
}));
jest.mock("../src/owners/railgun-shield-recovery.js", () => ({
  openRailgunShieldRecovery: (...args) => state.open(...args),
}));
jest.mock("../src/owners/host-bindings.js", () => ({
  submitter: { readMetadata: () => state.metadata },
  sessions: {
    openPrivacySession: () => ({
      getContext: (subject) => {
        state.contexts.set(state.journalHandle, {
          profileId: state.journalProfile,
          subject,
        });
        return state.journalHandle;
      },
    }),
  },
  submissionJournal: {
    readExistingPrivateSubmissionSnapshot: (handle) => state.snapshot(handle),
  },
  rpc: {
    createPrivateRpc: (...args) => state.createRpc(...args),
    getPrivateRpcDestination: () => state.rpcDestination,
    assertPrivateRpcDestination: () => state.rpcDestination,
    getPrivateRpcDestinationDetails: (observation) =>
      observation === state.destination
        ? state.sourceDetails
        : state.rpcDetails,
    createPrivateRpcDestinationConstraint: (options) =>
      state.constraint(options),
  },
}));
const HASH = "0x" + "1".repeat(64),
  EOA = "0x" + "a1".repeat(20);
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
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function fixture() {
  jest.resetModules();
  const controller = new AbortController(),
    identity = { signal: controller.signal },
    coordinator = { signal: controller.signal },
    handle = {},
    journalHandle = {},
    descriptor = { instanceId: "fixture" };
  const enrollment = {
    signal: controller.signal,
    descriptor,
    getContext: () => handle,
  };
  const record = {
    hash: HASH,
    nonce: 0,
    intent: {
      kind: "railgun-native-shield",
      digest: "secret-intent",
      npk: "secret-note",
    },
    observation: {
      status: "included",
      blockNumber: 10,
      blockHash: "0x" + "2".repeat(64),
      confirmations: 12,
    },
  };
  state = {
    controller,
    identity,
    coordinator,
    handle,
    journalHandle,
    descriptor,
    enrollment,
    contexts: new Map([
      [handle, { profileId: "alice", subject: { chainId: 11155111 } }],
    ]),
    journalProfile: "alice",
    metadata: { index: 0, type: "mnemonic", address: EOA },
    destination: {},
    rpcDestination: {},
    sourceDetails: {
      url: "https://rpc.invalid/",
      transport: "tor",
      chainId: 11155111,
      role: "rpc",
    },
    rpcDetails: {
      url: "https://rpc.invalid/",
      transport: "tor",
      chainId: 11155111,
      role: "transaction-rpc",
    },
    records: [record],
    archive: [],
    snapshot: jest.fn(async () => ({
      records: state.records,
      archive: state.archive,
    })),
    createRpc: jest.fn(() => ({})),
    constraint: jest.fn(() => ({ constraint: {}, close: jest.fn() })),
    shield: { status: "matched", npk: "secret", position: 5 },
  };
  const recovery = {
    closed: Promise.resolve(),
    close: jest.fn(),
    observe: jest.fn(async () => ({ record, shield: state.shield })),
    resolve: jest.fn(async (_hash, options) => {
      state.decision = await options.review({
        transactionHash: HASH,
        observation: record.observation,
        shield: state.shield,
        finalized: { number: 20 },
      });
      return {
        ...record,
        resolution: {
          railgun: {
            outcome: state.shield ? "matched" : "reverted",
            finalizedBlockNumber: 20,
          },
        },
      };
    }),
  };
  state.open = jest.fn(() => recovery);
  const options = {
    owners: { identity, enrollment, coordinator },
    destination: state.destination,
    signal: controller.signal,
    reviewDisclosures: jest.fn(() => true),
    reviewResolution: jest.fn(() => true),
  };
  const create =
    require("../src/owners/operational-shield-lane.js").createRailgunShieldLane;
  return { create, options, recovery, record };
}
afterEach(() => state?.controller.abort());
test("open and local list never instantiate RPC or disclose note facts; archive included", async () => {
  const f = fixture(),
    lane = f.create(f.options);
  state.archive = [
    {
      ...f.record,
      hash: "0x" + "3".repeat(64),
      resolution: { railgun: { outcome: "matched" } },
    },
  ];
  const rows = await lane.list();
  expect(rows).toHaveLength(2);
  expect(rows[1].resolved).toBe(true);
  expect(Object.isFrozen(rows[0])).toBe(true);
  expect(JSON.stringify(rows)).not.toMatch(/secret|npk|intent/);
  expect(state.createRpc).not.toHaveBeenCalled();
  expect(state.open).not.toHaveBeenCalled();
  expect(f.options.reviewDisclosures).not.toHaveBeenCalled();
  lane.close();
  await lane.closed;
});
test("incomplete journal never becomes an empty successful list", async () => {
  const f = fixture(),
    lane = f.create(f.options);
  state.snapshot.mockRejectedValue(Error("secret"));
  await expect(lane.list()).rejects.toMatchObject({
    code: "RAILGUN_SHIELD_FACADE_REFUSED",
  });
  expect(state.open).not.toHaveBeenCalled();
  lane.close();
  await lane.closed;
});
test("observation uses fixed EOA, constrained endpoint and a small projection", async () => {
  const f = fixture(),
    lane = f.create(f.options),
    result = await lane.observe(HASH);
  expect(state.open).toHaveBeenCalledWith(EOA, {
    signal: lane.signal,
    destinationConstraint: state.constraint.mock.results[0].value.constraint,
  });
  expect(f.options.reviewDisclosures.mock.calls[0][0].requests).toContain(
    "eth_getTransactionReceipt",
  );
  expect(result).toMatchObject({
    shield: { status: "matched" },
    retryEnabled: false,
  });
  expect(JSON.stringify(result)).not.toMatch(/secret|npk|intent/);
  expect(f.recovery.close).toHaveBeenCalledTimes(1);
  lane.close();
  await lane.closed;
});
test.each(["matched", "reverted"])(
  "resolves %s only through original owner and explicit resolution review",
  async (outcome) => {
    const f = fixture(),
      lane = f.create(f.options);
    if (outcome === "reverted") {
      state.shield = null;
      f.record.observation.status = "reverted";
    }
    expect(
      await lane.resolve(HASH, { minimumConfirmations: 12 }),
    ).toMatchObject({ status: "resolved", outcome });
    expect(state.decision).toEqual({
      allowNextTransaction: true,
      acceptedEvidence: "unverified-rpc",
    });
    expect(f.options.reviewResolution).toHaveBeenCalledTimes(1);
    expect(f.recovery.resolve.mock.calls[0][1].reviewTimeoutMs).toBe(120000);
    lane.close();
    await lane.closed;
  },
);
test.each([
  "unknown hash",
  "resolved",
  "foreign endpoint",
  "foreign profile",
  "foreign EOA",
  "destination changed",
])("%s refuses before recovery requests", async (scenario) => {
  const f = fixture();
  if (scenario === "foreign profile") {
    state.journalProfile = "bob";
    expect(() => f.create(f.options)).toThrow();
    return;
  }
  const lane = f.create(f.options);
  if (scenario === "resolved") f.record.resolution = {};
  if (scenario === "foreign endpoint")
    state.rpcDetails.url = "https://other.invalid/";
  if (scenario === "foreign EOA")
    state.metadata.address = "0x" + "b1".repeat(20);
  if (scenario === "destination changed") state.foreignDestination = true;
  await expect(
    lane.observe(scenario === "unknown hash" ? "0x" + "9".repeat(64) : HASH),
  ).rejects.toThrow();
  expect(state.open).not.toHaveBeenCalled();
  lane.close();
  await lane.closed;
});
test("declined disclosure never opens the original recovery owner", async () => {
  const f = fixture(),
    lane = f.create(f.options);
  f.options.reviewDisclosures.mockReturnValue(false);
  await expect(lane.observe(HASH)).rejects.toThrow();
  expect(state.open).not.toHaveBeenCalled();
  lane.close();
  await lane.closed;
});
test("a non-native review thenable is not adopted and quarantines closure", async () => {
  const f = fixture(),
    lane = f.create(f.options),
    then = jest.fn();
  f.options.reviewDisclosures.mockReturnValue({ then });
  await expect(lane.observe(HASH)).rejects.toThrow();
  expect(then).not.toHaveBeenCalled();
  await expect(lane.closed).rejects.toMatchObject({
    code: "RAILGUN_SHIELD_FACADE_DRAIN_UNOBSERVED",
  });
});
test("cancellation retains the original review and same-EOA exclusion until it settles", async () => {
  const f = fixture(),
    lane = f.create(f.options),
    gate = deferred();
  f.options.reviewDisclosures.mockReturnValue(gate.promise);
  const work = lane.observe(HASH);
  work.catch(() => {});
  await tick();
  lane.close();
  const done = jest.fn();
  lane.closed.then(done);
  await tick();
  expect(done).not.toHaveBeenCalled();
  expect(() =>
    f.create({ ...f.options, signal: new AbortController().signal }),
  ).toThrow();
  gate.resolve(true);
  await expect(work).rejects.toThrow();
  await lane.closed;
  const second = f.create(f.options);
  second.close();
  await second.closed;
});
test("original recovery drain is observed before lane closure and exclusion release", async () => {
  const f = fixture(),
    lane = f.create(f.options),
    gate = deferred();
  f.recovery.closed = gate.promise;
  const work = lane.observe(HASH);
  await tick();
  lane.close();
  const done = jest.fn();
  lane.closed.then(done);
  await tick();
  expect(done).not.toHaveBeenCalled();
  expect(() => f.create(f.options)).toThrow();
  gate.resolve();
  await work;
  await lane.closed;
  const second = f.create(f.options);
  second.close();
  await second.closed;
});
test("a refused original drain quarantines", async () => {
  const f = fixture(),
    lane = f.create(f.options);
  f.recovery.closed = Promise.reject(Error("drain"));
  f.recovery.closed.catch(() => {});
  await expect(lane.observe(HASH)).rejects.toThrow();
  lane.close();
  await expect(lane.closed).rejects.toThrow();
});
test("one operation at a time and exact argument schemas", async () => {
  const f = fixture(),
    lane = f.create(f.options),
    gate = deferred();
  state.snapshot.mockReturnValue(gate.promise);
  const work = lane.list();
  await expect(lane.observe(HASH)).rejects.toThrow();
  gate.resolve({ records: [], archive: [] });
  await work;
  await expect(lane.list({})).rejects.toThrow();
  await expect(
    lane.resolve(HASH, { minimumConfirmations: 2 }),
  ).rejects.toThrow();
  await expect(
    lane.resolve(HASH, { minimumConfirmations: 12, review: () => true }),
  ).rejects.toThrow();
  lane.close();
  await lane.closed;
});

test("missing journal retains a distinct closed code", async () => {
  const f = fixture(),
    lane = f.create(f.options);
  state.snapshot.mockRejectedValue(
    Object.assign(Error("unretained"), { code: "PRIVATE_JOURNAL_UNAVAILABLE" }),
  );
  await expect(lane.list()).rejects.toMatchObject({
    code: "PRIVATE_JOURNAL_UNAVAILABLE",
  });
  lane.close();
  await lane.closed;
});
test("a cancelled return after durable resolution must be re-listed, never treated as unsent", async () => {
  const f = fixture(),
    lane = f.create(f.options),
    original = f.recovery.resolve.getMockImplementation();
  f.recovery.resolve.mockImplementation(async (...args) => {
    const result = await original(...args);
    f.record.resolution = result.resolution;
    lane.close();
    return result;
  });
  await expect(
    lane.resolve(HASH, { minimumConfirmations: 12 }),
  ).rejects.toThrow();
  await lane.closed;
  const fresh = f.create(f.options);
  expect(await fresh.list()).toEqual([
    expect.objectContaining({ transactionHash: HASH, resolved: true }),
  ]);
  await expect(
    fresh.resolve(HASH, { minimumConfirmations: 12 }),
  ).rejects.toThrow();
  fresh.close();
  await fresh.closed;
});
test("destination lifetime starts after disclosure consent, leaving the full original network window", async () => {
  const f = fixture(),
    lane = f.create(f.options);
  f.options.reviewDisclosures.mockImplementation(() => {
    expect(state.constraint).not.toHaveBeenCalled();
    return true;
  });
  const start = performance.now();
  await lane.observe(HASH);
  expect(
    state.constraint.mock.calls[0][0].deadline - start,
  ).toBeGreaterThanOrEqual(300000);
  lane.close();
  await lane.closed;
});
