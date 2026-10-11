/** Complete source attestation and conservative derived-cache compatibility.
 * Neither is execution-coverage or code trust.
 * Membership is generated at build/review time. Initialization reads only this exact
 * list; no caller supplies a path, source selector, hash or replacement reader.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { isProxy } = require('util').types;
const ROOT = path.resolve(__dirname, '../..');
const LIST_FILE = 'src/owners/source-files.json';
const LIST_SHA256 = '599885a6ff9737f433df201787b277c9997103c03c27b1861d586ae4d573584c';
const PACKAGE = '@freedom/railgun-kohaku-adapter';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const fail = () => Object.assign(new Error('Railgun policy source unavailable'), {
  code: 'RAILGUN_POLICY_SOURCE_REFUSED',
});
// Default include: an unknown or newly shipped source rotates all cache policies.
// This module only serializes/classifies POI handoffs; it cannot interpret or
// write public, wallet or TXID generations. Full attestation still includes it.
const CACHE_EXCLUDED = new Set(['src/data/railgun-poi-submit-data.js']);
const CACHE_KINDS = Object.freeze(['public', 'wallet', 'txid']);
let snapshot, cacheSnapshots, captureAttempted = false;
function cacheDigests(value) {
  if (!value || typeof value !== 'object' || isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== CACHE_KINDS.length) throw fail();
  const result = Object.create(null);
  for (const kind of CACHE_KINDS) {
    const entry = descriptors[kind];
    if (!entry || !Object.hasOwn(entry, 'value') || !entry.enumerable ||
        typeof entry.value !== 'string' || !/^[0-9a-f]{64}$/.test(entry.value)) throw fail();
    result[kind] = entry.value;
  }
  return result;
}
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
function captureRailgunPolicySourceIdentity(hostDigest, hostCaches) {
  if (captureAttempted) throw fail();
  captureAttempted = true;
  if (arguments.length < 1 || arguments.length > 2 || typeof hostDigest !== 'string' || !/^[0-9a-f]{64}$/.test(hostDigest)) throw fail();
  const host = arguments.length === 1
    ? Object.fromEntries(CACHE_KINDS.map((kind) => [kind, hostDigest]))
    : cacheDigests(hostCaches);
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
  const packageDigest = sha(JSON.stringify([PACKAGE, sources.filter(([name]) => !CACHE_EXCLUDED.has(name))]));
  cacheSnapshots = Object.freeze(Object.fromEntries(CACHE_KINDS.map((kind) => [kind, Object.freeze({
    layout: 'cache-sources-v1', kind, package: PACKAGE, packageDigest, hostDigest: host[kind],
  })])));
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
function readRailgunCacheSourceIdentity(kind) {
  if (arguments.length !== 1 || !CACHE_KINDS.includes(kind)) throw fail();
  require('./host-bindings').assertRailgunOwnerHost();
  if (!cacheSnapshots) throw fail();
  return cacheSnapshots[kind];
}
module.exports = { captureRailgunPolicySourceIdentity, readRailgunPolicySourceIdentity, readRailgunCacheSourceIdentity };
