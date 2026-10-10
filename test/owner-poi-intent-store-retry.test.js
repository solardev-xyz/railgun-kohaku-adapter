/** POI intent store V4 retry reservation over a controlled in-memory storage
 * port and floor. No real encryption, profile lock, proof or network. */
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
      reattest: async () => {
        state.reattests++;
        if (state.failReattestAfter !== undefined && state.reattests > state.failReattestAfter)
          throw Error('reattest failed');
        return state.capture;
      },
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
const context = require('./fixtures/owner-privacy-context');
const { createRailgunPoiIntentStore } = require('../src/owners/railgun-poi-intent-store');
const { prepareRailgunPoiSubmission } = require('../src/data/railgun-poi-submit-data');
const { REQUIRED_LIST } = require('../src/data/railgun-poi-records');
const RECORD = 'railgun-poi-intents-v1';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const hex = (value) => '0x' + value.toString(16).padStart(64, '0');
const walletId = 'a'.repeat(64),
  binding = 'b'.repeat(64);
const payload = () => ({
  listKey: REQUIRED_LIST,
  proof: { pi_a: ['1', '2'], pi_b: [['3', '4'], ['5', '6']], pi_c: ['7', '8'] },
  poiMerkleroots: [hex(3).slice(2)],
  txidMerkleroot: hex(4).slice(2),
  txidMerklerootIndex: 6,
  blindedCommitmentsOut: [hex(5)],
  railgunTxidIfHasUnshield: '0x00',
});
const selector = { tree: 0, position: 7, nullifier: hex(11), noteHash: hex(12) };
const attemptedAt = 1791495220000;
function entry(state_ = 'attempted') {
  const value = payload();
  return {
    capsuleDigest: 'c'.repeat(64),
    bindingDigest: 'd'.repeat(64),
    selector,
    payload: value,
    payloadSha256: hash(JSON.stringify(value)),
    inputSha256: 'e'.repeat(64),
    revision: 1,
    state: state_,
    ...(state_ === 'attempted'
      ? { attempt: { attemptedAt, submission: prepareRailgunPoiSubmission({ payload: value, requestId: attemptedAt }) } }
      : {}),
  };
}
function documentWith(version, entries) {
  const sequence = entries.reduce(
    (n, v) => n + v.revision + Number(v.state === 'attempted') + Number(Boolean(v.retry)),
    0
  );
  return JSON.stringify({ version, binding, walletId, lease: 'f'.repeat(64), sequence, entries });
}
beforeEach(() => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'owner-poi-intent-retry-')));
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
    reattests: 0,
    capture: { capsuleDigest: 'c'.repeat(64), bindingDigest: 'd'.repeat(64), selector },
    enrollment: {
      binding,
      descriptor: { walletId },
      directory,
      signal: controller.signal,
      getContext: () => storageHandle,
    },
    intentHandle: scope.getContext({ ...subject, operation: RECORD + ':' + walletId }),
  };
});
afterEach(() => state.controller.abort());
const open = (create = false, factory = createRailgunPoiIntentStore) =>
  factory({
    enrollment: state.enrollment,
    handle: state.intentHandle,
    directory: state.directory,
    key: Buffer.alloc(32, 1),
    binding,
    walletId,
    profileGuard: {},
    create,
    readFloor: async () => state.floor,
    advanceFloor: async (value) => {
      state.floor = Math.max(state.floor ?? 0, value);
    },
  });
const seed = (version, entries) => {
  state.records.set(RECORD, documentWith(version, entries));
  state.floor = JSON.parse(state.records.get(RECORD)).sequence;
};
const stored = () => JSON.parse(state.records.get(RECORD));
const expected = (overrides = {}) => {
  const original = entry();
  return {
    capsuleDigest: original.capsuleDigest,
    expectedRevision: 1,
    expectedPayloadSha256: original.payloadSha256,
    expectedBodySha256: original.attempt.submission.bodySha256,
    expectedAttemptedAt: attemptedAt,
    signal: state.controller.signal,
    ...overrides,
  };
};

test.each([2, 3])('a legacy V%s attempted entry reads unchanged and reopen does not migrate it', async (version) => {
  seed(version, [entry()]);
  const store = await open();
  const loaded = await store.get('c'.repeat(64));
  expect(loaded.state).toBe('attempted');
  expect(loaded.retry).toBeUndefined();
  expect(stored().version).toBe(version);
  store.close();
});

test('one reservation appends retry, migrates to V4, keeps the original attempt bytes and advances the floor', async () => {
  seed(3, [entry()]);
  const before = stored().entries[0];
  const store = await open();
  const floorBefore = state.floor;
  const result = await store.reserveRetry(expected());
  expect(result).toMatchObject({
    status: 'reserved',
    capsuleDigest: 'c'.repeat(64),
    attemptedAt,
    bodySha256: before.attempt.submission.bodySha256,
    disclosureEnabled: false,
    spendingEnabled: false,
  });
  expect(result.reservedAt).toBeGreaterThan(attemptedAt);
  const after = stored();
  expect(after.version).toBe(4);
  expect(after.sequence).toBe(before.revision + 2);
  expect(state.floor).toBe(floorBefore + 1);
  const { retry, ...unchanged } = after.entries[0];
  expect(unchanged).toEqual(before);
  expect(retry).toEqual({ reservedAt: result.reservedAt, bodySha256: before.attempt.submission.bodySha256 });
  // Consumed: a second reservation refuses without writing.
  const writes = state.writes;
  expect(await store.reserveRetry(expected())).toEqual({ status: 'refused', stage: 'stored' });
  expect(state.writes).toBe(writes);
  store.close();
  await store.closed;
  // Cold reopen keeps the reservation and still refuses a third handoff.
  const reopened = await open();
  expect((await reopened.get('c'.repeat(64))).retry).toEqual(retry);
  expect(await reopened.reserveRetry(expected())).toEqual({ status: 'refused', stage: 'stored' });
  reopened.close();
});

test.each([
  ['revision', { expectedRevision: 2 }],
  ['payload digest', { expectedPayloadSha256: '0'.repeat(64) }],
  ['body digest', { expectedBodySha256: '0'.repeat(64) }],
  ['original attempt time', { expectedAttemptedAt: attemptedAt + 1 }],
  ['capsule', { capsuleDigest: '9'.repeat(64) }],
])('a mismatched %s refuses before any write', async (_name, overrides) => {
  seed(3, [entry()]);
  const store = await open();
  const writes = state.writes;
  expect(await store.reserveRetry(expected(overrides))).toEqual({ status: 'refused', stage: 'stored' });
  expect(state.writes).toBe(writes);
  expect(stored().version).toBe(3);
  store.close();
});

test('a prepared entry has no attempt to retry', async () => {
  seed(2, [entry('prepared')]);
  const store = await open();
  const original = entry('prepared');
  expect(
    await store.reserveRetry(
      expected({ expectedPayloadSha256: original.payloadSha256 })
    )
  ).toEqual({ status: 'refused', stage: 'stored' });
  store.close();
});

test('a failure after the durable write leaves the retry consumed and reports recovery-required', async () => {
  seed(3, [entry()]);
  const store = await open();
  state.failReattestAfter = 1;
  const result = await store.reserveRetry(expected());
  expect(result).toEqual({ status: 'recovery-required', stage: 'reattest' });
  expect(stored().entries[0].retry).toBeDefined();
  store.close();
  await store.closed;
  state.failReattestAfter = undefined;
  const reopened = await open();
  expect(await reopened.reserveRetry(expected())).toEqual({ status: 'refused', stage: 'stored' });
  reopened.close();
});

test('a write failure before persistence refuses and the entry stays retry-eligible', async () => {
  seed(3, [entry()]);
  const store = await open();
  state.failWrite = true;
  const result = await store.reserveRetry(expected());
  expect(result.status).toBe('recovery-required');
  expect(stored().version).toBe(3);
  expect(stored().entries[0].retry).toBeUndefined();
});

test('concurrent reservations admit one caller; the other is refused as busy', async () => {
  seed(3, [entry()]);
  const store = await open();
  const [first, second] = await Promise.all([store.reserveRetry(expected()), store.reserveRetry(expected())]);
  expect([first.status, second.status].sort()).toEqual(['refused', 'reserved']);
  expect([first, second].find((v) => v.status === 'refused').stage).toBe('busy');
  store.close();
});

test('a second store instance cannot open the same file while one is open', async () => {
  seed(3, [entry()]);
  const store = await open();
  await expect(open()).rejects.toMatchObject({ code: 'RAILGUN_POI_INTENT_STORE_REFUSED' });
  store.close();
});

test('restoring the pre-retry document after the floor advanced refuses to open', async () => {
  seed(3, [entry()]);
  const legacy = state.records.get(RECORD);
  const store = await open();
  expect((await store.reserveRetry(expected())).status).toBe('reserved');
  store.close();
  await store.closed;
  state.records.set(RECORD, legacy);
  await expect(open()).rejects.toMatchObject({ code: 'RAILGUN_POI_INTENT_STORE_REFUSED' });
});

test.each([
  ['retry in a V3 document', (doc) => ({ ...doc, version: 3 })],
  ['a different retry body digest', (doc) => ({ ...doc, entries: [{ ...doc.entries[0], retry: { ...doc.entries[0].retry, bodySha256: '0'.repeat(64) } }] })],
  ['a reservation not after the attempt', (doc) => ({ ...doc, entries: [{ ...doc.entries[0], retry: { ...doc.entries[0].retry, reservedAt: attemptedAt } }] })],
  ['an extra retry member', (doc) => ({ ...doc, entries: [{ ...doc.entries[0], retry: { ...doc.entries[0].retry, sent: true } }] })],
  ['a sequence that omits the retry', (doc) => ({ ...doc, sequence: doc.sequence - 1 })],
  ['a retry on a prepared entry', (doc) => {
    const { attempt: _attempt, ...prepared } = doc.entries[0];
    return { ...doc, entries: [{ ...prepared, state: 'prepared' }] };
  }],
])('a tampered V4 document with %s refuses to open', async (_name, mutate) => {
  seed(3, [entry()]);
  const store = await open();
  expect((await store.reserveRetry(expected())).status).toBe('reserved');
  store.close();
  await store.closed;
  const doc = mutate(stored());
  state.records.set(RECORD, JSON.stringify(doc));
  state.floor = Math.min(state.floor, doc.sequence);
  await expect(open()).rejects.toMatchObject({ code: 'RAILGUN_POI_INTENT_STORE_REFUSED' });
});

// The pre-retry V3 reader: the committed basis with import-only relocations.
const V3_READER = path.join(__dirname, 'fixtures', 'railgun-poi-intent-store-v3-reader.fixture.js');
const V3_BASIS_SHA256 = '6d49d0b20b7b3149782ee3a692cdd2b371131eb0cd68c2df2526a10cd28df964';
test('the V3 reader fixture is the committed pre-retry store with import-only relocations', () => {
  const text = fs.readFileSync(V3_READER, 'utf8');
  const original = text
    .split('require("../../src/owners/').join('require("./')
    .split("require('../../src/owners/").join("require('./")
    .split('require("../../src/data/').join('require("../data/');
  expect(createHash('sha256').update(original).digest('hex')).toBe(V3_BASIS_SHA256);
  const retry = require('../docs/owners/POI-RETRY-TRANSITIONS.json').changes.find(
    (change) => change.file === 'src/owners/railgun-poi-intent-store.js'
  );
  expect(retry.beforeSha256).toBe(V3_BASIS_SHA256);
});
const openWith = (factory, create = false) =>
  factory({
    enrollment: state.enrollment,
    handle: state.intentHandle,
    directory: state.directory,
    key: Buffer.alloc(32, 1),
    binding,
    walletId,
    profileGuard: {},
    create,
    readFloor: async () => state.floor,
    advanceFloor: async (value) => {
      state.floor = Math.max(state.floor ?? 0, value);
    },
  });
test('the pre-retry reader still reads V3 but refuses a genuine V4 retry document', async () => {
  const { createRailgunPoiIntentStore: v3 } = require(V3_READER);
  seed(3, [entry()]);
  const legacy = await openWith(v3);
  expect((await legacy.get('c'.repeat(64))).state).toBe('attempted');
  expect(legacy.reserveRetry).toBeUndefined();
  legacy.close();
  await legacy.closed;
  const store = await open();
  expect((await store.reserveRetry(expected())).status).toBe('reserved');
  store.close();
  await store.closed;
  expect(stored().version).toBe(4);
  await expect(openWith(v3)).rejects.toMatchObject({ code: 'RAILGUN_POI_INTENT_STORE_REFUSED' });
  // A downgrade cannot strip the reservation by rewriting under the old reader.
  expect(stored().entries[0].retry).toBeDefined();
});

test('a serializer byte change refuses an existing attempted document, even when derived caches remain compatible', async () => {
  const serializerFile = path.join(__dirname, '../src/data/railgun-poi-submit-data.js');
  const storeFile = path.join(__dirname, '../src/owners/railgun-poi-intent-store.js');
  const load = (filename, text, replacement) => {
    const module = {exports: {}};
    const read = request => replacement && request === '../data/railgun-poi-submit-data.js'
      ? replacement : require(request.startsWith('.') ? path.resolve(path.dirname(filename), request) : request);
    // Same test realm, local source only; no file is modified or new module path enrolled.
    new Function('require', 'module', text)(read, module);
    return module.exports;
  };
  const originalText = fs.readFileSync(serializerFile, 'utf8');
  const replacementText = originalText.replace('    id: requestId,\n  });', '    id: requestId,\n  }) + "\\n";');
  expect(replacementText).not.toBe(originalText);
  const changed = load(serializerFile, replacementText);
  const original = entry();
  // The modified implementation works for new documents; only existing exact bytes conflict.
  const next = changed.prepareRailgunPoiSubmission({requestId: attemptedAt, payload: payload()});
  expect(changed.normalizeRailgunPoiSubmission(next)).toEqual(next);
  expect(next.bodySha256).not.toBe(original.attempt.submission.bodySha256);
  expect(() => changed.normalizeRailgunPoiSubmission(original.attempt.submission)).toThrow();
  seed(3, [original]);
  const first = await open(); first.close(); await first.closed;
  const before = state.records.get(RECORD), floor = state.floor, writes = state.writes;
  const alteredStore = load(storeFile, fs.readFileSync(storeFile, 'utf8'), changed);
  await expect(open(false, alteredStore.createRailgunPoiIntentStore)).rejects.toThrow();
  expect(state.records.get(RECORD)).toBe(before);
  expect(state.floor).toBe(floor);
  expect(state.writes).toBe(writes);
});
