/** Package-owned tests for the explicitly marked retry handoff into output
 * recovery's fixed submission branch. The harness is the staged output-recovery
 * test's setup, copied with only its import paths changed. */
require('../tools/owner-test-staging/context-host.cjs');
jest.mock("../src/data/railgun-retained-private-data.js", () => {
  const actual = jest.requireActual("../src/data/railgun-retained-private-data.js");
  return {
    ...actual,
    normalizeRailgunPoiShieldInput: jest.fn(actual.normalizeRailgunPoiShieldInput),
  };
});
let mock;
jest.mock("../src/owners/railgun-account-enrollment.js", () => ({
  isRailgunAccountEnrollment: (value) => value === mock.enrollment,
}));
jest.mock("../src/owners/railgun-identity.js", () => ({
  assertRailgunIdentity: jest.fn((identity, handle) => {
    const { getPrivacyContext } = require("../src/owners/context-bindings.js");
    const context = getPrivacyContext(handle);
    if (
      identity !== mock.identity ||
      identity.signal.aborted ||
      !mock.identityCurrent ||
      context.subject.role !== 'engine' ||
      ![null, 'poi-output-recover'].includes(context.subject.operation) ||
      context.subject.principal !== 'railgun:0' ||
      context.subject.chainId !== 11155111 ||
      context.subject.protocol !== 'railgun' ||
      context.subject.deployment !== 'sepolia'
    )
      throw Error('private identity diagnostic');
    return JSON.parse(JSON.stringify(identity.descriptor));
  }),
  withRailgunViewingCredential: jest.fn((identity, use) => {
    if (identity !== mock.identity) throw Error('identity');
    return mock.credential(use);
  }),
}));
jest.mock("../src/owners/railgun-public-policy.js", () => ({
  getRailgunPublicPolicy: (archive) => {
    if (archive !== '/fixture-engine.asar') throw Error('policy');
    return 'fixture-policy';
  },
}));
jest.mock("../src/owners/railgun-account-public.js", () => ({
  assertRailgunAccountPublic: (coordinator, enrollment, policy) => {
    if (
      coordinator !== mock.coordinator ||
      enrollment !== mock.enrollment ||
      coordinator.signal.aborted ||
      !mock.publicCurrent ||
      (policy !== undefined && policy !== 'fixture-policy')
    )
      throw Error('registered policy');
    return 'fixture-policy';
  },
  getRailgunAccountPublicDestination: (coordinator, enrollment, policy) => {
    if (
      coordinator !== mock.coordinator ||
      enrollment !== mock.enrollment ||
      policy !== 'fixture-policy' ||
      !mock.publicCurrent
    )
      throw Error('destination owner');
    return mock.destination;
  },
  assertRailgunAccountPublicDestination: (coordinator, enrollment, destination, policy) => {
    if (
      coordinator !== mock.coordinator ||
      enrollment !== mock.enrollment ||
      destination !== mock.destination ||
      policy !== 'fixture-policy' ||
      !mock.publicCurrent
    )
      throw Error('destination');
    return destination;
  },
  getRailgunAccountPublicIdentity: (coordinator, enrollment, policy) => {
    if (
      coordinator !== mock.coordinator ||
      enrollment !== mock.enrollment ||
      coordinator.signal.aborted ||
      policy !== 'fixture-policy' ||
      !mock.publicCurrent
    )
      throw Error('private coordinator diagnostic');
    return JSON.parse(JSON.stringify(mock.publicIdentity));
  },
}));
jest.mock("../src/execution/railgun-engine-runtime.js", () => ({
  verifyRailgunEngineRuntime: jest.fn((archive) => {
    if (archive !== '/fixture-engine.asar' || !mock.runtimeCurrent) throw Error('runtime');
    return archive;
  }),
}));
jest.mock("../src/owners/railgun-own-witness.js", () => ({
  preflightRailgunOwnPoi: jest.fn(() => {
    throw Error('legacy preflight forbidden');
  }),
  preflightRailgunRetainedPoiCompleted: jest.fn((options) => mock.preflight(options)),
  preflightRailgunRetainedPoiForSubmission: jest.fn((options, input) =>
    mock.preflight(options, input)
  ),
}));
jest.mock("../src/owners/railgun-own-operation.js", () => ({
  withRailgunOwnOperationRecovery: jest.fn(async (options, use) => {
    if (mock.phase) return { status: 'refused', stage: 'busy' };
    mock.phase = true;
    mock.events.push('window-open');
    const controller = new AbortController();
    const signal = AbortSignal.any([options.signal, controller.signal]);
    const deadline = performance.now() + Math.min(options.timeoutMs, mock.windowBudget);
    let accepting = true;
    const active = (margin = 0) => {
      if (
        !accepting ||
        signal.aborted ||
        !mock.phase ||
        !Number.isSafeInteger(margin) ||
        margin < 0 ||
        performance.now() + margin >= deadline
      )
        throw Error('private recovery lifetime');
    };
    mock.window = {
      capture: JSON.parse(JSON.stringify(mock.capture)),
      signal,
      assertCurrent: jest.fn(active),
      reattest: jest.fn(async () => {
        active();
        mock.events.push('reattest');
        const result = await mock.reattest();
        active();
        return result;
      }),
    };
    mock.windowAbort = () => controller.abort();
    try {
      await mock.recoveryStart();
      active();
      let value;
      try {
        value = await use(mock.window);
      } catch {
        return { status: 'refused', stage: 'callback' };
      }
      active();
      accepting = false;
      controller.abort();
      mock.events.push('recovery-post');
      await mock.recoveryPost();
      if (options.signal.aborted || performance.now() >= deadline) throw Error('outer recovery');
      return { status: 'used', value: JSON.parse(JSON.stringify(value)) };
    } catch {
      return { status: 'refused', stage: 'reattest' };
    } finally {
      accepting = false;
      controller.abort();
      mock.events.push('window-close');
      mock.phase = false;
    }
  }),
}));
jest.mock("../src/owners/railgun-process.js", () => ({
  startRailgunProcess: jest.fn((options) => {
    if (!mock.phase || mock.startError) throw Error('utility startup');
    mock.events.push('job-start');
    let resolveReady,
      rejectReady,
      resolveExit,
      exited = false;
    const ready = new Promise((yes, no) => {
      resolveReady = yes;
      rejectReady = no;
    });
    const closed = new Promise((yes) => {
      resolveExit = yes;
    });
    const task = {
      options,
      ready,
      closed,
      exit() {
        if (exited) return;
        exited = true;
        mock.events.push('job-exit');
        resolveExit({ code: mock.exitCode });
      },
      close: jest.fn(() => {
        rejectReady(Error('utility closed'));
        if (!mock.deferExit) task.exit();
      }),
    };
    options.broker.signal.addEventListener('abort', () => task.close(), { once: true });
    // Exit and readiness may settle while a borrowed broker callback is pending.
    // The controller, rather than this mock, must drain that callback.
    Promise.resolve()
      .then(() => mock.scenario(options, task))
      .then(resolveReady, rejectReady);
    mock.tasks.push(task);
    mock.task = task;
    return task;
  }),
}));
const { createHash } = require('crypto');
const { createPrivacyScope, getPrivacyContext } = require("../src/owners/context-bindings.js");
const { sample } = require("../tools/owner-test-staging/fixtures/scripts/fixtures/railgun-own-txid-data.js");
const { digestRailgunPrivateCapsule } = require("../src/data/railgun-private-capsule.js");
const { normalizeRailgunTxidWitness } = require("../src/data/railgun-txid-note-witness.js");
const { classifyRailgunTxidContinuity } = require("../src/data/railgun-txid-omissions.js");
const { normalizeRailgunPoiPayload } = require("../src/data/railgun-poi-payload.js");
const { normalizeRailgunPoiOutputRecoveryInput } = require("../src/owners/railgun-poi-output-recovery-data.js");
const { REQUIRED_LIST } = require("../src/data/railgun-poi-records.js");
const {
  recoverRailgunAttemptedPoiOutput,
  recoverRailgunPoiOutput,
  recoverRailgunPoiOutputCompleted,
  recoverRailgunPoiOutputForSubmission,
} = require("../src/owners/railgun-poi-output-recovery.js");
const { withRailgunViewingCredential } = require("../src/owners/railgun-identity.js");
const { withRailgunOwnOperationRecovery } = require("../src/owners/railgun-own-operation.js");
const {
  preflightRailgunOwnPoi,
  preflightRailgunRetainedPoiCompleted,
  preflightRailgunRetainedPoiForSubmission,
} = require("../src/owners/railgun-own-witness.js");
const { startRailgunProcess } = require("../src/owners/railgun-process.js");
const hex = (n) => BigInt(n).toString(16).padStart(64, '0');
const prefixed = (n) => '0x' + hex(n);
const copy = (v) => JSON.parse(JSON.stringify(v));
const sha = (v) => createHash('sha256').update(v).digest('hex');
let options, gates, operations, claims;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  promise.catch(() => {});
  const gate = { promise, resolve, reject };
  gates.push(gate);
  return gate;
};
const waitFor = async (predicate) => {
  for (let i = 0; i < 300 && !predicate(); i++) await Promise.resolve();
  expect(predicate()).toBe(true);
};
const run = (input = options) => {
  const work = recoverRailgunPoiOutput(input);
  operations.push(work);
  return work;
};
function configure(unshield = false) {
  // Real structural validators, not cryptographic proofs. Native qualification
  // separately supplies a real encrypted record, preflight and utility.
  const ownEvidence =
    unshield === 'partial'
      ? require("../tools/owner-test-staging/fixtures/scripts/fixtures/railgun-partial-own-txid-data.js").samplePartial()
      : sample(unshield);
  const capsule = ownEvidence.capsule;
  const state = { count: 5, root: hex(11), transcript: hex(12), breaks: [] };
  const witness = {
    row: copy(ownEvidence.row),
    leaf: hex(8),
    railgunTxid: hex(9),
    rowSha256: sha(JSON.stringify(ownEvidence.row)),
    index: 1,
    elements: Array(16).fill(hex(0)),
    root: state.root,
    checkpointIndex: 4,
    transcript: state.transcript,
    continuity: classifyRailgunTxidContinuity(4, []),
    globalTxidCompleteness: false,
  };
  const descriptor = {
    walletId: capsule.walletId,
    instanceId: unshield ? sample().capsule.selection.recipient : capsule.selection.recipient,
    masterPublicKey: hex(3),
    spendingPublicKey: [hex(4), hex(5)],
    viewingPublicKey: hex(6),
    accountIndex: 0,
  };
  mock.identity.descriptor = copy(descriptor);
  mock.enrollment.descriptor = copy(descriptor);
  const creator = {
    type: 'Shield',
    tree: 0,
    position: 1,
    preimage: {
      npk: prefixed(3),
      value: '1000',
      token: {
        tokenType: 0,
        tokenAddress: require("../src/railgun-shield-pins.json").wrappedNative,
        tokenSubID: prefixed(0),
      },
    },
    ciphertext: {
      encryptedBundle: [prefixed(4), prefixed(5), prefixed(6)],
      shieldKey: prefixed(7),
    },
  };
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
    submitter: ownEvidence.transaction.from,
    provedTransaction: copy(ownEvidence.transaction),
    intent: copy(ownEvidence.record.intent),
    projection: { included: true, blockHash: ownEvidence.receipt.blockHash },
    record: copy(ownEvidence.record),
  };
  mock.fresh = {
    status: 'captured',
    publicIdentity: copy(mock.publicIdentity),
    observations: { archiveAnchorChecked: true },
    creatorClassification: { type: 'Shield', legacy: false },
    capture: copy(mock.capture),
    poiPreparation: { creator, ownEvidence, state, witness },
    witness: normalizeRailgunTxidWitness(witness, state),
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
    blindedCommitmentsOut: unshield === true ? [] : [prefixed(22)],
    railgunTxidIfHasUnshield: unshield ? prefixed(9) : '0x00',
  });
  mock.entry = {
    capsuleDigest: mock.capture.capsuleDigest,
    bindingDigest: mock.capture.bindingDigest,
    selector: copy(mock.capture.selector),
    payload,
    payloadSha256: sha(JSON.stringify(payload)),
    inputSha256: hex(23),
    revision: 1,
    state: 'prepared',
  };
  options.capsuleDigest = mock.entry.capsuleDigest;
}
function changePayload(change) {
  const payload = copy(mock.entry.payload);
  change(payload);
  mock.entry.payload = payload;
  mock.entry.payloadSha256 = sha(JSON.stringify(payload));
}
const keyWire = (job) => ({
  id: 1,
  method: 'key',
  purpose: 'poi-output-recover',
  inputSha256: sha(job.input),
});
const resultWire = (job) => ({
  id: 2,
  method: 'result',
  value: {
    recoveryInputSha256: sha(job.input),
    payloadSha256: JSON.parse(job.input).binding.payloadSha256,
    output: {
      blindedCommitmentsOut: [prefixed(22)],
      railgunTxidIfHasUnshield:
        JSON.parse(job.input).preparation.ownEvidence.capsule.selection.kind ===
        'railgun-partial-unshield'
          ? '0x' + JSON.parse(job.input).preparation.witness.railgunTxid
          : '0x00',
    },
    engineSha256: require("../src/execution/railgun-engine-manifest.json").sha256,
    sourceAuthenticated: false,
    proofVerified: false,
    membershipAuthenticated: false,
    rootAccepted: false,
    disclosureEnabled: false,
    spendingEnabled: false,
    guards: { attempts: 0, canaries: 1, hooks: ['fixture.guard'] },
  },
});
async function sendKey(job) {
  const message = keyWire(job);
  mock.keyMutation(message);
  const bytes = await job.broker.dispatch(JSON.stringify(message));
  mock.copies.push(bytes);
  mock.events.push('key-copy');
  return bytes;
}
async function sendResult(job) {
  const message = resultWire(job);
  mock.resultMutation(message);
  const result = await job.broker.dispatch(JSON.stringify(message));
  mock.events.push('result');
  return result;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  gates = [];
  operations = [];
  claims = [];
  mock = {
    destination: Object.freeze({}),
    caller: new AbortController(),
    identityAbort: new AbortController(),
    enrollmentAbort: new AbortController(),
    coordinatorAbort: new AbortController(),
    storeAbort: new AbortController(),
    identityCurrent: true,
    publicCurrent: true,
    runtimeCurrent: true,
    publicIdentity: { generationId: 'current', sourceId: 'source', publicId: 'public' },
    phase: false,
    tasks: [],
    copies: [],
    borrowed: [],
    events: [],
    insideCredential: false,
    deferExit: false,
    startError: false,
    exitCode: 'RAILGUN_PROCESS_CLOSED',
    windowBudget: Infinity,
    keyMutation: () => {},
    resultMutation: () => {},
  };
  mock.scope = createPrivacyScope({
    profileId: 'output-recovery-unit',
    signal: mock.enrollmentAbort.signal,
  });
  mock.identity = { signal: mock.identityAbort.signal };
  mock.coordinator = { signal: mock.coordinatorAbort.signal };
  mock.store = {
    prepare: jest.fn(() => {
      throw Error('unexpected prepare');
    }),
    beginAttempt: jest.fn(() => {
      throw Error('unexpected attempt');
    }),
    signal: mock.storeAbort.signal,
    get: jest.fn(async () => {
      mock.events.push('store-get');
      if (mock.insideCredential) throw Error('store read inside credential');
      return copy(mock.entry);
    }),
  };
  mock.enrollment = {
    directory: '/synthetic-output-recovery-account',
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
  options = {
    identity: mock.identity,
    enrollment: mock.enrollment,
    coordinator: mock.coordinator,
    archive: '/fixture-engine.asar',
    capsuleDigest: hex(1),
    signal: mock.caller.signal,
  };
  configure();
  mock.preflight = jest.fn(async () => {
    mock.events.push('preflight');
    return copy(mock.fresh);
  });
  mock.reattest = jest.fn(async () => copy(mock.capture));
  mock.recoveryStart = jest.fn(async () => {});
  mock.recoveryPost = jest.fn(async () => {});
  mock.credential = jest.fn(async (use) => {
    expect(mock.phase).toBe(true);
    mock.events.push('derive');
    const key = Buffer.alloc(32, 7);
    mock.borrowed.push(key);
    mock.insideCredential = true;
    try {
      return await use({ viewingKey: key });
    } finally {
      key.fill(0);
      mock.insideCredential = false;
      mock.events.push('credential-wipe');
    }
  });
  mock.scenario = async (job) => {
    await sendKey(job);
    await sendResult(job);
  };
});
afterEach(async () => {
  mock.caller.abort();
  for (const gate of gates) gate.resolve();
  for (const task of mock.tasks) task.exit();
  await Promise.allSettled(operations);
  for (const claim of claims) claim.release();
  expect(mock.store.prepare).not.toHaveBeenCalled();
  expect(mock.store.beginAttempt).not.toHaveBeenCalled();
  mock.scope.close();
  jest.restoreAllMocks();
  jest.useRealTimers();
});


// --- Explicitly marked retry handoff -------------------------------------------
describe('marked retry handoff', () => {
  const ATTEMPTED_AT = 1791111111111;
  const attempt = () => {
    const submission = require('../src/data/railgun-poi-submit-data.js').prepareRailgunPoiSubmission({
      payload: mock.entry.payload,
      requestId: ATTEMPTED_AT,
    });
    mock.entry = copy({ ...mock.entry, state: 'attempted', attempt: { attemptedAt: ATTEMPTED_AT, submission } });
  };
  const handoff = (marker = { retry: true }) => {
    const evidence = sample(false);
    return {
      entry: copy(mock.entry),
      capture: copy(mock.capture),
      observation: {
        transaction: copy(evidence.transaction),
        receipt: copy(evidence.receipt),
        captureBindingDigest: mock.capture.bindingDigest,
      },
      ...marker,
    };
  };
  const submit = (input) => {
    const work = recoverRailgunPoiOutputForSubmission({ ...options, sourceDestination: mock.destination }, input);
    operations.push(work);
    return work;
  };
  beforeEach(() => configure(false));
  test('admits an attempted entry without a reserved retry; preflight gets the original three keys', async () => {
    attempt();
    const input = handoff();
    expect((await submit(input)).status).toBe('matched');
    expect(preflightRailgunRetainedPoiForSubmission).toHaveBeenCalledTimes(1);
    const [, privateInput] = preflightRailgunRetainedPoiForSubmission.mock.calls[0];
    expect(Object.keys(privateInput).sort()).toEqual(['capture', 'entry', 'observation']);
    expect(privateInput.entry).toEqual(mock.entry);
  });
  test('refuses a prepared entry under the retry marker', async () => {
    expect(await submit(handoff())).toEqual({ status: 'refused', stage: 'stored' });
    expect(preflightRailgunRetainedPoiForSubmission).not.toHaveBeenCalled();
  });
  test('refuses an entry whose single retry is already reserved', async () => {
    attempt();
    mock.entry = copy({
      ...mock.entry,
      retry: { reservedAt: ATTEMPTED_AT + 1, bodySha256: mock.entry.attempt.submission.bodySha256 },
    });
    expect(await submit(handoff())).toEqual({ status: 'refused', stage: 'stored' });
    expect(preflightRailgunRetainedPoiForSubmission).not.toHaveBeenCalled();
  });
  test.each([false, 'yes', 1, null])('a retry marker %p other than true refuses before the store', async (retry) => {
    attempt();
    expect((await submit(handoff({ retry }))).status).toBe('refused');
    expect(mock.enrollment.openPoiIntents).not.toHaveBeenCalled();
    expect(preflightRailgunRetainedPoiForSubmission).not.toHaveBeenCalled();
  });
  test('an unmarked handoff still refuses an attempted entry', async () => {
    attempt();
    expect(await submit(handoff({}))).toEqual({ status: 'refused', stage: 'stored' });
    expect(preflightRailgunRetainedPoiForSubmission).not.toHaveBeenCalled();
  });
});
