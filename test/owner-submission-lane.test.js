/** Fixed held-submission companion: no native, service, crypto or profile reads. */
"use strict";
let state;
jest.mock("../src/owners/railgun-account-enrollment.js", () => ({
  isRailgunAccountEnrollment: (value) => state.enrollments.has(value),
}));
jest.mock("../src/owners/railgun-identity.js", () => ({
  assertRailgunIdentity: (identity, handle) => {
    if (identity !== state.identity || handle !== state.handle)
      throw Error("foreign identity");
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
      destination !== state.destination
    )
      throw Error("foreign coordinator");
  },
}));
jest.mock("../src/owners/railgun-transact-recovery.js", () => ({
  openRailgunTransactRecovery: (owner) => state.openRecovery(owner),
}));
jest.mock("../src/owners/host-bindings.js", () => ({
  submitter: { readMetadata: () => state.metadata },
  rpc: {
    getPrivateRpcDestinationDetails: (observation) =>
      state.destinationDetails(observation),
  },
  sessions: {
    openPrivacySession: () => ({
      getContext: (subject) => {
        const journalHandle = {};
        state.contexts.set(journalHandle, state.journalContext(subject));
        return journalHandle;
      },
    }),
  },
}));
jest.mock("../src/owners/context-bindings.js", () => ({
  getPrivacyContext: (handle) => state.contexts.get(handle),
}));
const hex = (character) => character.repeat(64);
const SUBMITTER = "0x" + "c0".repeat(20);
const HOLD = hex("1");
const tick = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function intent(overrides = {}) {
  return {
    kind: "railgun-transact",
    operation: "railgun-private-transfer",
    tree: 0,
    merkleRoot: "0x" + hex("4"),
    nullifier: "0x" + hex("3"),
    commitment: "0x" + hex("5"),
    intentDigest: "0x" + hex("6"),
    digest: "0x" + hex("7"),
    ...overrides,
  };
}
function fixture() {
  jest.resetModules();
  const controller = new AbortController();
  const descriptor = { walletId: hex("a") },
    handle = {},
    identity = { signal: controller.signal },
    coordinator = { signal: controller.signal };
  const row = {
    entry: {
      id: HOLD,
      state: "signing",
      facts: {
        kind: "railgun-private-transfer",
        noteHash: "0x" + hex("2"),
        nullifier: "0x" + hex("3"),
        tree: 0,
        position: 1,
        intentDigest: "0x" + hex("6"),
      },
      signing: { submitter: SUBMITTER },
    },
    receipt: {},
  };
  const reservations = {
    assertReceiptContext: jest.fn(),
    assertReceipt: jest.fn(async () => row.entry),
    withSigningRecovery: jest.fn(async (use) =>
      use([row], { assertCurrent: jest.fn() }),
    ),
  };
  const enrollment = {
    descriptor,
    signal: controller.signal,
    getContext: jest.fn(() => handle),
    openReservations: jest.fn(async () => reservations),
  };
  const sent = {
    hash: "0x" + hex("8"),
    nonce: 4,
    intent: intent(),
    observation: {
      status: "included",
      blockNumber: 100,
      blockHash: "0x" + hex("9"),
      confirmations: 5,
    },
  };
  const matched = {
    status: "matched",
    transactionHash: sent.hash,
    blockHash: sent.observation.blockHash,
    blockNumber: "0x64",
    operation: "railgun-private-transfer",
    inputTree: 0,
    nullifier: sent.intent.nullifier,
    commitment: sent.intent.commitment,
    intentDigest: sent.intent.intentDigest,
    output: { kind: "shielded", tree: 0, position: 7, ciphertext: "secret" },
    trust: "unverified-rpc",
    spendingEnabled: false,
  };
  const recoveryController = new AbortController();
  const recovery = {
    list: jest.fn(async () => state.records),
    observe: jest.fn(async (hash) => ({
      record: state.records.find((record) => record.hash === hash),
      transact: state.transact,
    })),
    resolve: jest.fn(async (hash, { minimumConfirmations, review }) => {
      const record = state.records.find((value) => value.hash === hash);
      state.decision = await review({
        action: "allow-next-transaction",
        transactionHash: hash,
        nonce: record.nonce,
        observation: record.observation,
        minimumConfirmations,
        expiresAt: Date.now() + 1000,
        transact: state.transact,
        finalized: { number: 120, hash: "0x" + hex("b") },
      });
      return {
        ...record,
        resolution: {
          railgun: {
            outcome: state.transact ? "matched" : "reverted",
            finalizedBlockNumber: 121,
            finalizedBlockHash: "0x" + hex("b"),
            transact: state.transact,
          },
          blockHash: record.observation.blockHash,
          minimumConfirmations,
        },
      };
    }),
    close: jest.fn(() => recoveryController.abort()),
    signal: recoveryController.signal,
    destination: Object.freeze({}),
    assertDestination: jest.fn(),
  };
  state = {
    descriptor,
    handle,
    identity,
    coordinator,
    enrollment,
    destination: {},
    enrollments: new WeakSet([enrollment]),
    metadata: { index: 0, type: "mnemonic", address: SUBMITTER },
    records: [
      { hash: "0x" + hex("c"), nonce: 1, intent: { kind: "ordinary" } },
      {
        ...sent,
        hash: "0x" + hex("d"),
        intent: intent({ intentDigest: "0x" + hex("e") }),
      },
      sent,
    ],
    transact: matched,
    openRecovery: jest.fn(() => recovery),
    contexts: new Map([
      [handle, { profileId: "profile-a", subject: { chainId: 11155111 } }],
    ]),
    journalContext: jest.fn((subject) => ({
      profileId: "profile-a",
      subject: { ...subject },
    })),
    destinationDetails: jest.fn((observation) => {
      if (observation !== recovery.destination)
        throw Error("foreign observation");
      return {
        version: 1,
        url: "https://rpc.example/",
        chainId: 11155111,
        role: "transaction-rpc",
        transport: "tor-experimental",
      };
    }),
  };
  const input = {
    owners: { identity, enrollment, coordinator },
    destination: state.destination,
    signal: controller.signal,
    reviewDisclosures: jest.fn(() => true),
  };
  const {
    createRailgunSubmissionLane,
  } = require("../src/owners/operational-submission-lane.js");
  return {
    input,
    createRailgunSubmissionLane,
    controller,
    row,
    reservations,
    sent,
    matched,
    recovery,
  };
}

test("observe binds only the exact held intent and projects public outcome fields", async () => {
  const f = fixture();
  const lane = f.createRailgunSubmissionLane(f.input);
  const value = await lane.observe(HOLD);
  expect(f.reservations.withSigningRecovery).toHaveBeenCalledTimes(1);
  expect(state.openRecovery).toHaveBeenCalledWith(SUBMITTER);
  expect(f.recovery.observe).toHaveBeenCalledWith(f.sent.hash);
  expect(f.recovery.close).toHaveBeenCalledTimes(1);
  expect(value).toEqual({
    status: "journaled",
    holdId: HOLD,
    kind: "railgun-private-transfer",
    transactionHash: f.sent.hash,
    observation: f.sent.observation,
    transact: {
      status: "matched",
      operation: "railgun-private-transfer",
      blockNumber: 100,
      blockHash: f.sent.observation.blockHash,
    },
    output: { kind: "shielded", noteId: "0:7" },
    resolved: false,
    trust: "unverified-rpc",
    submissionEnabled: false,
    retryEnabled: false,
  });
  expect(Object.isFrozen(value.output)).toBe(true);
  const text = JSON.stringify(value);
  for (const secret of [
    f.sent.intent.nullifier,
    f.sent.intent.commitment,
    f.sent.intent.intentDigest,
    "secret",
  ])
    expect(text).not.toContain(secret);
  const [summary] = f.input.reviewDisclosures.mock.calls[0];
  expect(summary).toEqual({
    purpose: "railgun-held-submission-observation-v1",
    chainId: 11155111,
    holdId: HOLD,
    operation: "railgun-private-transfer",
    submitter: SUBMITTER,
    destinationRole: "transaction-rpc",
    destination: { url: "https://rpc.example/", transport: "tor-experimental" },
    requests: [
      "eth_blockNumber",
      "eth_chainId",
      "eth_getBlockByNumber",
      "eth_getTransactionByHash",
      "eth_getTransactionCount",
      "eth_getTransactionReceipt",
    ],
    disclosures: [
      "public-submitter",
      "journaled-transaction-hash",
      "nonce-reconciliation",
      "observation-timing",
    ],
    signingEnabled: false,
    sendEnabled: false,
    retryEnabled: false,
    holdReleaseEnabled: false,
  });
  lane.close();
  await lane.closed;
});

test.each(["intentDigest", "nullifier", "tree", "operation"])(
  "a journal row differing only in %s is not the held submission",
  async (field) => {
    const f = fixture();
    const changed = {
      intentDigest: "0x" + hex("f"),
      nullifier: "0x" + hex("f"),
      tree: 1,
      operation: "railgun-token-unshield",
    }[field];
    state.records = [{ ...f.sent, intent: intent({ [field]: changed }) }];
    const lane = f.createRailgunSubmissionLane(f.input);
    await expect(lane.observe(HOLD)).resolves.toEqual({
      status: "unjournaled",
      holdId: HOLD,
      kind: "railgun-private-transfer",
      transactionHash: null,
      submissionEnabled: false,
      retryEnabled: false,
    });
    expect(f.recovery.observe).not.toHaveBeenCalled();
    expect(f.recovery.close).toHaveBeenCalledTimes(1);
  },
);

test("an empty journal stays unjournaled; it never selects the last row", async () => {
  const f = fixture();
  state.records = [
    { hash: "0x" + hex("c"), nonce: 9, intent: { kind: "ordinary" } },
  ];
  const lane = f.createRailgunSubmissionLane(f.input);
  const value = await lane.observe(HOLD);
  expect(value.status).toBe("unjournaled");
  expect(value.transactionHash).toBeNull();
  expect(f.recovery.observe).not.toHaveBeenCalled();
});

test("two rows with the exact held intent are ambiguous and refuse", async () => {
  const f = fixture();
  state.records = [f.sent, { ...f.sent, hash: "0x" + hex("d") }];
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(lane.observe(HOLD)).rejects.toThrow();
  expect(f.recovery.observe).not.toHaveBeenCalled();
  expect(f.recovery.close).toHaveBeenCalledTimes(1);
});

test("submitter metadata must equal the hold's signing submitter before any review", async () => {
  const f = fixture();
  state.metadata = { ...state.metadata, address: "0x" + "d1".repeat(20) };
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(lane.observe(HOLD)).rejects.toThrow();
  expect(f.input.reviewDisclosures).not.toHaveBeenCalled();
  expect(state.openRecovery).not.toHaveBeenCalled();
});

test.each([
  ["unsigned hold", (row) => (row.entry.signing = null)],
  [
    "relay or non-private kind",
    (row) => (row.entry.facts.kind = "railgun-relay"),
  ],
  ["missing intent digest", (row) => delete row.entry.facts.intentDigest],
  ["unknown hold id", (row) => (row.entry.id = hex("9"))],
])("%s refuses before network consent", async (_name, change) => {
  const f = fixture();
  change(f.row);
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(lane.observe(HOLD)).rejects.toThrow();
  expect(f.input.reviewDisclosures).not.toHaveBeenCalled();
  expect(state.openRecovery).not.toHaveBeenCalled();
});

test("refused or nonboolean consent sends no recovery request", async () => {
  for (const answer of [false, "true", 1, undefined]) {
    const f = fixture();
    f.input.reviewDisclosures.mockImplementation(() => answer);
    const lane = f.createRailgunSubmissionLane(f.input);
    await expect(lane.observe(HOLD)).rejects.toThrow();
    // The recovery scope opens locally before consent to name its endpoint;
    // refused consent sends no request and closes that scope.
    expect(f.recovery.list).not.toHaveBeenCalled();
    expect(f.recovery.observe).not.toHaveBeenCalled();
    expect(f.recovery.close).toHaveBeenCalled();
  }
});

test("a direct thenable consent is not assimilated and fails the lane closed", async () => {
  const f = fixture();
  f.input.reviewDisclosures.mockImplementation(() => ({
    then: (resolve) => resolve(true),
  }));
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(lane.observe(HOLD)).rejects.toMatchObject({
    code: "RAILGUN_SUBMISSION_FACADE_DRAIN_UNOBSERVED",
  });
  await expect(lane.closed).rejects.toMatchObject({
    code: "RAILGUN_SUBMISSION_FACADE_DRAIN_UNOBSERVED",
  });
  // The recovery scope opens locally before consent to name its endpoint;
  // refused consent sends no request and closes that scope.
  expect(f.recovery.list).not.toHaveBeenCalled();
  expect(f.recovery.observe).not.toHaveBeenCalled();
  expect(f.recovery.close).toHaveBeenCalled();
});

test("the lane is exclusive while one observation is pending", async () => {
  const f = fixture();
  let release;
  f.recovery.list.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve(state.records);
      }),
  );
  const lane = f.createRailgunSubmissionLane(f.input);
  const first = lane.observe(HOLD);
  await tick();
  await expect(lane.observe(HOLD)).rejects.toMatchObject({
    code: "RAILGUN_SUBMISSION_FACADE_REFUSED",
  });
  release();
  await expect(first).resolves.toMatchObject({ status: "journaled" });
});

test("resolve reviews the original reconciliation request and returns only the fixed decision", async () => {
  const f = fixture();
  const lane = f.createRailgunSubmissionLane(f.input);
  const value = await lane.resolve(HOLD, { minimumConfirmations: 3 });
  expect(f.recovery.resolve).toHaveBeenCalledWith(f.sent.hash, {
    minimumConfirmations: 3,
    review: expect.any(Function),
  });
  expect(state.decision).toEqual({
    allowNextTransaction: true,
    acceptedEvidence: "unverified-rpc",
  });
  const summaries = f.input.reviewDisclosures.mock.calls.map(([v]) => v);
  expect(summaries.map((v) => v.purpose)).toEqual([
    "railgun-held-submission-observation-v1",
    "railgun-held-submission-resolution-v1",
  ]);
  expect(summaries[1]).toMatchObject({
    holdId: HOLD,
    transactionHash: f.sent.hash,
    output: { kind: "shielded", noteId: "0:7" },
    finalizedBlockNumber: 120,
    minimumConfirmations: 3,
    allowsNextTransaction: true,
    releasesHold: false,
    retryEnabled: false,
  });
  expect(value).toEqual({
    status: "resolved",
    holdId: HOLD,
    kind: "railgun-private-transfer",
    transactionHash: f.sent.hash,
    outcome: "matched",
    finalizedBlockNumber: 121,
    output: { kind: "shielded", noteId: "0:7" },
    releasesHold: false,
    retryEnabled: false,
    trust: "unverified-rpc",
  });
  expect(f.recovery.close).toHaveBeenCalledTimes(1);
});

test("a refused resolution review never returns the reconciliation decision", async () => {
  const f = fixture();
  f.input.reviewDisclosures.mockImplementation(
    (summary) => summary.purpose !== "railgun-held-submission-resolution-v1",
  );
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(
    lane.resolve(HOLD, { minimumConfirmations: 3 }),
  ).rejects.toThrow();
  expect(state.decision).toBeUndefined();
});

test.each([
  [{ minimumConfirmations: 2 }],
  [{ minimumConfirmations: 65 }],
  [{ minimumConfirmations: 3, retry: true }],
  [{}],
])("resolve options %j refuse before reading custody", async (options) => {
  const f = fixture();
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(lane.resolve(HOLD, options)).rejects.toThrow();
  expect(f.reservations.withSigningRecovery).not.toHaveBeenCalled();
  expect(state.openRecovery).not.toHaveBeenCalled();
});

test.each(["unjournaled", "already resolved"])(
  "resolve refuses an %s hold",
  async (kind) => {
    const f = fixture();
    state.records =
      kind === "unjournaled"
        ? []
        : [{ ...f.sent, resolution: { outcome: "matched" } }];
    const lane = f.createRailgunSubmissionLane(f.input);
    await expect(
      lane.resolve(HOLD, { minimumConfirmations: 3 }),
    ).rejects.toThrow();
    expect(f.recovery.resolve).not.toHaveBeenCalled();
  },
);

test("unshield outcomes expose only public amount, fee and recipient fields", async () => {
  const f = fixture();
  f.row.entry.facts.kind = "railgun-token-unshield";
  state.records = [
    { ...f.sent, intent: intent({ operation: "railgun-token-unshield" }) },
  ];
  state.transact = {
    ...f.matched,
    operation: "railgun-token-unshield",
    output: {
      kind: "unshield",
      logIndex: 3,
      recipient: SUBMITTER,
      token: "0x" + "ff".repeat(20),
      amount: "2000",
      received: "1995",
      fee: "5",
      feeDeviation: false,
    },
  };
  const lane = f.createRailgunSubmissionLane(f.input);
  const value = await lane.observe(HOLD);
  expect(value.output).toEqual({
    kind: "unshield",
    recipient: SUBMITTER,
    amount: "2000",
    received: "1995",
    fee: "5",
    feeDeviation: false,
  });
});

test("an unincluded or anomalous observation carries no output", async () => {
  const f = fixture();
  state.transact = null;
  state.records = [
    { ...f.sent, observation: { status: "pending", confirmations: 0 } },
  ];
  const lane = f.createRailgunSubmissionLane(f.input);
  const pending = await lane.observe(HOLD);
  expect(pending.transact).toBeNull();
  expect(pending.output).toBeNull();
  expect(pending.observation).toEqual({
    status: "pending",
    blockNumber: null,
    blockHash: null,
    confirmations: 0,
  });
  state.transact = { status: "anomaly", transactionHash: f.sent.hash };
  state.records = [f.sent];
  const anomaly = await lane.observe(HOLD);
  expect(anomaly.transact).toEqual({ status: "anomaly" });
  expect(anomaly.output).toBeNull();
});

test("an aborted owner signal closes the lane and refuses new work", async () => {
  const f = fixture();
  const lane = f.createRailgunSubmissionLane(f.input);
  f.controller.abort();
  await lane.closed;
  await expect(lane.observe(HOLD)).rejects.toMatchObject({
    code: "RAILGUN_SUBMISSION_FACADE_REFUSED",
  });
});

test("cold discovery after a hashless recovery-required outcome needs only the hold id", async () => {
  // A prior submitStored returned recovery-required without a hash; a fresh
  // lane finds that exact journaled attempt by its held signing intent.
  const f = fixture();
  state.records = [
    { hash: "0x" + hex("c"), nonce: 1, intent: { kind: "ordinary" } },
    f.sent,
  ];
  const lane = f.createRailgunSubmissionLane(f.input);
  const value = await lane.observe(HOLD);
  expect(value).toMatchObject({
    status: "journaled",
    transactionHash: f.sent.hash,
    resolved: false,
  });
  expect(f.recovery.observe).toHaveBeenCalledTimes(1);
});

test("a resolved record reopened cold is reported resolved and cannot be resolved again", async () => {
  const f = fixture();
  state.records = [{ ...f.sent, resolution: { blockHash: "0x" + hex("9") } }];
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(lane.observe(HOLD)).resolves.toMatchObject({
    status: "journaled",
    resolved: true,
    submissionEnabled: false,
    retryEnabled: false,
  });
  await expect(
    lane.resolve(HOLD, { minimumConfirmations: 12 }),
  ).rejects.toThrow();
  expect(f.recovery.resolve).not.toHaveBeenCalled();
});

test.each([
  [
    "foreign profile",
    () =>
      state.journalContext.mockImplementation((subject) => ({
        profileId: "profile-b",
        subject: { ...subject },
      })),
  ],
  [
    "wrong engine chain",
    () =>
      state.contexts.set(state.handle, {
        profileId: "profile-a",
        subject: { chainId: 1 },
      }),
  ],
  [
    "journal principal other than the submitter",
    () =>
      state.journalContext.mockImplementation((subject) => ({
        profileId: "profile-a",
        subject: { ...subject, principal: "0x" + "d1".repeat(20) },
      })),
  ],
  [
    "foreign submitter metadata",
    () => (state.metadata = { ...state.metadata, index: 1 }),
  ],
])("%s refuses before consent or journal access", async (_name, change) => {
  const f = fixture();
  change();
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(lane.observe(HOLD)).rejects.toThrow();
  expect(f.input.reviewDisclosures).not.toHaveBeenCalled();
  expect(state.openRecovery).not.toHaveBeenCalled();
});

test("a foreign account identity cannot open the lane", () => {
  const f = fixture();
  expect(() =>
    f.createRailgunSubmissionLane({
      ...f.input,
      owners: { ...f.input.owners, identity: { signal: f.controller.signal } },
    }),
  ).toThrow();
});

test.each([
  [
    "opening the journal",
    (f) =>
      state.openRecovery.mockImplementation(() => {
        throw Error("PRIVATE_JOURNAL_SCOPE");
      }),
  ],
  [
    "listing the journal",
    (f) => f.recovery.list.mockRejectedValue(Error("list")),
  ],
  [
    "observing the bound hash",
    (f) => f.recovery.observe.mockRejectedValue(Error("rpc")),
  ],
])(
  "a failure %s is refused, never reported unjournaled",
  async (_name, change) => {
    const f = fixture();
    change(f);
    const lane = f.createRailgunSubmissionLane(f.input);
    await expect(lane.observe(HOLD)).rejects.toThrow();
    if (state.openRecovery.mock.results[0]?.type === "return")
      expect(f.recovery.close).toHaveBeenCalledTimes(1);
  },
);

test("reverted resolution resolves the journal but carries no output", async () => {
  const f = fixture();
  state.transact = null;
  state.records = [
    { ...f.sent, observation: { ...f.sent.observation, status: "reverted" } },
  ];
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(
    lane.resolve(HOLD, { minimumConfirmations: 12 }),
  ).resolves.toMatchObject({
    status: "resolved",
    outcome: "reverted",
    output: null,
    releasesHold: false,
  });
});

test("a journal resolution disagreeing with the reviewed transact refuses", async () => {
  const f = fixture();
  f.recovery.resolve.mockImplementation(async (hash, { review }) => {
    const record = state.records.find((value) => value.hash === hash);
    await review({
      transactionHash: hash,
      observation: record.observation,
      transact: state.transact,
      finalized: { number: 120 },
    });
    return {
      ...record,
      resolution: {
        railgun: { outcome: "reverted", finalizedBlockNumber: 120 },
      },
    };
  });
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(
    lane.resolve(HOLD, { minimumConfirmations: 12 }),
  ).rejects.toThrow();
});

test("closing during observation revokes the journal scope immediately and drains the original", async () => {
  const f = fixture();
  let release;
  f.recovery.list.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve(state.records);
      }),
  );
  const lane = f.createRailgunSubmissionLane(f.input);
  const pending = lane.observe(HOLD);
  await tick();
  expect(release).toBeInstanceOf(Function);
  let closed = false;
  lane.closed.then(() => (closed = true));
  lane.close();
  expect(f.recovery.close).toHaveBeenCalledTimes(1);
  expect(f.recovery.signal.aborted).toBe(true);
  await tick();
  expect(closed).toBe(false);
  release();
  await expect(pending).rejects.toThrow();
  await lane.closed;
  expect(f.recovery.observe).not.toHaveBeenCalled();
});

test("closing during the resolution review never returns the decision", async () => {
  const f = fixture();
  let answer;
  f.input.reviewDisclosures.mockImplementation((summary) =>
    summary.purpose === "railgun-held-submission-resolution-v1"
      ? new Promise((resolve) => (answer = resolve))
      : true,
  );
  const lane = f.createRailgunSubmissionLane(f.input);
  const pending = lane.resolve(HOLD, { minimumConfirmations: 12 });
  await tick();
  expect(answer).toBeInstanceOf(Function);
  const [, context] = f.input.reviewDisclosures.mock.calls[1];
  lane.close();
  expect(context.signal.aborted).toBe(true);
  expect(f.recovery.close).toHaveBeenCalledTimes(1);
  answer(true);
  await expect(pending).rejects.toThrow();
  await lane.closed;
  expect(state.decision).toBeUndefined();
});

test("closing during the opening consent sends no journal request", async () => {
  const f = fixture();
  let answer;
  f.input.reviewDisclosures.mockImplementation(
    () => new Promise((resolve) => (answer = resolve)),
  );
  const lane = f.createRailgunSubmissionLane(f.input);
  const pending = lane.observe(HOLD);
  await tick();
  lane.close();
  answer(true);
  await expect(pending).rejects.toThrow();
  await lane.closed;
  // The recovery scope opens locally before consent to name its endpoint;
  // refused consent sends no request and closes that scope.
  expect(f.recovery.list).not.toHaveBeenCalled();
  expect(f.recovery.observe).not.toHaveBeenCalled();
  expect(f.recovery.close).toHaveBeenCalled();
});

test("assertion failures over custody facts leave only the generic refusal", async () => {
  const f = fixture();
  state.records = [f.sent, { ...f.sent, hash: "0x" + hex("d") }];
  const lane = f.createRailgunSubmissionLane(f.input);
  const error = await lane.observe(HOLD).catch((value) => value);
  expect(error).toMatchObject({
    code: "RAILGUN_SUBMISSION_FACADE_REFUSED",
    message: "Railgun held submission unavailable",
  });
  expect(error).not.toHaveProperty("actual");
  expect(JSON.stringify(error) + String(error.stack)).not.toContain(
    f.sent.intent.nullifier,
  );
  const mismatch = fixture();
  mismatch.reservations.assertReceipt.mockResolvedValue({
    ...mismatch.row.entry,
    id: hex("9"),
  });
  const lane2 = mismatch.createRailgunSubmissionLane(mismatch.input);
  const second = await lane2.observe(HOLD).catch((value) => value);
  expect(second.code).toBe("RAILGUN_SUBMISSION_FACADE_REFUSED");
  expect(String(second.stack)).not.toContain(
    mismatch.row.entry.facts.nullifier,
  );
});

test("supported owner codes leave only as fresh fixed-message errors", async () => {
  const f = fixture();
  const secret = "/Users/someone/profile/" + f.sent.intent.nullifier;
  const refused = Object.assign(Error("leaked " + secret), {
    code: "PRIVATE_TRANSACTION_REQUEST_REFUSED",
    cause: Error(secret),
    record: { nullifier: f.sent.intent.nullifier },
  });
  f.recovery.observe.mockRejectedValue(refused);
  const lane = f.createRailgunSubmissionLane(f.input);
  const error = await lane.observe(HOLD).catch((value) => value);
  expect(error).not.toBe(refused);
  expect(error.code).toBe("PRIVATE_TRANSACTION_REQUEST_REFUSED");
  expect(error.message).toBe("Railgun held submission unavailable");
  expect(Object.keys(error)).toEqual(["code"]);
  expect(error.cause).toBeUndefined();
  expect(String(error.stack)).not.toContain(secret);
  expect(f.recovery.close).toHaveBeenCalledTimes(1);
});

test.each([
  ["an unsupported prefixed code", "PRIVATE_SOMETHING_NEW"],
  ["no code", undefined],
])("%s becomes the generic refusal", async (_name, code) => {
  const f = fixture();
  f.recovery.list.mockRejectedValue(
    Object.assign(
      Error("private " + f.sent.intent.nullifier),
      code ? { code } : {},
    ),
  );
  const lane = f.createRailgunSubmissionLane(f.input);
  const error = await lane.observe(HOLD).catch((value) => value);
  expect(error.code).toBe("RAILGUN_SUBMISSION_FACADE_REFUSED");
  expect(Object.keys(error)).toEqual(["code"]);
});

test("an unobserved owner drain quarantines with a fresh lane error and closed rejection", async () => {
  const f = fixture();
  const original = Object.assign(Error("private " + f.sent.intent.nullifier), {
    code: "RAILGUN_TRANSACT_RECOVERY_DRAIN_UNOBSERVED",
    detail: f.sent.intent.nullifier,
  });
  f.recovery.observe.mockRejectedValue(original);
  const lane = f.createRailgunSubmissionLane(f.input);
  const error = await lane.observe(HOLD).catch((value) => value);
  expect(error).not.toBe(original);
  expect(error.code).toBe("RAILGUN_SUBMISSION_FACADE_DRAIN_UNOBSERVED");
  const closed = await lane.closed.catch((value) => value);
  expect(closed).not.toBe(original);
  expect(closed.code).toBe("RAILGUN_SUBMISSION_FACADE_DRAIN_UNOBSERVED");
  expect(Object.keys(closed)).toEqual(["code"]);
});

test("the reviewed destination must remain the recovery's exact observation", async () => {
  const f = fixture();
  f.input.reviewDisclosures.mockImplementation(() => {
    f.recovery.assertDestination.mockImplementation(() => {
      throw Object.assign(Error("changed"), {
        code: "PRIVATE_TRANSACTION_DESTINATION_REFUSED",
      });
    });
    return true;
  });
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(lane.observe(HOLD)).rejects.toMatchObject({
    code: "PRIVATE_TRANSACTION_DESTINATION_REFUSED",
  });
  expect(f.recovery.list).not.toHaveBeenCalled();
  expect(f.recovery.observe).not.toHaveBeenCalled();
});

test("a destination whose details change during review refuses before any request", async () => {
  const f = fixture();
  f.input.reviewDisclosures.mockImplementation(() => {
    state.destinationDetails.mockImplementation(() => ({
      version: 1,
      url: "https://other.example/",
      chainId: 11155111,
      role: "transaction-rpc",
      transport: "tor-experimental",
    }));
    return true;
  });
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(lane.observe(HOLD)).rejects.toMatchObject({
    code: "RAILGUN_SUBMISSION_FACADE_REFUSED",
  });
  expect(f.recovery.list).not.toHaveBeenCalled();
});

test("a destination change during the resolution review never returns the decision", async () => {
  const f = fixture();
  f.input.reviewDisclosures.mockImplementation((summary) => {
    if (summary.purpose === "railgun-held-submission-resolution-v1") {
      expect(summary.destination).toEqual({
        url: "https://rpc.example/",
        transport: "tor-experimental",
      });
      f.recovery.assertDestination.mockImplementation(() => {
        throw Error("changed");
      });
    }
    return true;
  });
  const lane = f.createRailgunSubmissionLane(f.input);
  await expect(
    lane.resolve(HOLD, { minimumConfirmations: 12 }),
  ).rejects.toThrow();
  expect(state.decision).toBeUndefined();
});
