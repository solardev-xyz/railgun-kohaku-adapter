/** POI intent store V5 replacement proof over a controlled in-memory storage
 * port and floor. No real encryption, profile lock, proof, verifier or network. */
const fs = require('fs'),
  os = require('os'),
  path = require('path');
const { createHash } = require('crypto');
let state;
jest.mock('../src/owners/context-bindings', () => require('./fixtures/owner-privacy-context'));
jest.mock('../src/owners/host-bindings', () => ({
  storage: {
    getPrivacyStoragePath: (_handle, directory) => require('path').join(directory, 'poi-intents.json'),
    createPrivacyStorage: () => ({
      get: async (name) => state.records.get(name) ?? null,
      update: async (name, callback) => {
        const next = callback(state.records.get(name) ?? null);
        if (state.failWrite) throw Error('write failed');
        state.records.set(name, next);
        state.writes++;
      },
    }),
  },
}));
jest.mock('../src/owners/railgun-account-enrollment', () => ({
  isRailgunAccountEnrollment: (value) => value === state.enrollment,
}));
jest.mock('../src/owners/railgun-own-operation', () => ({
  withRailgunOwnOperationRecovery: async (_options, use) => {
    const window = {
      capture: state.capture,
      assertCurrent: () => {},
      reattest: async () => state.capture,
    };
    try {
      return { status: 'used', value: await use(window) };
    } catch {
      return { status: 'refused', stage: 'operation' };
    }
  },
}));
jest.mock('../src/data/railgun-own-poi-binding', () => ({
  assertRailgunOwnPoiCapture: (a, b) => expect(a).toEqual(b),
  assertRailgunOwnPoiStableCapture: (a, b) => expect(a).toEqual(b),
}));
jest.mock('../src/data/railgun-own-poi-shape-data', () => ({
  assertRailgunOwnPoiPayloadShape: () => {},
}));
// Only this test's genuine proof object authenticates; it returns its history.
jest.mock('../src/owners/railgun-own-poi-proof', () => ({
  assertRailgunOwnPoiProof: (proof) => {
    if (proof !== state.proof) throw Error('unregistered proof');
    return state.history;
  },
}));
jest.mock('../src/owners/railgun-own-poi-proof-data', () => ({
  bindRailgunOwnPoiPayload: (payload) => payload,
}));
// Only this test's completed transition receipt for the exact original payload.
jest.mock('../src/owners/railgun-poi-verifier', () => ({
  assertRailgunRetiredPoiCircuit: (receipt, payloadSha256) => {
    if (receipt !== state.transition || payloadSha256 !== state.transitionPayloadSha256)
      throw Error('unregistered transition');
    return state.circuit;
  },
}));
const context = require('./fixtures/owner-privacy-context');
const { createRailgunPoiIntentStore } = require('../src/owners/railgun-poi-intent-store');
const { prepareRailgunPoiSubmission } = require('../src/data/railgun-poi-submit-data');
const { REQUIRED_LIST } = require('../src/data/railgun-poi-records');
const RECORD = 'railgun-poi-intents-v1';
const CIRCUIT = Object.freeze({
  from: '2f4dcbf58d383204e09240863a6f6eff249071849e5161801ebfe83691037b23',
  to: 'b7ca7ba048666fb0e17efd0af1e407a8dcb0906bfaf2f20e362ed40cbec6f4d8',
});
const hash = (value) => createHash('sha256').update(value).digest('hex');
const hex = (value) => '0x' + value.toString(16).padStart(64, '0');
const walletId = 'a'.repeat(64),
  binding = 'b'.repeat(64);
const payload = (proofSeed = 1, roots = 3) => ({
  listKey: REQUIRED_LIST,
  proof: {
    pi_a: [String(proofSeed), '2'],
    pi_b: [['3', '4'], ['5', '6']],
    pi_c: ['7', '8'],
  },
  poiMerkleroots: [hex(roots).slice(2)],
  txidMerkleroot: hex(roots + 1).slice(2),
  txidMerklerootIndex: 6,
  blindedCommitmentsOut: [hex(5)],
  railgunTxidIfHasUnshield: '0x00',
});
const selector = { tree: 0, position: 7, nullifier: hex(11), noteHash: hex(12) };
const attemptedAt = 1791495220000,
  reservedAt = 1791495330000;
function entry(withRetry = true) {
  const value = payload();
  const submission = prepareRailgunPoiSubmission({ payload: value, requestId: attemptedAt });
  return {
    capsuleDigest: 'c'.repeat(64),
    bindingDigest: 'd'.repeat(64),
    selector,
    payload: value,
    payloadSha256: hash(JSON.stringify(value)),
    inputSha256: 'e'.repeat(64),
    revision: 1,
    state: 'attempted',
    attempt: { attemptedAt, submission },
    ...(withRetry ? { retry: { reservedAt, bodySha256: submission.bodySha256 } } : {}),
  };
}
function documentWith(version, entries) {
  const sequence = entries.reduce(
    (n, v) =>
      n +
      v.revision +
      (v.reproof?.revision || 0) +
      Number(v.state === 'attempted') +
      Number(Boolean(v.retry)) +
      Number(Boolean(v.reproof?.attempt)),
    0
  );
  return JSON.stringify({ version, binding, walletId, lease: 'f'.repeat(64), sequence, entries });
}
// A genuine-looking history: the same capture and the replacement payload.
function history(value = payload(9, 20), overrides = {}) {
  return {
    preparation: { creator: { type: 'Transact' } },
    payload: value,
    expected: {},
    capture: { ...state.capture, capsule: {} },
    payloadSha256: hash(JSON.stringify(value)),
    inputSha256: '9'.repeat(64),
    ...overrides,
  };
}
beforeEach(() => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'owner-poi-reproof-')));
  const controller = new AbortController();
  const scope = context.createPrivacyScope({ profileId: 'public-test', signal: controller.signal });
  const subject = {
    kind: 'private-account',
    principal: 'account',
    chainId: 11155111,
    protocol: 'railgun',
    deployment: 'sepolia',
    role: 'storage',
  };
  const storageHandle = scope.getContext(subject);
  state = {
    directory,
    controller,
    scope,
    records: new Map(),
    floor: null,
    writes: 0,
    capture: { capsuleDigest: 'c'.repeat(64), bindingDigest: 'd'.repeat(64), selector },
    enrollment: {
      binding,
      descriptor: { walletId },
      directory,
      signal: controller.signal,
      getContext: () => storageHandle,
    },
    intentHandle: scope.getContext({ ...subject, operation: RECORD + ':' + walletId }),
    proof: Object.freeze({}),
    transition: Object.freeze({}),
    transitionPayloadSha256: entry().payloadSha256,
    circuit: CIRCUIT,
  };
  state.capture = { ...state.capture, capsule: {} };
  state.history = history();
});
afterEach(() => state.controller.abort());
const openWith = (factory) =>
  factory({
    enrollment: state.enrollment,
    handle: state.intentHandle,
    directory: state.directory,
    key: Buffer.alloc(32, 1),
    binding,
    walletId,
    profileGuard: {},
    create: false,
    readFloor: async () => state.floor,
    advanceFloor: async (value) => {
      state.floor = Math.max(state.floor ?? 0, value);
    },
  });
const open = () => openWith(createRailgunPoiIntentStore);
const seed = (version, entries) => {
  state.records.set(RECORD, documentWith(version, entries));
  state.floor = JSON.parse(state.records.get(RECORD)).sequence;
};
const stored = () => JSON.parse(state.records.get(RECORD));
const prepareOptions = (overrides = {}) => {
  const original = entry();
  return {
    proof: state.proof,
    coordinator: {},
    transition: state.transition,
    expected: {
      capsuleDigest: original.capsuleDigest,
      revision: 1,
      payloadSha256: original.payloadSha256,
      bodySha256: original.attempt.submission.bodySha256,
      attemptedAt,
      reservedAt,
    },
    signal: state.controller.signal,
    ...overrides,
  };
};
const attemptOptions = (reproof, overrides = {}) => ({
  capsuleDigest: 'c'.repeat(64),
  expectedRevision: 1,
  expectedPayloadSha256: entry().payloadSha256,
  expectedReproofRevision: reproof.revision,
  expectedReproofPayloadSha256: reproof.payloadSha256,
  signal: state.controller.signal,
  ...overrides,
});
async function prepared() {
  seed(4, [entry()]);
  const store = await open();
  const result = await store.prepareReproof(prepareOptions());
  expect(result.status).toBe('reproof-prepared');
  return { store, result, reproof: stored().entries[0].reproof };
}

test('a replacement appends to the spent-retry entry, migrates to V5 and keeps the original bytes', async () => {
  seed(4, [entry()]);
  const before = stored();
  const store = await open();
  const result = await store.prepareReproof(prepareOptions());
  expect(result).toEqual({
    status: 'reproof-prepared',
    capsuleDigest: 'c'.repeat(64),
    payloadSha256: state.history.payloadSha256,
    reproofRevision: 1,
    circuit: CIRCUIT,
    proofAuthenticated: false,
    disclosureEnabled: false,
    spendingEnabled: false,
  });
  const after = stored();
  expect(after.version).toBe(5);
  expect(after.sequence).toBe(before.sequence + 1);
  const { reproof, ...unchanged } = after.entries[0];
  expect(unchanged).toEqual(before.entries[0]);
  expect(reproof).toEqual({
    circuit: CIRCUIT,
    payload: payload(9, 20),
    payloadSha256: state.history.payloadSha256,
    inputSha256: '9'.repeat(64),
    revision: 1,
  });
  store.close();
  await store.closed;
  // Cold reopen reads the V5 document unchanged.
  const reopened = await open();
  expect((await reopened.get('c'.repeat(64))).reproof).toEqual(reproof);
  expect(stored()).toEqual({ ...after, lease: expect.any(String) });
  reopened.close();
});

test('a genuine capture lists its selector fields in its own order', async () => {
  seed(4, [entry()]);
  const { tree, position, nullifier, noteHash } = selector;
  state.capture = { ...state.capture, selector: { noteHash, nullifier, position, tree } };
  state.history = history();
  const store = await open();
  expect(await store.prepareReproof(prepareOptions())).toMatchObject({
    status: 'reproof-prepared',
    reproofRevision: 1,
  });
  // The record keeps its own canonical selector.
  expect(Object.keys(stored().entries[0].selector)).toEqual(['tree', 'position', 'nullifier', 'noteHash']);
  store.close();
});

test('a capture of another selector refuses', async () => {
  seed(4, [entry()]);
  state.capture = { ...state.capture, selector: { ...selector, position: 8 } };
  state.history = history();
  const store = await open();
  const writes = state.writes;
  expect((await store.prepareReproof(prepareOptions())).status).toBe('refused');
  expect(state.writes).toBe(writes);
  store.close();
});

test('a Shield-created input prepares on the same terms as a Transact-created one', async () => {
  seed(4, [entry()]);
  state.history = history(undefined, { preparation: { creator: { type: 'Shield' } } });
  const store = await open();
  expect(await store.prepareReproof(prepareOptions())).toMatchObject({
    status: 'reproof-prepared',
    reproofRevision: 1,
  });
  expect(stored().version).toBe(5);
  store.close();
});

test('preparation revises only an unsent replacement, is idempotent and is bounded', async () => {
  const { store } = await prepared();
  const writes = state.writes;
  // The identical replacement is a no-op without a write.
  expect((await store.prepareReproof(prepareOptions())).reproofRevision).toBe(1);
  expect(state.writes).toBe(writes);
  for (const [seedValue, revision] of [
    [10, 2],
    [11, 3],
    [12, 4],
  ]) {
    state.history = history(payload(seedValue, 30 + seedValue));
    expect(await store.prepareReproof(prepareOptions())).toMatchObject({
      status: 'reproof-prepared',
      reproofRevision: revision,
    });
  }
  state.history = history(payload(13, 50));
  expect(await store.prepareReproof(prepareOptions())).toEqual({
    status: 'refused',
    stage: 'persist',
  });
  expect(stored().entries[0].reproof.revision).toBe(4);
  store.close();
});

test.each([
  ['a prepared entry', () => {
    const { attempt: _attempt, retry: _retry, ...rest } = entry();
    return [2, [{ ...rest, state: 'prepared' }]];
  }],
  ['an attempted entry whose retry is unspent', () => [3, [entry(false)]]],
])('preparation refuses %s without writing', async (_name, make) => {
  seed(...make());
  const store = await open();
  const writes = state.writes;
  expect((await store.prepareReproof(prepareOptions())).status).toBe('refused');
  expect(state.writes).toBe(writes);
  store.close();
});

test.each([
  ['an unregistered transition receipt', () => ({ transition: Object.freeze({}) })],
  ['a receipt for another payload', () => {
    state.transitionPayloadSha256 = '0'.repeat(64);
    return {};
  }],
  ['another circuit pair', () => {
    state.circuit = { from: CIRCUIT.to, to: CIRCUIT.from };
    return {};
  }],
  ['an unregistered proof', () => ({ proof: Object.freeze({}) })],
  ['an unsupported creator type', () => {
    state.history = history(undefined, { preparation: { creator: { type: 'Legacy' } } });
    return {};
  }],
  ['another capsule', () => {
    state.history = history(undefined, { capture: { ...state.capture, capsuleDigest: '1'.repeat(64) } });
    return {};
  }],
  ['another output commitment', () => {
    state.history = history({ ...payload(9, 20), blindedCommitmentsOut: [hex(6)] });
    return {};
  }],
  ['another unshield marker', () => {
    state.history = history({ ...payload(9, 20), railgunTxidIfHasUnshield: hex(7) });
    return {};
  }],
  ['the original payload itself', () => {
    state.history = history(payload());
    return {};
  }],
  ['a stale original body digest', () => ({
    expected: { ...prepareOptions().expected, bodySha256: '0'.repeat(64) },
  })],
  ['a stale retry reservation', () => ({
    expected: { ...prepareOptions().expected, reservedAt: reservedAt + 1 },
  })],
  ['an extra option', () => ({ extra: true })],
])('preparation refuses %s without writing', async (_name, make) => {
  seed(4, [entry()]);
  const store = await open();
  const writes = state.writes;
  const overrides = make();
  expect((await store.prepareReproof(prepareOptions(overrides))).status).toBe('refused');
  expect(state.writes).toBe(writes);
  expect(stored().entries[0].reproof).toBeUndefined();
  store.close();
});

test('the single attempt is a new request after the retry and is consumed once written', async () => {
  const { store, reproof } = await prepared();
  const before = stored();
  const result = await store.beginReproofAttempt(attemptOptions(reproof));
  expect(result).toMatchObject({
    status: 'attempted',
    capsuleDigest: 'c'.repeat(64),
    revision: 1,
    payloadSha256: entry().payloadSha256,
    reproofRevision: 1,
    reproofPayloadSha256: reproof.payloadSha256,
    disclosureEnabled: false,
    spendingEnabled: false,
  });
  expect(result.attemptedAt).toBeGreaterThan(reservedAt);
  const after = stored();
  expect(after.version).toBe(5);
  expect(after.sequence).toBe(before.sequence + 1);
  const { attempt, ...replacement } = after.entries[0].reproof;
  expect(replacement).toEqual(reproof);
  const submission = prepareRailgunPoiSubmission({
    payload: reproof.payload,
    requestId: result.attemptedAt,
  });
  expect(attempt).toEqual({ attemptedAt: result.attemptedAt, submission });
  expect(submission.bodySha256).toBe(result.bodySha256);
  expect(submission.bodySha256).not.toBe(entry().attempt.submission.bodySha256);
  // The original attempt and retry bytes are untouched.
  const { reproof: _r, ...original } = after.entries[0];
  expect(original).toEqual(entry());
  const writes = state.writes;
  // Consumed: no second attempt, revision or retry, before or after reopen.
  expect(await store.beginReproofAttempt(attemptOptions(reproof))).toEqual({
    status: 'refused',
    stage: 'stored',
  });
  state.history = history(payload(20, 60));
  expect((await store.prepareReproof(prepareOptions())).status).toBe('refused');
  expect(state.writes).toBe(writes);
  store.close();
  await store.closed;
  const reopened = await open();
  const reopenedWrites = state.writes;
  expect((await reopened.beginReproofAttempt(attemptOptions(reproof))).status).toBe('refused');
  expect((await reopened.prepareReproof(prepareOptions())).status).toBe('refused');
  expect(
    (
      await reopened.reserveRetry({
        capsuleDigest: 'c'.repeat(64),
        expectedRevision: 1,
        expectedPayloadSha256: entry().payloadSha256,
        expectedBodySha256: entry().attempt.submission.bodySha256,
        expectedAttemptedAt: attemptedAt,
        signal: state.controller.signal,
      })
    ).status
  ).toBe('refused');
  expect(state.writes).toBe(reopenedWrites);
  reopened.close();
});

test.each([
  ['a stale replacement revision', (reproof) => ({ expectedReproofRevision: reproof.revision + 1 })],
  ['a stale replacement payload', () => ({ expectedReproofPayloadSha256: '0'.repeat(64) })],
  ['a stale original payload', () => ({ expectedPayloadSha256: '0'.repeat(64) })],
])('an attempt with %s refuses without writing', async (_name, make) => {
  const { store, reproof } = await prepared();
  const writes = state.writes;
  expect(await store.beginReproofAttempt(attemptOptions(reproof, make(reproof)))).toEqual({
    status: 'refused',
    stage: 'stored',
  });
  expect(state.writes).toBe(writes);
  store.close();
});

test('an attempt without a prepared replacement refuses', async () => {
  seed(4, [entry()]);
  const store = await open();
  const reproof = { revision: 1, payloadSha256: hash(JSON.stringify(payload(9, 20))) };
  expect((await store.beginReproofAttempt(attemptOptions(reproof))).status).toBe('refused');
  store.close();
});

test('a failure after the write is admitted reports recovery-required, never refused', async () => {
  const { store, reproof } = await prepared();
  state.failWrite = true;
  expect(await store.beginReproofAttempt(attemptOptions(reproof))).toEqual({
    status: 'recovery-required',
    stage: 'persist',
  });
});

test('a retry reservation in a V5 document never lowers its version', async () => {
  const other = {
    ...entry(false),
    capsuleDigest: '2'.repeat(64),
    selector: { ...selector, position: 8, nullifier: hex(21), noteHash: hex(22) },
  };
  seed(4, [entry()]);
  let store = await open();
  expect((await store.prepareReproof(prepareOptions())).status).toBe('reproof-prepared');
  const document = stored();
  store.close();
  await store.closed;
  seed(5, [document.entries[0], other]);
  state.capture = { ...state.capture, capsuleDigest: '2'.repeat(64), selector: other.selector };
  store = await open();
  const result = await store.reserveRetry({
    capsuleDigest: '2'.repeat(64),
    expectedRevision: 1,
    expectedPayloadSha256: other.payloadSha256,
    expectedBodySha256: other.attempt.submission.bodySha256,
    expectedAttemptedAt: attemptedAt,
    signal: state.controller.signal,
  });
  expect(result.status).toBe('reserved');
  expect(stored().version).toBe(5);
  store.close();
});

test('the transition accounting reserves the replacement attempt', async () => {
  const { store, reproof } = await prepared();
  const before = await store.inspect();
  expect((await store.beginReproofAttempt(attemptOptions(reproof))).status).toBe('attempted');
  const after = await store.inspect();
  expect(after.sequence).toBe(before.sequence + 1);
  expect(after.reservedTransitions).toBe(before.reservedTransitions - 1);
  expect(after.freeTransitions).toBe(before.freeTransitions);
  expect(after.reservedTransitions).toBe(0);
  store.close();
});

async function attemptedDocument() {
  const { store, reproof } = await prepared();
  expect((await store.beginReproofAttempt(attemptOptions(reproof))).status).toBe('attempted');
  store.close();
  await store.closed;
  return stored();
}
const withReproof = (doc, change) => ({
  ...doc,
  entries: [{ ...doc.entries[0], reproof: change(doc.entries[0].reproof) }],
});
test.each([
  ['a replacement in a V4 document', (doc) => ({ ...doc, version: 4 })],
  ['another circuit pair', (doc) => withReproof(doc, (r) => ({ ...r, circuit: { from: CIRCUIT.to, to: CIRCUIT.from } }))],
  ['an extra replacement member', (doc) => withReproof(doc, (r) => ({ ...r, sent: true }))],
  ['a changed replacement payload digest', (doc) => withReproof(doc, (r) => ({ ...r, payloadSha256: '0'.repeat(64) }))],
  ['a replacement output that differs', (doc) => withReproof(doc, (r) => {
    const changed = { ...r.payload, blindedCommitmentsOut: [hex(6)] };
    const { attempt: _attempt, ...rest } = r;
    return { ...rest, payload: changed, payloadSha256: hash(JSON.stringify(changed)) };
  })],
  ['an attempt not after the retry', (doc) => withReproof(doc, (r) => {
    const submission = prepareRailgunPoiSubmission({ payload: r.payload, requestId: reservedAt });
    return { ...r, attempt: { attemptedAt: reservedAt, submission } };
  })],
  ['an attempt of the original payload', (doc) => withReproof(doc, (r) => {
    const submission = prepareRailgunPoiSubmission({ payload: payload(), requestId: r.attempt.attemptedAt });
    return { ...r, attempt: { ...r.attempt, submission } };
  })],
  ['a replacement without a spent retry', (doc) => {
    const { retry: _retry, ...rest } = doc.entries[0];
    return { ...doc, entries: [rest], sequence: doc.sequence - 1 };
  }],
  ['a sequence that omits the replacement revision', (doc) => ({ ...doc, sequence: doc.sequence - 1 })],
])('a tampered V5 document with %s refuses to open', async (_name, mutate) => {
  const doc = mutate(await attemptedDocument());
  state.records.set(RECORD, JSON.stringify(doc));
  state.floor = Math.min(state.floor, doc.sequence);
  await expect(open()).rejects.toMatchObject({ code: 'RAILGUN_POI_INTENT_STORE_REFUSED' });
});

// The pre-replacement V4 reader: the committed retry store with import-only relocations.
const V4_READER = path.join(__dirname, 'fixtures', 'railgun-poi-intent-store-v4-reader.fixture.js');
const V4_BASIS_SHA256 = 'e421031f58f2c174b62896654cb4bcb745b2c06c15c19e189953d0a7c1777ec3';
test('the V4 reader fixture is the committed retry store with import-only relocations', () => {
  const text = fs.readFileSync(V4_READER, 'utf8');
  const original = text
    .split('require("../../src/owners/').join('require("./')
    .split("require('../../src/owners/").join("require('./")
    .split('require("../../src/data/').join('require("../data/');
  expect(createHash('sha256').update(original).digest('hex')).toBe(V4_BASIS_SHA256);
  const reproof = require('../docs/owners/POI-REPROOF-TRANSITIONS.json').changes.find(
    (change) => change.file === 'src/owners/railgun-poi-intent-store.js'
  );
  expect(reproof.beforeSha256).toBe(V4_BASIS_SHA256);
});
test('the V4 reader still reads V4 but refuses a genuine V5 replacement document', async () => {
  const { createRailgunPoiIntentStore: v4 } = require(V4_READER);
  seed(4, [entry()]);
  const legacy = await openWith(v4);
  expect((await legacy.get('c'.repeat(64))).retry).toBeDefined();
  expect(legacy.prepareReproof).toBeUndefined();
  legacy.close();
  await legacy.closed;
  const store = await open();
  expect((await store.prepareReproof(prepareOptions())).status).toBe('reproof-prepared');
  store.close();
  await store.closed;
  expect(stored().version).toBe(5);
  await expect(openWith(v4)).rejects.toMatchObject({ code: 'RAILGUN_POI_INTENT_STORE_REFUSED' });
  // A downgrade cannot strip the replacement by rewriting under the old reader.
  expect(stored().entries[0].reproof).toBeDefined();
});
