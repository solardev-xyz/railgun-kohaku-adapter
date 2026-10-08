/** Conservative cache source identity, not execution-coverage or code trust.
 * Membership is generated at build/review time. Initialization reads only this exact
 * list; no caller supplies a path, source selector, hash or replacement reader.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const ROOT = path.resolve(__dirname, '../..');
const LIST_FILE = 'src/owners/source-files.json';
const LIST_SHA256 = '945cf9beac4a149b5c434d5a173135da524f6076a5c2b35a15e7e0fa9612464a';
const PACKAGE = '@freedom/railgun-kohaku-adapter';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const fail = () => Object.assign(new Error('Railgun policy source unavailable'), {
  code: 'RAILGUN_POLICY_SOURCE_REFUSED',
});
let snapshot, captureAttempted = false;
function read(filename, limit) {
  try {
    const target = path.join(ROOT, filename);
    const canonicalRoot = fs.realpathSync(ROOT);
    if (fs.realpathSync(target) !== path.join(canonicalRoot, filename)) throw fail();
    const parts = filename.split('/');
    for (let i = 1; i < parts.length; i++) {
      const parent = fs.lstatSync(path.join(ROOT, ...parts.slice(0, i)));
      if (!parent.isDirectory() || parent.isSymbolicLink()) throw fail();
    }
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || !Number.isSafeInteger(stat.size) || stat.size > limit)
      throw fail();
    const bytes = fs.readFileSync(target);
    if (bytes.byteLength !== stat.size || bytes.byteLength > limit) throw fail();
    return bytes;
  } catch { throw fail(); }
}
function captureRailgunPolicySourceIdentity(hostDigest) {
  if (captureAttempted) throw fail();
  captureAttempted = true;
  if (arguments.length !== 1 || typeof hostDigest !== 'string' || !/^[0-9a-f]{64}$/.test(hostDigest)) throw fail();
  const listBytes = read(LIST_FILE, 65536);
  if (sha(listBytes) !== LIST_SHA256) throw fail();
  const files = JSON.parse(listBytes.toString('utf8'));
  if (!Array.isArray(files) || files.length < 1 || files.length > 1024 ||
      files.some((name, index) => typeof name !== 'string' ||
        !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:js|cjs|mjs|json)$/.test(name) ||
        (index > 0 && files[index - 1] >= name)) ||
      !files.includes(LIST_FILE) || !files.includes('package.json')) throw fail();
  let total = 0;
  const sources = files.map((name) => {
    const bytes = name === LIST_FILE ? listBytes : read(name, 4 * 1024 * 1024);
    total += bytes.byteLength;
    if (total > 32 * 1024 * 1024) throw fail();
    return [name, bytes.byteLength, sha(bytes)];
  });
  snapshot = Object.freeze({
    layout: 'sources-v2',
    package: PACKAGE,
    packageDigest: sha(JSON.stringify([PACKAGE, sources])),
    hostDigest,
  });
}
function readRailgunPolicySourceIdentity() {
  if (arguments.length) throw fail();
  require('./host-bindings').assertRailgunOwnerHost();
  if (!snapshot) throw fail();
  return snapshot;
}
module.exports = { captureRailgunPolicySourceIdentity, readRailgunPolicySourceIdentity };
