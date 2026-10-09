/** Package-owned tests for the explicitly marked replacement-proof handoff into
 * cold validation's fixed submission route. The harness is the staged cold-
 * validation test's setup, copied with only its import paths changed. */
require('../tools/owner-test-staging/context-host.cjs');
// Authority boundaries are mocked; payload/capsule normalization, capture
// comparison, privacy contexts and the directory-owned account phase are real.
// These controller tests do not establish cryptographic proof validity.
let mock;
jest.mock("../src/owners/railgun-account-enrollment.js", () => ({
  isRailgunAccountEnrollment: (value) => mock.enrollments.has(value),
}));
jest.mock("../src/owners/railgun-identity.js", () => ({
  assertRailgunIdentity: jest.fn((identity, handle) => {
    const { getPrivacyContext } = require("../src/owners/context-bindings.js");
    const context = getPrivacyContext(handle);
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
    return JSON.parse(JSON.stringify(identity.descriptor));
  }),
  withRailgunViewingCredential: jest.fn(() => {
    throw Error('unexpected direct key access');
  }),
}));
jest.mock("../src/owners/railgun-public-policy.js", () => ({
  getRailgunPublicPolicy: (archive) => {
    if (archive !== '/fixture-engine.asar') throw Error('policy');
    return 'fixture-policy';
  },
}));
jest.mock("../src/owners/railgun-account-public.js", () => ({
  getRailgunAccountPublicDestination: jest.fn((coordinator, enrollment, policy) => {
    if (
      coordinator !== mock.coordinator ||
      enrollment !== mock.enrollment ||
      policy !== 'fixture-policy' ||
      !mock.publicCurrent
    )
      throw Error('destination owner');
    return mock.destination;
  }),
  assertRailgunAccountPublicDestination: jest.fn((coordinator, enrollment, destination, policy) => {
    if (
      coordinator !== mock.coordinator ||
      enrollment !== mock.enrollment ||
      destination !== mock.destination ||
      policy !== 'fixture-policy' ||
      !mock.publicCurrent
    )
      throw Error('destination');
    return destination;
  }),
  getRailgunAccountPublicIdentity: jest.fn((coordinator, enrollment, policy) => {
    if (
      coordinator !== mock.coordinator ||
      !mock.enrollments.has(enrollment) ||
      coordinator.signal.aborted ||
      !mock.publicCurrent ||
      policy !== 'fixture-policy'
    )
      throw Error('PRIVATE public identity diagnostic');
    return JSON.parse(JSON.stringify(mock.publicIdentity));
  }),
}));
jest.mock("../src/execution/railgun-engine-runtime.js", () => ({
  verifyRailgunEngineRuntime: jest.fn((archive) => {
    if (archive !== '/fixture-engine.asar') throw Error('engine runtime');
    return archive;
  }),
}));
jest.mock("../src/execution/railgun-prover-runtime.js", () => ({
  verifyRailgunProverRuntime: jest.fn((archive) => {
    if (archive !== '/fixture-prover.asar') throw Error('prover runtime');
    return archive;
  }),
}));
jest.mock("../src/owners/railgun-poi-output-recovery.js", () => ({
  recoverRailgunPoiOutput: jest.fn((options) => mock.output(options)),
  recoverRailgunPoiOutputCompleted: jest.fn((options) => mock.output(options)),
  recoverRailgunPoiOutputForSubmission: jest.fn((options, input) => mock.output(options, input)),
}));
jest.mock("../src/owners/railgun-own-receipt.js", () => ({
  assertPreparedRailgunOwnReceipt: jest.fn((reader, input) => mock.assertReader(reader, input)),
  observePreparedRailgunOwnReceipt: jest.fn((reader, input) => mock.observeReader(reader, input)),
}));
jest.mock("../src/owners/railgun-poi-verifier.js", () => ({
  verifyRailgunPoiPayload: jest.fn((options) => mock.verify(options)),
}));
jest.mock("../src/owners/railgun-txid-policy.js", () => ({
  getRailgunTxidPolicy: jest.fn(() => mock.txidPolicy),
}));
jest.mock("../src/owners/railgun-account-txid.js", () => ({
  openRailgunAccountTxid: jest.fn((options) => mock.openTxid(options)),
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
      mock.events.push('final-open');
      await mock.recoveryStart();
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
      mock.events.push('final-close');
    }
  }),
}));
// Sentinels: the composition delegates existing output preflight and keyless
// verification. It must not add proof-specific roots, proving, sending or keys.
jest.mock("../src/owners/railgun-poi-root.js", () => ({
  createRailgunPoiRootSource: jest.fn(() => {
    throw Error('unexpected root query');
  }),
  createRailgunPoiTxidRootSource: jest.fn(() => {
    throw Error('unexpected proof TXID root query');
  }),
}));
jest.mock("../src/owners/railgun-process.js", () => ({
  startRailgunProcess: jest.fn(() => {
    throw Error('unexpected direct utility');
  }),
}));
jest.mock("../src/owners/railgun-own-poi-proof.js", () => ({
  proveRailgunOwnPoi: jest.fn(() => {
    throw Error('unexpected proof generation');
  }),
  assertRailgunOwnPoiProof: jest.fn(() => {
    throw Error('raw history restoration');
  }),
}));
const { createHash } = require('crypto');
const { createPrivacyScope, getPrivacyContext } = require("../src/owners/context-bindings.js");
const { sample } = require("../tools/owner-test-staging/fixtures/scripts/fixtures/railgun-own-txid-data.js");
const { samplePartial } = require("../tools/owner-test-staging/fixtures/scripts/fixtures/railgun-partial-own-txid-data.js");
const { digestRailgunPrivateCapsule } = require("../src/data/railgun-private-capsule.js");
const { normalizeRailgunPoiPayload } = require("../src/data/railgun-poi-payload.js");
const { REQUIRED_LIST } = require("../src/data/railgun-poi-records.js");
const { claimRailgunAccountPhase } = require("../src/owners/railgun-account-phase.js");
const {
  recoverRailgunPoiOutput,
  recoverRailgunPoiOutputCompleted,
} = require("../src/owners/railgun-poi-output-recovery.js");
const {
  getRailgunAccountPublicDestination,
  assertRailgunAccountPublicDestination,
} = require("../src/owners/railgun-account-public.js");
const { verifyRailgunPoiPayload } = require("../src/owners/railgun-poi-verifier.js");
const { withRailgunOwnOperationRecovery } = require("../src/owners/railgun-own-operation.js");
const {
  validateRailgunRetainedPoi,
  validateRailgunRetainedPoiHistory,
  validateRailgunRetainedPoiForSubmission,
} = require("../src/owners/railgun-poi-cold-validation.js");
const { openRailgunAccountTxid } = require("../src/owners/railgun-account-txid.js");
const { captureRailgunOwnOperationSelector } = require("../src/owners/railgun-own-operation.js");
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
let options, gates, operations;
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
  const work = validateRailgunRetainedPoi(input);
  operations.push(work);
  return work;
};
const freshOptions = () => ({ ...options, signal: new AbortController().signal });
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
    provedTransaction: copy(evidence.transaction),
    intent: copy(evidence.record.intent),
    projection: { included: true, blockHash: evidence.receipt.blockHash },
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
  mock.outputResult = {
    status: 'matched',
    capsuleDigest: mock.entry.capsuleDigest,
    revision: 1,
    payloadSha256: mock.entry.payloadSha256,
    outputMatched: true,
    viewingKeyReleases: unshield && !partial ? 0 : 1,
    viewingUtilityExitObserved: !unshield || partial,
    proofVerified: false,
    originalInputReconstructed: false,
    originalRootsAccepted: false,
    membershipAuthenticated: false,
    sourceAuthenticated: false,
    disclosureEnabled: false,
    spendingEnabled: false,
  };
  mock.verified = {
    payloadSha256: mock.entry.payloadSha256,
    proofVerified: true,
    independentlyVerified: true,
    utilityExitObserved: true,
    sourceAuthenticated: false,
    membershipAuthenticated: false,
    rootAccepted: false,
    metadataAuthenticated: false,
    ownershipAuthenticated: false,
    disclosureEnabled: false,
    spendingEnabled: false,
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  gates = [];
  operations = [];
  mock = {
    destination: Object.freeze({}),
    caller: new AbortController(),
    identityAbort: new AbortController(),
    enrollmentAbort: new AbortController(),
    coordinatorAbort: new AbortController(),
    storeAbort: new AbortController(),
    enrollments: new Set(),
    events: [],
    identityCurrent: true,
    publicCurrent: true,
    publicIdentity: { generationId: hex(1), sourceId: hex(2), publicId: hex(3) },
  };
  mock.scope = createPrivacyScope({
    profileId: 'poi-cold-validation-unit',
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
    close: jest.fn(() => {
      throw Error('unexpected caller-owned store closure');
    }),
  };
  mock.enrollment = {
    directory: '/synthetic-cold-validation-account',
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
    archive: '/fixture-engine.asar',
    proverArchive: '/fixture-prover.asar',
    artifactDirectory: '/fixture-artifacts',
    capsuleDigest: hex(1),
    signal: mock.caller.signal,
  };
  configure();
  mock.output = jest.fn(async () => {
    mock.events.push('output');
    return copy(mock.outputResult);
  });
  mock.verify = jest.fn(async ({ handle }) => {
    expect(getPrivacyContext(handle).subject).toMatchObject({
      role: 'prover',
      operation: 'poi-verify',
    });
    expect(() => claimRailgunAccountPhase(mock.enrollment, 'wallet')).toThrow();
    mock.events.push('verify');
    return copy(mock.verified);
  });
  mock.reattest = jest.fn(async () => copy(mock.capture));
  mock.recoveryStart = jest.fn(async () => {});
  mock.recoveryPost = jest.fn(async () => {});
});
afterEach(async () => {
  mock.caller.abort();
  for (const gate of gates) gate.resolve();
  await Promise.allSettled(operations);
  expect(mock.store.prepare).not.toHaveBeenCalled();
  expect(mock.store.close).not.toHaveBeenCalled();
  expect(require("../src/owners/railgun-poi-root.js").createRailgunPoiRootSource).not.toHaveBeenCalled();
  expect(require("../src/owners/railgun-poi-root.js").createRailgunPoiTxidRootSource).not.toHaveBeenCalled();
  expect(require("../src/owners/railgun-process.js").startRailgunProcess).not.toHaveBeenCalled();
  expect(require("../src/owners/railgun-own-poi-proof.js").proveRailgunOwnPoi).not.toHaveBeenCalled();
  expect(require("../src/owners/railgun-own-poi-proof.js").assertRailgunOwnPoiProof).not.toHaveBeenCalled();
  expect(require("../src/owners/railgun-identity.js").withRailgunViewingCredential).not.toHaveBeenCalled();
  mock.scope.close();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// New historical composition keeps real structural normalizers and account
// phases. Utility cryptography and authenticated mirror ownership are mocked.
const runHistory = (input = options) => {
  const work = validateRailgunRetainedPoiHistory(input);
  operations.push(work);
  return work;
};
function configureHistory(unshield = false) {
  configure(unshield);
  mock.txidPolicy = hex(80);
  mock.capture.provedTransaction = {
    chainId: 11155111,
    to: mock.capture.provedTransaction.to,
    value: '0',
    data: mock.capture.provedTransaction.input,
  };
  const partial = unshield === 'partial';
  const row = (partial ? samplePartial() : sample(unshield)).row;
  const { transaction, expected } =
    require("../src/owners/railgun-transact-intent.js").extractRailgunTransactIntent(
      mock.capture.provedTransaction
    );
  const bindingDigest = createHash('sha256')
    .update(partial ? 'freedom:railgun:own-selector-v2\0' : 'freedom:railgun:own-selector-v1\0')
    .update(JSON.stringify(transaction))
    .digest('hex');
  mock.derived = {
    inputSha256: sha({
      archive: options.archive,
      facts: {
        nullifiers: [expected.nullifier],
        commitments: partial
          ? [expected.changeCommitment, expected.unshieldCommitment]
          : [expected.commitment],
        boundParamsHash: expected.boundParamsHash,
      },
      bindingDigest,
    }),
    bindingDigest,
    railgunTxid: hex(9),
    selectorDerived: true,
    accountAuthenticated: false,
    pathVerified: false,
    sourceAuthenticated: false,
    rootAccepted: false,
    currentCanonicalityVerified: false,
    finalityVerified: false,
    rowMetadataAuthenticated: false,
    poiVerified: false,
    globalTxidCompleteness: false,
    spendingEnabled: false,
    utilityExitObserved: true,
  };
  mock.state = {
    version: 1,
    count: 5,
    root: hex(81),
    transcript: hex(82),
    after: row.graphID,
    verificationHash: row.verificationHash,
    branches: Array(16).fill(hex(83)),
    breaks: [],
  };
  mock.checkpoint = {
    state: mock.state,
    store: { schema: 'wallet-store-v1', storeId: hex(84), count: 20, bytes: 5000, sha256: hex(85) },
    validation: { index: 4, root: mock.state.root, accepted: true },
  };
  mock.witness = {
    row,
    leaf: hex(86),
    railgunTxid: mock.derived.railgunTxid,
    rowSha256: sha(row),
    index: 2,
    elements: Array(16).fill(hex(87)),
    root: mock.state.root,
    checkpointIndex: 4,
    transcript: mock.state.transcript,
    continuity: require("../src/data/railgun-txid-omissions.js").classifyRailgunTxidContinuity(4, []),
    globalTxidCompleteness: false,
  };
  mock.historical = {
    version: 1,
    tree: 0,
    index: mock.entry.payload.txidMerklerootIndex,
    root: mock.entry.payload.txidMerkleroot,
    checkpointIndex: 4,
    checkpointRoot: mock.state.root,
    transcript: mock.state.transcript,
    localPrefixComputed: true,
    globalTxidCompleteness: false,
    ownershipVerified: false,
    eventCoverageVerified: false,
    rootAccepted: false,
    spendingEnabled: false,
  };
  mock.selector = jest.fn(async () => {
    const phase = claimRailgunAccountPhase(mock.enrollment, 'recovery');
    try {
      mock.events.push('selector');
      await mock.selectorWork();
      return { status: 'captured', capture: copy(mock.capture), derived: copy(mock.derived) };
    } finally {
      phase.release();
      mock.events.push('selector-close');
    }
  });
  mock.selectorWork = jest.fn(async () => {});
  mock.opening = jest.fn(async () => {});
  mock.mirrorDrain = jest.fn(async () => {});
  mock.inspect = jest.fn(async () => ({ checkpoint: copy(mock.checkpoint), pending: null }));
  mock.witnessRead = jest.fn(async () => ({
    witness: copy(mock.witness),
    ownershipVerified: false,
    eventCoverageVerified: false,
    rootAccepted: false,
    spendingEnabled: false,
  }));
  mock.historyRead = jest.fn(async () => copy(mock.historical));
  mock.openTxid = jest.fn(async () => {
    const phase = claimRailgunAccountPhase(mock.enrollment, 'txid');
    const aborted = new AbortController();
    const pending = new Set();
    let closing;
    const read = (name, handler) =>
      jest.fn((...args) => {
        mock.events.push(name);
        const work = Promise.resolve().then(() => handler(...args));
        pending.add(work);
        work.then(
          () => pending.delete(work),
          () => pending.delete(work)
        );
        return work;
      });
    mock.txid = {
      policy: mock.txidPolicy,
      publicIdentity: copy(mock.publicIdentity),
      signal: aborted.signal,
      inspect: read('mirror-inspect', (...args) => mock.inspect(...args)),
      witness: read('mirror-witness', (...args) => mock.witnessRead(...args)),
      historicalRoot: read('mirror-history', (...args) => mock.historyRead(...args)),
      advance: jest.fn(() => {
        throw Error('unexpected mirror repair');
      }),
      cover: jest.fn(() => {
        throw Error('unexpected full mirror source coverage');
      }),
      close: jest.fn(() => {
        aborted.abort();
        if (!closing)
          closing = (async () => {
            await Promise.allSettled([...pending]);
            await mock.mirrorDrain();
            phase.release();
            mock.events.push('mirror-close');
          })();
        return closing;
      }),
    };
    mock.events.push('mirror-open');
    try {
      await mock.opening();
      return mock.txid;
    } catch (error) {
      await mock.txid.close();
      throw error;
    }
  });
}

describe('marked replacement handoff', () => {
  let handoff, observed;
  const submit = (input = handoff, supplied = options) => {
    const work = validateRailgunRetainedPoiForSubmission(supplied, input);
    operations.push(work);
    return work;
  };
  function prepare(unshield = false) {
    configureHistory(unshield);
    const evidence = sample(unshield);
    mock.capture.projection.hash = evidence.transaction.hash;
    handoff = {
      entry: copy(mock.entry),
      capture: copy(mock.capture),
      sourceDestination: mock.destination,
      destination: Object.freeze({}),
      reader: Object.freeze({}),
    };
    const retained = { ...handoff, enrollment: mock.enrollment, capture: copy(handoff.capture) };
    let claimed = false;
    mock.assertReader = jest.fn((reader, input) => {
      expect(reader).toBe(retained.reader);
      expect(input.enrollment).toBe(retained.enrollment);
      expect(input.destination).toBe(retained.destination);
      expect(input.capture).toEqual(retained.capture);
      if (claimed) throw Error('already claimed');
      mock.events.push('receipt-assert');
    });
    observed = {
      status: 'observed',
      observation: {
        transaction: copy(evidence.transaction),
        receipt: copy(evidence.receipt),
        captureBindingDigest: retained.capture.bindingDigest,
      },
    };
    mock.observeReader = jest.fn((reader, input) => {
      expect(reader).toBe(retained.reader);
      expect(Object.keys(input)).toEqual(['timeoutMs']);
      expect(input.timeoutMs).toBeGreaterThan(0);
      expect(input.timeoutMs).toBeLessThanOrEqual(60000);
      if (claimed) throw Error('already claimed');
      claimed = true;
      mock.events.push('receipt-consumed');
      return mock.receiptWork();
    });
    mock.receiptWork = jest.fn(async () => copy(observed));
  }
  beforeEach(() => prepare());
  const ATTEMPTED_AT = 1791111111111;
  const CIRCUIT = {
    from: '2f4dcbf58d383204e09240863a6f6eff249071849e5161801ebfe83691037b23',
    to: 'b7ca7ba048666fb0e17efd0af1e407a8dcb0906bfaf2f20e362ed40cbec6f4d8',
  };
  const sha256 = (v) => require('crypto').createHash('sha256').update(v).digest('hex');
  // Attempted, retry spent, one unsent replacement with its own roots and proof.
  function replace({ retry = true, sent = false } = {}) {
    const { prepareRailgunPoiSubmission } = require("../src/data/railgun-poi-submit-data.js");
    const submission = prepareRailgunPoiSubmission({ payload: mock.entry.payload, requestId: ATTEMPTED_AT });
    const payload = normalizeRailgunPoiPayload({
      ...copy(mock.entry.payload),
      proof: { pi_a: ['11', '12'], pi_b: [['13', '14'], ['15', '16']], pi_c: ['17', '18'] },
    });
    const reproof = {
      circuit: CIRCUIT,
      payload: copy(payload),
      payloadSha256: sha256(JSON.stringify(payload)),
      inputSha256: hex(77),
      revision: 1,
    };
    if (sent)
      reproof.attempt = {
        attemptedAt: ATTEMPTED_AT + 5000,
        submission: prepareRailgunPoiSubmission({ payload, requestId: ATTEMPTED_AT + 5000 }),
      };
    mock.entry = copy({
      ...mock.entry,
      state: 'attempted',
      attempt: { attemptedAt: ATTEMPTED_AT, submission },
      ...(retry ? { retry: { reservedAt: ATTEMPTED_AT + 1000, bodySha256: submission.bodySha256 } } : {}),
      ...(retry ? { reproof } : {}),
    });
    mock.outputResult = { ...mock.outputResult, payloadSha256: reproof.payloadSha256 };
    mock.verified = { ...mock.verified, payloadSha256: reproof.payloadSha256 };
    handoff.entry = copy(mock.entry);
    return reproof;
  }
  test('validates the replacement payload, never the original, and forwards the marker', async () => {
    const reproof = replace();
    const result = await submit({ ...handoff, reproof: true });
    expect(result).toMatchObject({
      status: 'validated',
      revision: mock.entry.revision,
      payloadSha256: reproof.payloadSha256,
      proofVerified: true,
    });
    expect(mock.verify).toHaveBeenCalledTimes(1);
    expect(mock.verify.mock.calls[0][0].payload).toEqual(reproof.payload);
    const [, privateInput] = mock.output.mock.calls[0];
    expect(privateInput).toEqual({
      entry: handoff.entry,
      capture: handoff.capture,
      reproof: true,
      observation: observed.observation,
    });
  });
  test('refuses output recovery bound to the original payload', async () => {
    replace();
    mock.outputResult = { ...mock.outputResult, payloadSha256: mock.entry.payloadSha256 };
    expect((await submit({ ...handoff, reproof: true })).status).toBe('refused');
    expect(mock.verify).not.toHaveBeenCalled();
  });
  test('refuses a verifier result for the original payload', async () => {
    replace();
    mock.verified = { ...mock.verified, payloadSha256: mock.entry.payloadSha256 };
    expect((await submit({ ...handoff, reproof: true })).status).toBe('refused');
  });
  test.each([
    ['without a spent retry', { retry: false }],
    ['whose replacement is already attempted', { sent: true }],
  ])('refuses an entry %s before consuming the receipt', async (_name, shape) => {
    replace(shape);
    expect(await submit({ ...handoff, reproof: true })).toEqual({ status: 'refused', stage: 'stored' });
    expect(mock.observeReader).not.toHaveBeenCalled();
    expect(mock.output).not.toHaveBeenCalled();
  });
  test('refuses a prepared entry under the replacement marker', async () => {
    expect(await submit({ ...handoff, reproof: true })).toEqual({ status: 'refused', stage: 'stored' });
    expect(mock.observeReader).not.toHaveBeenCalled();
  });
  test.each([false, 'yes', 1, null])('a replacement marker %p other than true refuses', async (reproof) => {
    replace();
    expect((await submit({ ...handoff, reproof })).status).toBe('refused');
    expect(mock.observeReader).not.toHaveBeenCalled();
  });
  test('refuses both markers together', async () => {
    replace();
    expect((await submit({ ...handoff, retry: true, reproof: true })).status).toBe('refused');
    expect(mock.observeReader).not.toHaveBeenCalled();
  });
  test('an unmarked or retry-marked handoff refuses an entry with a replacement', async () => {
    replace();
    expect(await submit(handoff)).toEqual({ status: 'refused', stage: 'stored' });
    expect(await submit({ ...handoff, retry: true })).toEqual({ status: 'refused', stage: 'stored' });
    expect(mock.observeReader).not.toHaveBeenCalled();
  });
});
