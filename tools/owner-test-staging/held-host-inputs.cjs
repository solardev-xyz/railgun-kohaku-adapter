// Repository-only input validation; never imported by the shipped owner.
const fs = require('fs'), path = require('path'), { createHash } = require('crypto');
const input = require('../../docs/owners/test-staging/HELD-HOST-INPUTS.json');
const root = path.resolve(__dirname, '../..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function inventory(directory) {
  const entries = [];
  function walk(at) {
    for (const name of fs.readdirSync(at).sort()) {
      const filename = path.join(at, name), stat = fs.lstatSync(filename);
      if (stat.isSymbolicLink()) throw Error('Dependency link refused');
      if (stat.isDirectory()) walk(filename);
      else if (stat.isFile()) entries.push([
        path.relative(directory, filename), stat.size, sha(fs.readFileSync(filename)),
      ]);
      else throw Error('Dependency special file refused');
    }
  }
  walk(directory);
  return entries;
}
function verifyHostInputs() {
  for (const [name, pin] of Object.entries(input.files)) {
    const file = path.join(input.hostRoot, name);
    if (fs.realpathSync(file) !== file) throw Error('Host source alias refused');
    const bytes = fs.readFileSync(file);
    if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256)
      throw Error('Reviewed host source drift: ' + name);
  }
  for (const pin of input.dependencies) {
    const base = pin.root === 'host' ? input.hostRoot : root;
    const directory = path.join(base, pin.path);
    if (fs.realpathSync(directory) !== directory) throw Error('Dependency root alias refused');
    const entries = inventory(directory);
    if (entries.length !== pin.files || sha(JSON.stringify(entries)) !== pin.inventorySha256)
      throw Error('Reviewed dependency source drift: ' + pin.name);
  }
}
function observeSources(cache) {
  verifyHostInputs();
  const sources = Object.keys(cache).sort().map((file) => {
    const host = file.startsWith(input.hostRoot + path.sep), base = host ? input.hostRoot : root;
    if (!file.startsWith(base + path.sep)) throw Error('Undeclared module root: ' + file);
    const name = path.relative(base, file);
    if (host && !name.startsWith('node_modules/') && !Object.hasOwn(input.files, name))
      throw Error('Unpinned host module: ' + name);
    if (name.startsWith('node_modules/') && !input.dependencies.some((pin) =>
      pin.root === (host ? 'host' : 'package') && name.startsWith(pin.path + path.sep)))
      throw Error('Unpinned dependency module: ' + name);
    const bytes = fs.readFileSync(file);
    return { root: host ? 'host' : 'package', path: name, bytes: bytes.length, sha256: sha(bytes) };
  });
  fs.writeFileSync(path.join(require('os').tmpdir(), 'railgun-owner-host-held-observed.json'),
    JSON.stringify({ schema: 'railgun-held-host-observed-v1', node: process.version,
      platform: process.platform, arch: process.arch, hostRevision: input.hostRevision,
      cjsSources: sources, esmEvidence: 'Declared full dependency tree PRE/POST inventories; ESM is not observed by CJS require.cache',
      prePostUnchanged: true, nativeElectron: false, liveService: false }, null, 2) + '\n');
}
module.exports = { verifyHostInputs, observeSources };
