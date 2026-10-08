'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { createHash } = require('crypto');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function file(filename) {
  const before = fs.lstatSync(filename);
  assert.ok(before.isFile() && !before.isSymbolicLink());
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    assert.equal(opened.dev, before.dev);
    assert.equal(opened.ino, before.ino);
    const hash = createHash('sha256'),
      chunk = Buffer.alloc(1024 * 1024);
    let count = 0,
      n;
    while ((n = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      hash.update(chunk.subarray(0, n));
      count += n;
    }
    const after = fs.fstatSync(fd),
      named = fs.lstatSync(filename);
    for (const next of [after, named])
      for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'])
        assert.equal(next[key], before[key]);
    assert.equal(count, before.size);
    return { bytes: count, sha256: hash.digest('hex'), mode: before.mode & 0o777 };
  } finally {
    fs.closeSync(fd);
  }
}
function tree(root) {
  assert.equal(fs.realpathSync(root), root);
  assert.ok(fs.lstatSync(root).isDirectory());
  const files = {},
    links = {},
    directories = [];
  function walk(folder) {
    for (const name of fs.readdirSync(folder).sort()) {
      const full = path.join(folder, name),
        rel = path.relative(root, full),
        st = fs.lstatSync(full);
      if (st.isSymbolicLink()) {
        const resolved = fs.realpathSync(full);
        assert.ok(resolved.startsWith(root + path.sep), 'Tree link escapes declared root');
        links[rel] = { target: fs.readlinkSync(full), resolved: path.relative(root, resolved) };
      } else if (st.isDirectory()) {
        directories.push(rel);
        walk(full);
      } else {
        assert.ok(st.isFile());
        files[rel] = file(full);
      }
    }
  }
  walk(root);
  return { files, links, directories: directories.sort() };
}
function snapshot(request) {
  const host = request.hostRoot,
    dependency = path.join(host, 'node_modules');
  assert.equal(fs.realpathSync(host), host);
  assert.equal(fs.realpathSync(dependency), dependency);
  const packageRoot = path.join(dependency, '@freedom/railgun-kohaku-adapter');
  assert.equal(fs.realpathSync(packageRoot), packageRoot);
  const packageManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json')));
  assert.equal(packageManifest.version, '0.6.0');
  assert.ok(packageManifest.exports['./host/owner']);
  const files = {};
  for (const name of ['package.json', 'package-lock.json'])
    files[path.join(host, name)] = file(path.join(host, name));
  for (const name of [
    request.packageTar,
    request.publicSource,
    request.runtime.archive,
    request.runtime.proverArchive,
    request.electron,
    request.electronFramework,
    request.electronDefaultApp,
  ])
    files[name] = file(name);
  return {
    hostSource: tree(path.join(host, 'src')),
    dependencies: tree(dependency),
    installedPackage: tree(packageRoot),
    artifacts: tree(request.runtime.artifactDirectory),
    files,
  };
}
module.exports = { sha, file, tree, snapshot };
