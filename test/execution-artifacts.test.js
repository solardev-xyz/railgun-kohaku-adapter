'use strict';
/** The positive shape uses an explicitly mocked digest oracle. Negative cases
 * exercise the actual SHA256 mismatch for each fixed artifact; no proving or
 * real artifact files are used here. */
const realCrypto = jest.requireActual('crypto');
let acceptedDigests = new Map(),
  checks = [];
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  createHash(algorithm) {
    const hash = realCrypto.createHash(algorithm);
    return {
      update(value) {
        hash.update(value);
        return this;
      },
      digest(format) {
        const actual = hash.digest(format);
        checks.push(actual);
        return acceptedDigests.get(actual) || actual;
      },
    };
  },
}));
let loader,
  current,
  contextReads = 0;
require('../src/execution/host-bindings').initializeRailgunExecutionHost({
  context: {
    getPrivacyContext(handle) {
      contextReads++;
      if (handle !== current) throw new Error('foreign');
      return { subject: { protocol: 'railgun' } };
    },
    createPrivacyScope() {
      throw new Error('unused');
    },
  },
  artifacts: { createPrivacyArtifactLoader: (input) => loader(input) },
});
const {
  manifest,
  loadRailgunArtifacts,
  assertRailgunArtifactVerifier,
} = require('../src/execution/railgun-artifacts');
const digest = (buffer) => realCrypto.createHash('sha256').update(buffer).digest('hex');
let buffers, calls, privateCopies;
beforeEach(() => {
  current = {};
  contextReads = 0;
  acceptedDigests = new Map();
  checks = [];
  calls = [];
  const vkey = {
    protocol: 'groth16',
    curve: 'bn128',
    nPublic: 4,
    IC: Array(5).fill(['1', '2', '1']),
  };
  buffers = Object.fromEntries(
    manifest['01x01'].map((entry, i) => {
      const buffer = Buffer.alloc(entry.size, i + 1);
      if (entry.kind === 'vkey') {
        buffer.fill(32);
        buffer.write(JSON.stringify(vkey));
      }
      acceptedDigests.set(digest(buffer), entry.sha256);
      return [entry.kind, buffer];
    })
  );
  privateCopies = [];
  loader = ({ handle, directory, manifest: entries }) => {
    expect(handle).toBe(current);
    expect(directory).toBe('/public/artifacts');
    expect(entries).toBe(manifest['01x01']);
    return {
      async load(name) {
        calls.push(name);
        const entry = entries.find((value) => value.name === name);
        privateCopies.push(buffers[entry.kind]);
        return buffers[entry.kind];
      },
    };
  };
});
const invoke = () =>
  loadRailgunArtifacts({ handle: current, directory: '/public/artifacts', variant: '01x01' });
test('issued buffers are detached snapshots, pinned manifest immutable, historical host brand retained', async () => {
  const result = await invoke();
  expect(checks).toHaveLength(3);
  expect(calls).toEqual(['01x01.wasm', '01x01.zkey', '01x01.vkey']);
  expect(result.wasm).not.toBe(buffers.wasm);
  expect(result.wasm[0]).toBe(1);
  expect(privateCopies.every((value) => value.every((byte) => byte === 0))).toBe(true);
  buffers.wasm.fill(9);
  expect(result.wasm[0]).toBe(1);
  expect(Object.isFrozen(manifest['01x01'][0])).toBe(true);
  const before = contextReads;
  expect(() => assertRailgunArtifactVerifier({ ...result }, '0x00')).toThrow();
  expect(contextReads).toBe(before);
  expect(() => assertRailgunArtifactVerifier(result, '0x00')).toThrow();
  expect(contextReads).toBe(before + 1);
  result.wasm.fill(0);
  result.zkey.fill(0);
});
test.each(['wasm', 'zkey', 'vkey'])(
  'I/O cannot supply %s bytes with a wrong actual digest',
  async (kind) => {
    acceptedDigests.delete(digest(buffers[kind]));
    await expect(invoke()).rejects.toThrow('Railgun artifacts unavailable');
    expect(calls).toHaveLength(['wasm', 'zkey', 'vkey'].indexOf(kind) + 1);
  }
);
test.each(['wasm', 'zkey', 'vkey'])(
  'wrong %s size refuses before hashing its bytes',
  async (kind) => {
    buffers[kind] = Buffer.alloc(1);
    await expect(invoke()).rejects.toThrow();
    expect(checks).toHaveLength(['wasm', 'zkey', 'vkey'].indexOf(kind));
  }
);
test('non-Buffer I/O result cannot be admitted', async () => {
  buffers.wasm = { length: manifest['01x01'][0].size };
  await expect(invoke()).rejects.toThrow();
  expect(checks).toHaveLength(0);
});
test('revocation while the original final load is pending cannot release it or issue artifacts', async () => {
  let release,
    settled = false;
  const original = loader;
  loader = (options) => {
    const source = original(options);
    return {
      load(name) {
        if (name !== '01x01.vkey') return source.load(name);
        return new Promise((resolve) => {
          release = () => resolve(source.load(name));
        });
      },
    };
  };
  const pending = invoke().finally(() => {
    settled = true;
  });
  // Observe the same original operation immediately to avoid an unhandled rejection.
  const refused = expect(pending).rejects.toThrow();
  while (!release) await Promise.resolve();
  current = {};
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  await refused;
  expect(settled).toBe(true);
  expect(privateCopies.every((value) => value.every((byte) => byte === 0))).toBe(true);
});
