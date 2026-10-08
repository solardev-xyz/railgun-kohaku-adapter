/** Test-only checkout selection controls; no host, vault or dependency imported. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { createHash } = require('crypto');
const source = fs.readFileSync(path.join(__dirname, '../tools/owner-test-staging/held-host-inputs.cjs'), 'utf8');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function load(selected, change = () => {}) {
  const bytes = Buffer.from('reviewed host source');
  const manifest = {
    files: { 'src/host.js': { bytes: bytes.length, sha256: digest(bytes) } },
    dependencies: [], aliases: { 'fixed-host': 'src/host.js' },
  };
  const env = { RAILGUN_HELD_HOST_ROOT: selected };
  const reads = [];
  const io = {
    realpathSync: (name) => name,
    readFileSync: (name) => { reads.push(name); return bytes; },
  };
  change({ manifest, io, bytes });
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, process: { env }, __dirname: '/package/tools/owner-test-staging',
    require(name) {
      if (name === 'fs') return io;
      if (name === 'path' || name === 'crypto') return require(name);
      if (name === '../../docs/owners/test-staging/HELD-HOST-INPUTS.json') return manifest;
      throw Error('Unexpected target import: ' + name);
    },
  });
  return { api: module.exports, env, reads };
}
test.each([undefined, '', 'relative/host', '/host/../other', '/host/'])(
  'missing or noncanonical selected checkout refuses before target load: %p', (value) => {
    expect(() => load(value)).toThrow('Set RAILGUN_HELD_HOST_ROOT');
  }
);
test('canonical checkout relocation changes only fixed aliases and read locations', () => {
  for (const selected of ['/reviewed/first', '/relocated/second']) {
    const f = load(selected);
    expect(f.api.hostModuleAliases()).toEqual({ '^fixed-host$': selected + '/src/host.js' });
    expect(f.reads).toEqual([selected + '/src/host.js']);
  }
});
test('changing the environment after capture cannot retarget postchecks or aliases', () => {
  const f = load('/reviewed/first');
  f.env.RAILGUN_HELD_HOST_ROOT = '/different/checkout';
  expect(f.api.hostModuleAliases()).toEqual({ '^fixed-host$': '/reviewed/first/src/host.js' });
  f.api.verifyHostInputs();
  expect(f.reads).toEqual(['/reviewed/first/src/host.js', '/reviewed/first/src/host.js']);
});
test('symlink checkout refuses before reading target source', () => {
  const read = jest.fn();
  expect(() => load('/alias', ({ io }) => {
    io.realpathSync = () => '/real'; io.readFileSync = read;
  })).toThrow('Set RAILGUN_HELD_HOST_ROOT');
  expect(read).not.toHaveBeenCalled();
});
test('selected checkout with changed source still refuses before returning aliases', () => {
  const f = load('/reviewed', ({ io }) => { io.readFileSync = () => Buffer.from('changed'); });
  expect(() => f.api.hostModuleAliases()).toThrow('Reviewed host source drift');
});
test('dependency byte drift still refuses at postcheck', () => {
  let changed = false;
  const f = load('/reviewed', ({ manifest, io }) => {
    const originalRead = io.readFileSync;
    const entries = [['index.js', 4, digest(Buffer.from('good'))]];
    manifest.dependencies = [{ root: 'host', path: 'node_modules/example', name: 'example',
      files: 1, inventorySha256: digest(JSON.stringify(entries)) }];
    io.readdirSync = () => ['index.js'];
    io.lstatSync = () => ({ isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true, size: 4 });
    io.readFileSync = (name) => name.endsWith('/index.js') ? Buffer.from(changed ? 'evil' : 'good') : originalRead(name);
  });
  f.api.verifyHostInputs();
  changed = true;
  expect(() => f.api.verifyHostInputs()).toThrow('Reviewed dependency source drift');
});
