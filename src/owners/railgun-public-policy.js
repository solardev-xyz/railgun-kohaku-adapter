/** Cache compatibility for the pinned Sepolia public-state planner/apply pair.
 * Governance after the qualified historical capture requires fresh review.
 */
const { createHash } = require('crypto');
const { verifyRailgunEngineRuntime } = require("../execution/railgun-engine-runtime.js");
const manifest = require("../execution/railgun-engine-manifest.json");
const QUALIFIED_THROUGH = 11829346;
const { readRailgunPolicySourceIdentity } = require('./source-identity');
const SOURCES = Object.freeze(require('./source-files.json'));
function getRailgunPublicPolicy(archive) {
  verifyRailgunEngineRuntime(archive);
  const sha = (v) => createHash('sha256').update(v).digest('hex');
  return sha(
    JSON.stringify({
      schema: 'freedom:railgun:public-policy-v1',
      chainId: 11155111,
      qualifiedThrough: QUALIFIED_THROUGH,
      engine: manifest.sha256,
      inventory: manifest.inventory.sha256,
      sources: readRailgunPolicySourceIdentity(),
    })
  );
}
module.exports = { QUALIFIED_THROUGH, SOURCES, getRailgunPublicPolicy };
