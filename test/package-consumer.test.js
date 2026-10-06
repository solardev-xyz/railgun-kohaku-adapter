// Package-level consumer check. Node itself must resolve the package's own
// "exports" for require() and import(): Jest's module registry neither follows
// Node's ESM loader nor runs dynamic import() without VM-module flags.
const { execFileSync } = require('child_process');
const path = require('path');

test('CommonJS and ESM consumers share the five factories and operation registries', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'consumer', 'smoke.mjs')], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: 30000,
  });
  expect(JSON.parse(output)).toEqual({
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
