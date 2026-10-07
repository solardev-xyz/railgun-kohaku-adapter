// Loads the package through its own "exports" map (Node package self-reference)
// with both require() and import() in ONE process, so the CommonJS and ESM
// factory identities and operation registries can be compared directly. The
// "./read" subpath is checked the same way, and against the factories' own use.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAME = '@freedom/railgun-kohaku-adapter';
const FACTORIES = [
  'createRailgunKohakuSnapshotPlugin',
  'createRailgunKohakuPrivateAdapter',
  'createRailgunKohakuPrivateAdapterBroadcaster',
  'createRailgunKohakuPublicAdapter',
  'createRailgunKohakuPublicAdapterSubmitter',
];
const READ = `${NAME}/read`;
const READ_HELPERS = [
  'normalizeRailgunKohakuReadFilter',
  'projectRailgunKohakuBalance',
  'projectRailgunKohakuNotes',
  'dispatchRailgunKohakuRead',
];
// Not exported: source files and the entry file behind "./read".
const UNEXPORTED = [
  'src/railgun-kohaku-read-data.js',
  'src/railgun-kohaku-read-dispatch.js',
  'read.cjs',
];

const cjs = require(NAME);
const esm = await import(NAME);
const { checkPublicConformance } = require('../fixtures/railgun-kohaku-public-conformance');
const {
  checkPrivateConformance,
  independentPrivateHost,
} = require('../fixtures/railgun-kohaku-private-conformance');
const { independentPublicHost } = require('../fixtures/railgun-kohaku-public-conformance');
const { createMemorySnapshotHost } = require('../fixtures/railgun-kohaku-snapshot-conformance');

assert.ok(Object.isFrozen(cjs));
assert.deepEqual(Object.keys(cjs), FACTORIES);
assert.deepEqual(Object.keys(esm).sort(), [...FACTORIES].sort());
for (const name of FACTORIES) {
  assert.equal(typeof cjs[name], 'function');
  assert.equal(esm[name], cjs[name], name);
}

// Public binding: the ESM-created adapter's operation is submitted through a
// CommonJS-created submitter, so both entrypoints share one public registry.
const publicResult = await checkPublicConformance(
  esm.createRailgunKohakuPublicAdapter,
  cjs.createRailgunKohakuPublicAdapterSubmitter
);
// Private binding: the reverse direction through the shared private registry.
const privateResult = await checkPrivateConformance(
  cjs.createRailgunKohakuPrivateAdapter,
  esm.createRailgunKohakuPrivateAdapterBroadcaster,
  'transfer'
);
// A structural look-alike is not a registered adapter in either entrypoint.
assert.throws(() => esm.createRailgunKohakuPublicAdapterSubmitter({}), {
  code: 'RAILGUN_KOHAKU_PUBLIC_ADAPTER_REFUSED',
});
assert.throws(() => cjs.createRailgunKohakuPrivateAdapterBroadcaster({}), {
  code: 'RAILGUN_KOHAKU_PRIVATE_ADAPTER_REFUSED',
});

// The "./read" subpath: one frozen set of four functions for both loaders.
const cjsRead = require(READ);
const esmRead = await import(READ);
assert.ok(Object.isFrozen(cjsRead));
assert.deepEqual(Object.keys(cjsRead), READ_HELPERS);
assert.deepEqual(Object.keys(esmRead).sort(), [...READ_HELPERS].sort());
for (const name of READ_HELPERS) {
  assert.equal(typeof cjsRead[name], 'function');
  assert.equal(esmRead[name], cjsRead[name], name);
}

// Behavioral identity with the factories. While `run` executes synchronously,
// each Array.prototype.map or filter call records the function objects on its
// call stack. V8 exposes a frame's function only above the first strict-mode
// frame, so the recorder is a sloppy-mode Function; the CommonJS sources are
// sloppy too. A wrapper or copy exported by read.cjs is never on these stacks.
const recorder = new Function(
  'seen',
  'original',
  `return function () {
    const prepare = Error.prepareStackTrace, limit = Error.stackTraceLimit;
    Error.prepareStackTrace = (_, sites) => sites;
    Error.stackTraceLimit = Infinity;
    try {
      for (const site of new Error().stack) seen.add(site.getFunction());
    } finally {
      Error.prepareStackTrace = prepare;
      Error.stackTraceLimit = limit;
    }
    return original.apply(this, arguments);
  };`
);
function helpersOnStack(run) {
  const seen = new Set(),
    { map, filter } = Array.prototype;
  Array.prototype.map = recorder(seen, map);
  Array.prototype.filter = recorder(seen, filter);
  let pending;
  try {
    pending = run();
  } finally {
    Array.prototype.map = map;
    Array.prototype.filter = filter;
  }
  return { pending, helpers: READ_HELPERS.filter((name) => seen.has(cjsRead[name])) };
}
const signal = new AbortController().signal;
const snapshot = cjs.createRailgunKohakuSnapshotPlugin({
  host: createMemorySnapshotHost().host,
  signal,
});
const snapshotBalance = helpersOnStack(() => snapshot.balance([{ __type: 'native' }]));
const snapshotNotes = helpersOnStack(() => snapshot.notes(undefined, true));
assert.deepEqual(await snapshotBalance.pending, []);
assert.equal((await snapshotNotes.pending).length, 4);
snapshot.close();
await snapshot.closed;
const privateAdapter = cjs.createRailgunKohakuPrivateAdapter({
  host: independentPrivateHost().host,
  signal,
});
const privateBalance = helpersOnStack(() => privateAdapter.balance([]));
assert.deepEqual(await privateBalance.pending, []);
privateAdapter.close();
await privateAdapter.closed;
const publicAdapter = esm.createRailgunKohakuPublicAdapter({
  host: independentPublicHost().host,
  signal,
});
const publicBalance = helpersOnStack(() => publicAdapter.balance([]));
assert.equal((await publicBalance.pending).length, 1);
publicAdapter.close();
await publicAdapter.closed;

// Only "." and "./read" are exported; other subpaths are refused by Node.
const refused = {};
for (const subpath of UNEXPORTED) {
  const specifier = `${NAME}/${subpath}`;
  let required = null;
  try {
    require(specifier);
  } catch (error) {
    required = error.code;
  }
  const imported = await import(specifier).then(
    () => null,
    (error) => error.code
  );
  refused[subpath] = [required, imported];
}

process.stdout.write(
  JSON.stringify({
    resolved: {
      require: path.relative(root, require.resolve(NAME)),
      import: path.relative(root, fileURLToPath(import.meta.resolve(NAME))),
    },
    factories: Object.keys(cjs),
    public: publicResult,
    private: privateResult,
    read: {
      resolved: {
        require: path.relative(root, require.resolve(READ)),
        import: path.relative(root, fileURLToPath(import.meta.resolve(READ))),
      },
      helpers: Object.keys(cjsRead),
      usedBy: {
        snapshotBalance: snapshotBalance.helpers,
        snapshotNotes: snapshotNotes.helpers,
        privateBalance: privateBalance.helpers,
        publicBalance: publicBalance.helpers,
      },
      refused,
    },
  })
);
