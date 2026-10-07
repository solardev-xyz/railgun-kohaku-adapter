/** Main-owned TXID compatibility. A changed policy selects a separate mirror
 * within the public generation; existing encrypted files are retained.
 */
const { createHash } = require('crypto');
const { verifyRailgunEngineRuntime } = require("../execution/railgun-engine-runtime.js");
const engine = require("../execution/railgun-engine-manifest.json");
const { readRailgunPolicySourceIdentity } = require('./source-identity');
const SOURCES = Object.freeze(require('./source-files.json'));
const sha = (v) => createHash('sha256').update(v).digest('hex');
function railgunTxidBinding(binding) {
  if (typeof binding !== 'string' || !/^[0-9a-f]{64}$/.test(binding))
    throw Object.assign(new Error('Railgun TXID binding unavailable'), {
      code: 'RAILGUN_TXID_BINDING_REFUSED',
    });
  return sha(JSON.stringify(['freedom:railgun:txid-store-v1', binding]));
}
function getRailgunTxidPolicy(archive) {
  verifyRailgunEngineRuntime(archive);
  return sha(
    JSON.stringify([
      'freedom:railgun:txid-policy-v1',
      'sepolia',
      11155111,
      engine.sha256,
      engine.inventory.sha256,
      readRailgunPolicySourceIdentity(),
    ])
  );
}
module.exports = { getRailgunTxidPolicy, railgunTxidBinding, SOURCES };
