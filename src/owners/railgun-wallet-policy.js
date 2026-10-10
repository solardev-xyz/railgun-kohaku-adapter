/** Conservative main-owned derived-cache policy. Source bytes deliberately bind
 * host validation as well as the authenticated engine; even a comment-only
 * change can require a fresh generation. No caller supplies a policy override.
 */
const { createHash } = require('crypto');
const { verifyRailgunEngineRuntime } = require("../execution/railgun-engine-runtime.js");
const engine = require("../execution/railgun-engine-manifest.json");
const { getRailgunPublicPolicy } = require("./railgun-public-policy.js");
const { readRailgunCacheSourceIdentity } = require('./source-identity');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function getRailgunWalletPolicy(archive) {
  verifyRailgunEngineRuntime(archive);
  return hash(
    JSON.stringify([
      'freedom:railgun:wallet-policy-v2',
      'sepolia',
      11155111,
      engine.sha256,
      engine.inventory.sha256,
      getRailgunPublicPolicy(archive),
      readRailgunCacheSourceIdentity('wallet'),
    ])
  );
}
module.exports = { getRailgunWalletPolicy };
