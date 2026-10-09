/** Package-owned tests for the explicit POI retry (one identical second
 * handoff). The harness is the staged sender test's setup, copied with only
 * its import paths changed; the staged test itself is unchanged. */
require('../tools/owner-test-staging/context-host.cjs');
// Genuine plans, prepared receipt readers, normalizers, comparisons and account
// phases are real. Cryptographic validation, storage authority and network I/O
// are mocked; these tests qualify sender composition, not proof or service truth.
let mock;
jest.mock("../src/owners/railgun-account-enrollment.js", () => ({
  isRailgunAccountEnrollment: (value) => mock.enrollments.has(value),
}));
jest.mock("../src/owners/railgun-identity.js", () => ({
  assertRailgunIdentity: jest.fn((identity, handle) => {
    const context = require("../src/owners/context-bindings.js").getPrivacyContext(handle);
    if (
      identity !== mock.identity ||
      identity.signal.aborted ||
      !mock.identityCurrent ||
      context.subject.kind !== 'private-account' ||
      context.subject.role !== 'engine' ||
      context.subject.protocol !== 'railgun' ||
      context.subject.chainId !== 11155111 ||
      context.subject.principal !== 'railgun:0' ||
      context.subject.deployment !== 'sepolia'
    )
      throw Error('PRIVATE identity diagnostic');
    return identity.descriptor;
  }),
  withRailgunViewingCredential: jest.fn(() => {
    throw Error('unexpected key');
  }),
}));
jest.mock("../src/owners/railgun-account-public.js", () => ({
  assertRailgunAccountPublic: jest.fn((coordinator, enrollment, policy) => {
    if (
      coordinator !== mock.coordinator ||
      !mock.enrollments.has(enrollment) ||
      coordinator.signal.aborted ||
      !mock.publicCurrent ||
      (policy !== undefined && policy !== mock.policy)
    )
      throw Error('PRIVATE registered policy');
    return mock.policy;
  }),
  getRailgunAccountPublicDestination: jest.fn(() => mock.sourceDestination),
  assertRailgunAccountPublicDestination: jest.fn((coordinator, enrollment, destination) => {
    if (
      coordinator !== mock.coordinator ||
      enrollment !== mock.enrollment ||
      destination !== mock.sourceDestination ||
      !mock.publicCurrent
    )
      throw Error('source destination');
  }),
  getRailgunAccountPublicIdentity: jest.fn((coordinator, enrollment, policy) => {
    if (
      coordinator !== mock.coordinator ||
      !mock.enrollments.has(enrollment) ||
      coordinator.signal.aborted ||
      !mock.publicCurrent ||
      policy !== mock.policy
    )
      throw Error('PRIVATE public identity');
    return mock.publicIdentity;
  }),
}));
jest.mock("../src/owners/railgun-public-policy.js", () => ({
  getRailgunPublicPolicy: jest.fn(() => mock.policy),
}));
jest.mock("../src/execution/railgun-engine-runtime.js", () => ({
  verifyRailgunEngineRuntime: jest.fn((value) => {
    if (value !== mock.archive) throw Error('archive');
    return value;
  }),
}));
jest.mock("../src/execution/railgun-prover-runtime.js", () => ({
  verifyRailgunProverRuntime: jest.fn((value) => {
    if (value !== mock.proverArchive) throw Error('prover archive');
    return value;
  }),
}));
jest.mock("../src/owners/railgun-poi-root.js", () => ({
  createRailgunPoiRootSource: jest.fn((options) => mock.makeRoot('list', options)),
  createRailgunPoiTxidRootSource: jest.fn((options) => mock.makeRoot('txid', options)),
}));
jest.mock("../src/owners/railgun-process.js", () => ({
  startRailgunProcess: jest.fn(() => {
    throw Error('unexpected utility');
  }),
}));
jest.mock("../src/owners/railgun-own-poi-proof.js", () => ({
  proveRailgunOwnPoi: jest.fn(() => {
    throw Error('unexpected proof');
  }),
}));
jest.mock("../src/owners/railgun-own-witness.js", () => ({
  preflightRailgunRetainedPoiCompleted: jest.fn(() => {
    throw Error('unexpected retained preflight');
  }),
  preflightRailgunRetainedPoiForSubmission: jest.fn(() => {
    throw Error('unexpected retained submission preflight');
  }),
  preflightRailgunOwnPoi: jest.fn(() => {
    throw Error('unexpected preflight');
  }),
}));
jest.mock("../src/owners/host-bindings.js", () => ({
  ...jest.requireActual("../src/owners/host-bindings.js"),
  rpc: {
  getPrivateRpcDestinationDetails: jest.fn((destination) => {
    if (![mock.sourceDestination, mock.receiptDestination].includes(destination))
      throw Error('unknown destination');
    return {
      version: 1,
      url:
        destination === mock.sourceDestination
          ? 'https://source.example/private/path'
          : 'https://receipt.example/another/private/path',
      chainId: 11155111,
      role: destination === mock.sourceDestination ? 'protocol-rpc' : 'transaction-rpc',
      transport: 'tor-experimental',
    };
  }),
  createPrivateRpc: jest.fn(() => {
    throw Error('unexpected transport');
  }),
},
  transactionNetwork: {
  getPrivateTransactionNetwork: jest.fn((handle) => {
    mock.receiptHandles.add(handle);
    return mock.network;
  }),
  getPrivateTransactionNetworkDestination: jest.fn(() => mock.receiptDestination),
  assertPrivateTransactionNetworkDestination: jest.fn((network, handle, destination) => {
    if (
      network !== mock.network ||
      !mock.receiptHandles.has(handle) ||
      destination !== mock.receiptDestination ||
      !mock.receiptCurrent
    )
      throw Error('receipt destination');
  }),
},
  transport: {
  createWalletTorTransport: jest.fn(() => mock.makeTransport()),
},
}));
jest.mock("../src/owners/railgun-own-operation.js", () => ({
  captureRailgunOwnOperationSelector: jest.fn((options) => mock.selector(options)),
  withRailgunOwnOperationRecovery: jest.fn(async (options, use) => {
    const { claimRailgunAccountPhase } = jest.requireActual("../src/owners/railgun-account-phase.js");
    let phase;
    let live = true;
    const deadline = performance.now() + options.timeoutMs;
    const current = (margin = 0) => {
      if (!live || options.signal.aborted || performance.now() + margin >= deadline)
        throw Error('PRIVATE recovery lifetime');
      phase.assertCurrent();
    };
    try {
      phase = claimRailgunAccountPhase(options.enrollment, 'recovery');
      mock.events.push('recovery-open');
      await mock.recoveryStart(options);
      current();
      mock.window = {
        capture: JSON.parse(JSON.stringify(mock.capture)),
        signal: options.signal,
        assertCurrent: jest.fn(current),
        reattest: jest.fn(async () => {
          current();
          const capture = await mock.reattest();
          current();
          return capture;
        }),
      };
      let value;
      try {
        value = await use(mock.window);
      } catch {
        return { status: 'refused', stage: 'callback' };
      }
      current();
      live = false;
      await mock.recoveryPost();
      if (options.signal.aborted || performance.now() >= deadline) throw Error('post-recovery');
      return { status: 'used', value };
    } catch {
      return { status: 'refused', stage: 'reattest' };
    } finally {
      live = false;
      phase?.release();
      mock.events.push('recovery-close');
    }
  }),
}));


jest.mock("../src/owners/railgun-poi-cold-validation.js", () => ({
  validateRailgunRetainedPoiForSubmission: jest.fn((...args) => mock.validate(...args)),
}));

const { createHash } = require('crypto');
const { createPrivacyScope, getPrivacyContext } = require("../src/owners/context-bindings.js");
const { projectRailgunOwnRecord } = require("../src/owners/railgun-own-txid.js");
const { prepareRailgunPoiSubmission } = require("../src/data/railgun-poi-submit-data.js");
const {
  assertPreparedRailgunOwnReceipt,
  observePreparedRailgunOwnReceipt,
} = require("../src/owners/railgun-own-receipt.js");
const { sample } = require("../tools/owner-test-staging/fixtures/scripts/fixtures/railgun-own-txid-data.js");
const { samplePartial } = require("../tools/owner-test-staging/fixtures/scripts/fixtures/railgun-partial-own-txid-data.js");
const { digestRailgunPrivateCapsule } = require("../src/data/railgun-private-capsule.js");
const { normalizeRailgunPoiPayload } = require("../src/data/railgun-poi-payload.js");
const { REQUIRED_LIST } = require("../src/data/railgun-poi-records.js");
const { claimRailgunAccountPhase } = require("../src/owners/railgun-account-phase.js");
const {
  prepareRailgunPoiDisclosurePlan: prepare,
  revalidateRailgunPoiDisclosurePlan: revalidate,
  submitRailgunRetainedPoi: submit,
} = require("../src/owners/railgun-poi-disclosure-plan.js");
const hex = (n) => BigInt(n).toString(16).padStart(64, '0');
const prefixed = (n) => '0x' + hex(n);
const copy = (value) => JSON.parse(JSON.stringify(value));
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
let options, gates, operations, plans;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  const gate = { promise, resolve };
  gates.push(gate);
  return gate;
};
const until = async (check) => {
  for (let n = 0; n < 300 && !check(); n++) await Promise.resolve();
  expect(check()).toBe(true);
};
const run = (input = options) => {
  const work = prepare(input).then((value) => {
    if (value.status === 'prepared') plans.push(value);
    return value;
  });
  operations.push(work);
  return work;
};
const recheck = (result, overrides = {}) => {
  const work = revalidate({
    plan: result.plan,
    identity: options.identity,
    enrollment: options.enrollment,
    coordinator: options.coordinator,
    signal: new AbortController().signal,
    ...overrides,
  });
  operations.push(work);
  return work;
};
const idle = () => {
  const phase = claimRailgunAccountPhase(mock.enrollment, 'wallet');
  phase.release();
};
function configure(unshield = false) {
  const partial = unshield === 'partial';
  const evidence = partial ? samplePartial() : sample(unshield),
    capsule = evidence.capsule;
  const descriptor = {
    walletId: capsule.walletId,
    instanceId: unshield ? sample().capsule.selection.recipient : capsule.selection.recipient,
    masterPublicKey: hex(3),
    spendingPublicKey: [hex(4), hex(5)],
    viewingPublicKey: hex(6),
    accountIndex: 0,
  };
  mock.evidence = evidence;
  mock.evidence.receipt.gasUsed = '0x10000';
  mock.identity.descriptor = copy(descriptor);
  mock.enrollment.descriptor = copy(descriptor);
  mock.capture = {
    capsuleDigest: digestRailgunPrivateCapsule(capsule),
    bindingDigest: hex(100),
    selector: {
      tree: capsule.selection.tree,
      position: capsule.selection.position,
      noteHash: capsule.noteHash,
      nullifier: capsule.preparation.expected.nullifier,
    },
    capsule: copy(capsule),
    facts: { kind: capsule.selection.kind },
    submitter: evidence.transaction.from,
    provedTransaction: {
      chainId: 11155111,
      to: evidence.transaction.to,
      value: '0',
      data: evidence.transaction.input,
    },
    intent: copy(evidence.record.intent),
    projection: projectRailgunOwnRecord(evidence.record),
    record: copy(evidence.record),
  };
  const payload = normalizeRailgunPoiPayload({
    listKey: REQUIRED_LIST,
    proof: {
      pi_a: ['1', '2'],
      pi_b: [
        ['3', '4'],
        ['5', '6'],
      ],
      pi_c: ['7', '8'],
    },
    poiMerkleroots: [hex(20)],
    txidMerkleroot: hex(21),
    txidMerklerootIndex: 3,
    blindedCommitmentsOut: unshield && !partial ? [] : [prefixed(22)],
    railgunTxidIfHasUnshield: unshield ? prefixed(9) : '0x00',
  });
  mock.entry = {
    capsuleDigest: mock.capture.capsuleDigest,
    bindingDigest: mock.capture.bindingDigest,
    selector: copy(mock.capture.selector),
    payload,
    payloadSha256: sha(payload),
    inputSha256: hex(23),
    revision: 1,
    state: 'prepared',
  };
  options.capsuleDigest = mock.entry.capsuleDigest;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  gates = [];
  operations = [];
  plans = [];
  mock = {
    caller: new AbortController(),
    identityAbort: new AbortController(),
    enrollmentAbort: new AbortController(),
    coordinatorAbort: new AbortController(),
    storeAbort: new AbortController(),
    enrollments: new Set(),
    events: [],
    identityCurrent: true,
    publicCurrent: true,
    policy: { version: 1, fingerprint: 'PRIVATE_POLICY' },
    publicIdentity: { generationId: hex(1), sourceId: hex(2), publicId: hex(3) },
  };
  mock.scope = createPrivacyScope({
    profileId: 'poi-disclosure-plan-unit',
    signal: mock.enrollmentAbort.signal,
  });
  mock.identity = { signal: mock.identityAbort.signal };
  mock.coordinator = { signal: mock.coordinatorAbort.signal };
  mock.read = jest.fn(async () => freeze(copy(mock.entry)));
  mock.store = {
    signal: mock.storeAbort.signal,
    get: jest.fn(async (digest) => {
      expect(digest).toBe(options.capsuleDigest);
      mock.events.push('read');
      return mock.read(mock.store.get.mock.calls.length);
    }),
    prepare: jest.fn(() => {
      throw Error('unexpected writer');
    }),
    beginAttempt: jest.fn((value) => mock.begin(value)),
    close: jest.fn(() => {
      throw Error('unexpected shared close');
    }),
  };
  mock.enrollment = {
    directory: '/synthetic-disclosure-plan-account',
    signal: mock.enrollmentAbort.signal,
    getContext: jest.fn((role, operation) =>
      mock.scope.getContext({
        kind: 'private-account',
        principal: 'railgun:0',
        protocol: 'railgun',
        deployment: 'sepolia',
        chainId: 11155111,
        role,
        operation,
      })
    ),
    openPoiIntents: jest.fn(async () => mock.store),
  };
  mock.enrollments.add(mock.enrollment);
  options = {
    identity: mock.identity,
    enrollment: mock.enrollment,
    coordinator: mock.coordinator,
    capsuleDigest: hex(1),
    signal: mock.caller.signal,
  };
  configure();
  setupSender();
  mock.reattest = jest.fn(async () => copy(mock.capture));
  mock.recoveryStart = jest.fn(async () => {});
  mock.recoveryPost = jest.fn(async () => {});
});
afterEach(async () => {
  mock.caller.abort();
  mock.enrollmentAbort.abort();
  for (const plan of plans) plan.close();
  for (const gate of gates) gate.resolve();
  await Promise.allSettled(operations);
  await Promise.all(plans.map((plan) => plan.closed));
  expect(mock.store.prepare).not.toHaveBeenCalled();
  expect(mock.store.close).not.toHaveBeenCalled();
  for (const [file, name, family] of [
    ['../src/owners/railgun-identity.js', 'withRailgunViewingCredential'],
    ['../src/owners/railgun-own-operation.js', 'captureRailgunOwnOperationSelector'],
    ['../src/owners/railgun-process.js', 'startRailgunProcess'],
    ['../src/owners/railgun-own-poi-proof.js', 'proveRailgunOwnPoi'],
    ['../src/owners/railgun-own-witness.js', 'preflightRailgunOwnPoi'],
    ['../src/owners/railgun-own-witness.js', 'preflightRailgunRetainedPoiCompleted'],
    ['../src/owners/railgun-own-witness.js', 'preflightRailgunRetainedPoiForSubmission'],
    ['../src/owners/host-bindings.js', 'createPrivateRpc', 'rpc'],
  ])
    expect((family ? require(file)[family] : require(file))[name]).not.toHaveBeenCalled();
  mock.scope.close();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function setupSender() {
  mock.archive = Object.freeze({ archive: 'engine' });
  mock.proverArchive = Object.freeze({ archive: 'prover' });
  mock.sourceDestination = Object.freeze({});
  mock.receiptDestination = Object.freeze({});
  mock.receiptCurrent = true;
  mock.receiptHandles = new WeakSet();
  mock.network = {
    signal: mock.coordinatorAbort.signal,
    request: jest.fn(async (_chain, method, params) => {
      mock.events.push('rpc:' + method);
      const evidence = mock.evidence;
      if (method === 'eth_getTransactionByHash') return { result: copy(evidence.transaction) };
      if (method === 'eth_getTransactionReceipt') return { result: copy(evidence.receipt) };
      if (method === 'eth_blockNumber') return { result: '0x136' };
      expect(method).toBe('eth_getBlockByNumber');
      const tag = params[0] === 'finalized' ? '0x12e' : params[0];
      const hash = { '0x123': 200, '0x12c': 201, '0x12d': 202, '0x12e': 203 }[tag];
      expect(hash).toBeDefined();
      return { result: { number: tag, hash: prefixed(hash) } };
    }),
  };
  mock.validationResult = () => ({
    status: 'validated',
    capsuleDigest: mock.entry.capsuleDigest,
    revision: mock.entry.revision,
    payloadSha256: mock.entry.payloadSha256,
    outputMatched: true,
    proofVerified: true,
    independentlyVerified: true,
    verifierExitObserved: true,
    historicalRootMatchesLocalMirror: true,
    ownTxidIncludedBySavedIndex: true,
    localMirrorCheckpointMatched: true,
    originalRootsAccepted: false,
    rootAccepted: false,
    disclosureEnabled: false,
    spendingEnabled: false,
  });
  mock.validate = jest.fn(async (args, handoff) => {
    mock.events.push('validate');
    mock.handoff = handoff;
    expect(handoff.sourceDestination).toBe(mock.sourceDestination);
    expect(handoff.destination).toBe(mock.receiptDestination);
    expect(handoff.entry).toEqual(mock.entry);
    expect(handoff.capture).toEqual(mock.capture);
    expect(args.signal.aborted).toBe(false);
    assertPreparedRailgunOwnReceipt(handoff.reader, {
      enrollment: args.enrollment,
      capture: handoff.capture,
      destination: handoff.destination,
    });
    const observed = await observePreparedRailgunOwnReceipt(handoff.reader);
    expect(observed.status).toBe('observed');
    mock.events.push('validated');
    return mock.validationResult();
  });
  mock.roots = {};
  mock.acquire = jest.fn(async () => {});
  mock.makeRoot = jest.fn((kind, args) => {
    expect(mock.review.mock.calls).toHaveLength(2);
    const context = getPrivacyContext(args.handle);
    expect(context.subject.role).toBe('poi');
    expect(args.root).toBe(
      kind === 'list' ? mock.entry.payload.poiMerkleroots[0] : mock.entry.payload.txidMerkleroot
    );
    if (kind === 'txid') expect(args.index).toBe(mock.entry.payload.txidMerklerootIndex);
    const controller = new AbortController();
    const receipt = Object.freeze({});
    const observation = Object.freeze({ accepted: true });
    let at;
    const root = {
      signal: controller.signal,
      closed: Promise.resolve(),
      close: jest.fn(() => controller.abort()),
      acquire: jest.fn(async (options) => {
        at = performance.now();
        mock.events.push('root:' + kind);
        await mock.acquire(kind, options);
        if (controller.signal.aborted) throw Error('closed root');
        return { receipt, observation };
      }),
      assertResult: jest.fn((given, margin = 0) => {
        if (
          given !== receipt ||
          controller.signal.aborted ||
          at === undefined ||
          performance.now() - at + margin >= 60000
        )
          throw Error('stale root');
        return observation;
      }),
    };
    mock.roots[kind] = root;
    return root;
  });
  mock.begin = jest.fn(async (args) => {
    expect(args).toEqual({
      capsuleDigest: mock.entry.capsuleDigest,
      expectedRevision: mock.entry.revision,
      expectedPayloadSha256: mock.entry.payloadSha256,
      signal: expect.any(AbortSignal),
    });
    expect(args.signal.aborted).toBe(false);
    expect(mock.entry.state).toBe('prepared');
    const attemptedAt = Date.now();
    const submission = prepareRailgunPoiSubmission({
      payload: mock.entry.payload,
      requestId: attemptedAt,
    });
    mock.entry = { ...mock.entry, state: 'attempted', attempt: { attemptedAt, submission } };
    mock.events.push('persisted');
    return {
      status: 'attempted',
      capsuleDigest: mock.entry.capsuleDigest,
      revision: mock.entry.revision,
      payloadSha256: mock.entry.payloadSha256,
      attemptedAt,
      bodySha256: submission.bodySha256,
      disclosureEnabled: false,
      spendingEnabled: false,
    };
  });
  mock.transportClosed = Promise.resolve();
  mock.post = jest.fn(async (_handle, url, request) => {
    expect(mock.entry.state).toBe('attempted');
    expect(url).toBe('https://ppoi.fdi.network');
    expect(request.body).toBe(mock.entry.attempt.submission.body);
    mock.events.push('post');
    return {
      status: 200,
      body: Buffer.from(
        JSON.stringify({ jsonrpc: '2.0', id: mock.entry.attempt.attemptedAt, result: true })
      ),
    };
  });
  mock.makeTransport = jest.fn(() => {
    mock.transport = {
      request: jest.fn((...args) => mock.post(...args)),
      close: jest.fn(),
      closed: mock.transportClosed,
    };
    return mock.transport;
  });
  mock.review = jest.fn(async (request, { signal }) => {
    expect(signal.aborted).toBe(false);
    idle();
    mock.events.push('review:' + request.purpose);
    return true;
  });
}
const sendOptions = (plan, changes = {}) => ({
  identity: mock.identity,
  enrollment: mock.enrollment,
  coordinator: mock.coordinator,
  archive: mock.archive,
  proverArchive: mock.proverArchive,
  artifactDirectory: '/synthetic/artifacts',
  plan: plan.plan,
  review: mock.review,
  signal: mock.caller.signal,
  ...changes,
});
const send = (plan, changes = {}) => {
  const pending = submit(sendOptions(plan, changes));
  operations.push(pending);
  return pending;
};
const freshPlan = async () => {
  const result = await run();
  expect(result.status).toBe('prepared');
  return result;
};
const noPost = () => {
  expect(mock.makeTransport).not.toHaveBeenCalled();
  expect(mock.post).not.toHaveBeenCalled();
};

// --- Explicit retry of an attempted entry -----------------------------------
const ATTEMPTED_AT = 1791495220000;
function attemptFirst() {
  const submission = prepareRailgunPoiSubmission({ payload: mock.entry.payload, requestId: ATTEMPTED_AT });
  mock.entry = { ...mock.entry, state: 'attempted', attempt: { attemptedAt: ATTEMPTED_AT, submission } };
  mock.originalBody = submission.body;
}
function setupRetry() {
  attemptFirst();
  mock.evidence_ = () =>
    Object.freeze({
      blindedCommitment: mock.entry.payload.blindedCommitmentsOut[0],
      type: 'Transact',
      status: 'Missing',
      listKey: REQUIRED_LIST,
      at: performance.now(),
    });
  mock.retryEvidence = jest.fn(() => mock.evidence_());
  mock.reserve = jest.fn(async (args) => {
    expect(args).toEqual({
      capsuleDigest: mock.entry.capsuleDigest,
      expectedRevision: mock.entry.revision,
      expectedPayloadSha256: mock.entry.payloadSha256,
      expectedBodySha256: mock.entry.attempt.submission.bodySha256,
      expectedAttemptedAt: ATTEMPTED_AT,
      signal: expect.any(AbortSignal),
    });
    expect(mock.entry.retry).toBeUndefined();
    const reservedAt = ATTEMPTED_AT + 1000;
    mock.entry = { ...mock.entry, retry: { reservedAt, bodySha256: mock.entry.attempt.submission.bodySha256 } };
    mock.events.push('reserved');
    return {
      status: 'reserved',
      capsuleDigest: mock.entry.capsuleDigest,
      revision: mock.entry.revision,
      payloadSha256: mock.entry.payloadSha256,
      bodySha256: mock.entry.attempt.submission.bodySha256,
      attemptedAt: ATTEMPTED_AT,
      reservedAt,
      disclosureEnabled: false,
      spendingEnabled: false,
    };
  });
  mock.store.reserveRetry = jest.fn((value) => mock.reserve(value));
}
const retryPlan = async () => {
  const result = await run({ ...options, retry: true });
  expect(result.status).toBe('prepared');
  return result;
};
const sendRetry = (plan, changes = {}) => send(plan, { retryEvidence: mock.retryEvidence, ...changes });

test('the explicit retry reviews the second handoff and posts the identical stored request once', async () => {
  setupRetry();
  const plan = await retryPlan();
  expect(plan.summary).toMatchObject({
    handoff: 'second-identical',
    requestIdAllocation: 'original-attempt-request-reused',
  });
  expect(plan.summary.retryExplanation).toMatch(/identical stored proof request a second time/);
  const result = await sendRetry(plan);
  expect(result).toMatchObject({
    status: 'recovery-required',
    stage: 'response',
    response: { classification: 'rpc-result', acceptanceVerified: false },
  });
  expect(mock.review.mock.calls.map(([request]) => request.purpose)).toEqual([
    'validate-retained-poi',
    'retry-retained-poi',
  ]);
  expect(mock.review.mock.calls[1][0]).toMatchObject({ handoff: 'second-identical' });
  expect(mock.store.reserveRetry).toHaveBeenCalledTimes(1);
  expect(mock.store.beginAttempt).not.toHaveBeenCalled();
  // Only the retry marks its attempted-entry validation handoff.
  expect(mock.handoff.retry).toBe(true);
  expect(mock.post).toHaveBeenCalledTimes(1);
  // Byte-identical original body, hence the original request ID.
  expect(mock.post.mock.calls[0][2].body).toBe(mock.originalBody);
  expect(JSON.parse(mock.post.mock.calls[0][2].body).id).toBe(ATTEMPTED_AT);
  expect(mock.events.indexOf('validated')).toBeLessThan(mock.events.indexOf('review:retry-retained-poi'));
  expect(mock.events.indexOf('reserved')).toBeLessThan(mock.events.indexOf('post'));
  // Evidence checked at reservation and again at send admission.
  expect(mock.retryEvidence.mock.calls.length).toBeGreaterThanOrEqual(2);
  await plan.closed;
  expect((await sendRetry(plan)).status).toBe('refused');
  expect(mock.post).toHaveBeenCalledTimes(1);
});

test.each([
  ['absent evidence', () => null],
  ['a Valid output', (e) => ({ ...e, status: 'Valid' })],
  ['a submitted proof', (e) => ({ ...e, status: 'ProofSubmitted' })],
  ['a Shield input', (e) => ({ ...e, type: 'Shield' })],
  ['another commitment', (e) => ({ ...e, blindedCommitment: prefixed(99) })],
  ['another list', (e) => ({ ...e, listKey: hex(7) })],
  ['stale evidence', (e) => ({ ...e, at: performance.now() - 300001 })],
  ['future evidence', (e) => ({ ...e, at: performance.now() + 1000 })],
  ['an extra field', (e) => ({ ...e, accepted: true })],
])('%s refuses before any reservation or post', async (_name, change) => {
  setupRetry();
  const plan = await retryPlan();
  const base = mock.evidence_;
  mock.evidence_ = () => {
    const value = change({ ...base() });
    return value && Object.freeze(value);
  };
  const result = await sendRetry(plan);
  expect(result.status).toBe('refused');
  expect(result.stage).toBe('attempt');
  expect(mock.store.reserveRetry).not.toHaveBeenCalled();
  noPost();
});

test('unfrozen evidence refuses before any reservation', async () => {
  setupRetry();
  const plan = await retryPlan();
  mock.evidence_ = () => ({
    blindedCommitment: mock.entry.payload.blindedCommitmentsOut[0],
    type: 'Transact',
    status: 'Missing',
    listKey: REQUIRED_LIST,
    at: performance.now(),
  });
  expect((await sendRetry(plan)).status).toBe('refused');
  expect(mock.store.reserveRetry).not.toHaveBeenCalled();
  noPost();
});

test('evidence that goes stale after the reservation keeps it consumed and never posts', async () => {
  setupRetry();
  const plan = await retryPlan();
  let calls = 0;
  const fresh = mock.evidence_;
  mock.evidence_ = () => {
    calls++;
    const value = fresh();
    return calls === 1 ? value : Object.freeze({ ...value, status: 'Valid' });
  };
  const result = await sendRetry(plan);
  expect(result.status).toBe('recovery-required');
  expect(mock.store.reserveRetry).toHaveBeenCalledTimes(1);
  expect(mock.entry.retry).toBeDefined();
  noPost();
});

test.each([
  ['refused', { status: 'refused', stage: 'stored' }, 'refused'],
  ['uncertain', { status: 'recovery-required', stage: 'persist' }, 'recovery-required'],
])('a %s reservation never posts', async (_name, reply, status) => {
  setupRetry();
  const plan = await retryPlan();
  mock.reserve = jest.fn(async () => reply);
  const result = await sendRetry(plan);
  expect(result.status).toBe(status);
  noPost();
});

test('a retry plan admits neither a prepared entry nor an already reserved retry', async () => {
  expect((await run({ ...options, retry: true })).status).toBe('refused');
  setupRetry();
  mock.entry = { ...mock.entry, retry: { reservedAt: ATTEMPTED_AT + 1, bodySha256: mock.entry.attempt.submission.bodySha256 } };
  expect((await run({ ...options, retry: true })).status).toBe('refused');
  expect(mock.review).not.toHaveBeenCalled();
});

test('a retry plan refuses an unshield payload without an output commitment', async () => {
  configure(true);
  setupRetry();
  expect((await run({ ...options, retry: true })).status).toBe('refused');
});

test.each([false, 'yes', 1, null])('retry option %p other than true refuses', async (retry) => {
  setupRetry();
  expect((await run({ ...options, retry })).status).toBe('refused');
});

test('evidence is admitted exactly for a retry plan', async () => {
  setupRetry();
  const plan = await retryPlan();
  expect((await send(plan)).status).toBe('refused');
  expect(mock.review).not.toHaveBeenCalled();
  const ordinary = mock.entry;
  configure();
  const first = await freshPlan();
  expect((await send(first, { retryEvidence: mock.retryEvidence })).status).toBe('refused');
  expect(mock.review).not.toHaveBeenCalled();
  expect(mock.retryEvidence).not.toHaveBeenCalled();
  void ordinary;
  noPost();
});

test('an ordinary first-handoff plan still refuses an attempted entry', async () => {
  attemptFirst();
  expect((await run()).status).toBe('refused');
});

test('an ordinary first handoff never carries the retry marker', async () => {
  const plan = await freshPlan();
  expect((await send(plan)).status).toBe('recovery-required');
  expect(Object.hasOwn(mock.handoff, 'retry')).toBe(false);
});
