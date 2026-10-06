// Loads the package through its own "exports" map (Node package self-reference)
// with both require() and import() in ONE process, so the CommonJS and ESM
// factory identities and operation registries can be compared directly.
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

const cjs = require(NAME);
const esm = await import(NAME);
const { checkPublicConformance } = require('../fixtures/railgun-kohaku-public-conformance');
const { checkPrivateConformance } = require('../fixtures/railgun-kohaku-private-conformance');

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

process.stdout.write(
  JSON.stringify({
    resolved: {
      require: path.relative(root, require.resolve(NAME)),
      import: path.relative(root, fileURLToPath(import.meta.resolve(NAME))),
    },
    factories: Object.keys(cjs),
    public: publicResult,
    private: privateResult,
  })
);
