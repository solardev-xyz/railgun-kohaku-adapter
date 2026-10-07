// Package-level consumer check. Node itself must resolve the package's own
// "exports" for require() and import(): Jest's module registry neither follows
// Node's ESM loader nor runs dynamic import() without VM-module flags.
const { execFileSync } = require('child_process');
const path = require('path');

let output;
beforeAll(() => {
  output = JSON.parse(
    execFileSync(process.execPath, [path.join(__dirname, 'consumer', 'smoke.mjs')], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 30000,
    })
  );
});

test('CommonJS and ESM consumers share the five factories and operation registries', () => {
  const { read: _read, ...root } = output;
  expect(root).toEqual({
    resolved: { require: 'index.cjs', import: 'index.mjs' },
    factories: [
      'createRailgunKohakuSnapshotPlugin',
      'createRailgunKohakuPrivateAdapter',
      'createRailgunKohakuPrivateAdapterBroadcaster',
      'createRailgunKohakuPublicAdapter',
      'createRailgunKohakuPublicAdapterSubmitter',
    ],
    public: { reads: 4, preparation: 1, submission: 1, close: 1, authority: false },
    private: {
      kind: 'transfer',
      reads: 3,
      preparation: 1,
      broadcast: 1,
      close: 1,
      authority: false,
    },
  });
});

test('the read subpath exports the four helper functions the factories run', () => {
  const refused = ['ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_PACKAGE_PATH_NOT_EXPORTED'];
  expect(output.read).toEqual({
    resolved: { require: 'read.cjs', import: 'read.mjs' },
    helpers: [
      'normalizeRailgunKohakuReadFilter',
      'projectRailgunKohakuBalance',
      'projectRailgunKohakuNotes',
      'dispatchRailgunKohakuRead',
    ],
    // The read exports found, by identity, on the factories' own call stacks.
    usedBy: {
      snapshotBalance: [
        'normalizeRailgunKohakuReadFilter',
        'projectRailgunKohakuBalance',
        'dispatchRailgunKohakuRead',
      ],
      snapshotNotes: ['projectRailgunKohakuNotes', 'dispatchRailgunKohakuRead'],
      privateBalance: ['normalizeRailgunKohakuReadFilter'],
      publicBalance: ['normalizeRailgunKohakuReadFilter'],
    },
    // [require(), import()] error codes for subpaths outside "exports".
    refused: {
      'src/railgun-kohaku-read-data.js': refused,
      'src/railgun-kohaku-read-dispatch.js': refused,
      'read.cjs': refused,
    },
  });
});
