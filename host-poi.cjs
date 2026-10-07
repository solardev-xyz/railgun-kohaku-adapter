/** Trusted-host POI/TXID data and explicit crypto callbacks. No host authority. */
module.exports = Object.freeze({
  ...require('./src/data/railgun-poi-records'),
  ...require('./src/data/railgun-poi-payload'),
  ...require('./src/data/railgun-poi-creator-data'),
  ...require('./src/data/railgun-poi-shield-selector-data'),
  ...require('./src/data/railgun-poi-transact-selector-data'),
  ...require('./src/data/railgun-own-poi-binding'),
  ...require('./src/data/railgun-own-poi-shape-data'),
  ...require('./src/data/railgun-owned-poi-records'),
  ...require('./src/data/railgun-poi-submit-data'),
  ...require('./src/data/railgun-txid-note-witness'),
  ...require('./src/data/railgun-txid-projection'),
  ...require('./src/data/railgun-txid-omissions'),
  ...require('./src/data/railgun-own-poi-payload-binding'),
});
