/** Writes test/fixtures/journey-poi-verify-proofs.json: one public POI test
 * vector (engine test-vector-poi.json, no account data) proved twice with the
 * pinned engine Prover and snarkjs serial prover, once with the CURRENT and
 * once with the RETIRED POI_3x3 artifacts, so both proofs bind the same
 * transaction/output. Groth16 randomness changes the bytes on regeneration.
 *
 * node poi-verify-fixture.cjs <engineModules> <serialProver> <vector> <currentArtifacts> <retiredArtifacts> <out>
 */
'use strict';
const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VECTOR_SHA256 = 'a52eaba565f55ecc5aa657eb1d98dc9de24bf7351cc77d3c704bce8dc02fea84';
const ARTIFACTS = Object.freeze({
  current: { wasm: 'b82a6d545d94cb774592b652b3d6b3d73f032eac946119b5de631d0609da7cbe', zkey: 'a128e273f8a7b9fa9e04e17da079b89a57e416db845864d0d5c88570564a2066', vkey: 'b7ca7ba048666fb0e17efd0af1e407a8dcb0906bfaf2f20e362ed40cbec6f4d8' },
  retired: { wasm: '831aad53c05d19f9854ed27429610da724fbdf9e1e7023aa7a90666f50b0da78', zkey: '667984c51df2122956107c11c3c606e4e4688f70fb25515b9388cbd5140e48b3', vkey: '2f4dcbf58d383204e09240863a6f6eff249071849e5161801ebfe83691037b23' },
});
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const hex = (value) => BigInt(value).toString(16).padStart(64, '0');

async function main([engineModules, serialProver, vectorFile, currentDirectory, retiredDirectory, out]) {
  const { PINS } = require('./journey-poi-verifier.cjs');
  const dist = path.join(engineModules, '@railgun-community/engine/dist');
  for (const [name, expected] of Object.entries(PINS.engine)) assert.equal(sha(fs.readFileSync(path.join(dist, name))), expected);
  assert.equal(sha(fs.readFileSync(serialProver)), PINS.serialProver);
  const bytes = fs.readFileSync(vectorFile);
  assert.equal(sha(bytes), VECTOR_SHA256);
  const vector = JSON.parse(bytes);
  await require(path.join(dist, 'utils/poseidon')).initPoseidonPromise;
  const { Prover } = require(path.join(dist, 'prover/prover'));
  const serial = require(serialProver);
  const load = (directory, pins) => {
    const read = (kind) => {
      const value = fs.readFileSync(path.join(directory, 'POI_3x3.' + kind));
      assert.equal(sha(value), pins[kind]);
      return value;
    };
    return { wasm: read('wasm'), zkey: read('zkey'), vkey: JSON.parse(read('vkey')) };
  };
  const proofs = {};
  for (const [name, directory] of [['current', currentDirectory], ['retired', retiredDirectory]]) {
    const artifacts = load(directory, ARTIFACTS[name]);
    const prover = new Prover({ getArtifactsPOI: async () => artifacts });
    prover.setSnarkJSGroth16(serial);
    const result = await prover.provePOI(vector, vector.listKey, [], vector.blindedCommitmentsOut, () => {});
    assert.equal(await prover.verifyPOIProof(result.publicInputs, result.proof, 3, 3), true);
    const inputs = result.publicInputs;
    proofs[name] = {
      artifacts: ARTIFACTS[name],
      // Package payload fields (bare roots); the test serializes them itself.
      payload: {
        proof: result.proof,
        poiMerkleroots: [hex(inputs.poiMerkleroots[0])],
        txidMerkleroot: hex(inputs.anyRailgunTxidMerklerootAfterTransaction),
        txidMerklerootIndex: 0,
        blindedCommitmentsOut: vector.blindedCommitmentsOut,
        railgunTxidIfHasUnshield: vector.railgunTxidIfHasUnshield,
      },
    };
  }
  const value = {
    schema: 'railgun-journey-poi-verify-proofs-v1',
    vectorSha256: VECTOR_SHA256,
    generator: 'tools/qualification/installed-journey/poi-verify-fixture.cjs',
    generatorSha256: sha(fs.readFileSync(__filename)),
    serialProverSha256: PINS.serialProver,
    engine: PINS.engine,
    proofs,
  };
  fs.writeFileSync(out, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}

main(process.argv.slice(2)).then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
