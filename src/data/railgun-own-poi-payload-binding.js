/** Exact pure payload binder; caller authenticates the expected metadata. */
const assert = require('assert/strict');
const { normalizeRailgunPoiPayload } = require('./railgun-poi-payload');
function bindRailgunOwnPoiPayload(value, expected) {
  const payload = normalizeRailgunPoiPayload(value);
  for (const key of [
    'listKey',
    'poiMerkleroots',
    'txidMerkleroot',
    'txidMerklerootIndex',
    'railgunTxidIfHasUnshield',
  ])
    assert.deepEqual(payload[key], expected[key]);
  assert.equal(payload.blindedCommitmentsOut.length, expected.outputCount);
  // Construct the payload from host-derived metadata. Only the proof and
  // receiver-derived blinded outputs originate with the viewing utility.
  return normalizeRailgunPoiPayload({
    listKey: expected.listKey,
    poiMerkleroots: expected.poiMerkleroots,
    txidMerkleroot: expected.txidMerkleroot,
    txidMerklerootIndex: expected.txidMerklerootIndex,
    railgunTxidIfHasUnshield: expected.railgunTxidIfHasUnshield,
    proof: payload.proof,
    blindedCommitmentsOut: payload.blindedCommitmentsOut,
  });
}
module.exports = { bindRailgunOwnPoiPayload };
