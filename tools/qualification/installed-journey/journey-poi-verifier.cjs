/** Harness-only POI SNARK verifier for the synthetic POI node. It checks a
 * submitted transact proof as the deployed node's snark-proof-verify.ts does:
 * the PINNED engine Prover computes public inputs from the parsed request's own
 * fields (getPublicInputsPOI) and verifies them (verifyPOIProof) with the pinned
 * snarkjs serial prover against the pinned CURRENT POI_3x3 key. There is no
 * retired-key fallback and no bypass. A computation error during one proof's
 * verification is false, as the node's tryVerifyProof; a missing, changed or
 * failed verifier is a harness failure, never acceptance.
 *
 * Limitation: only the 3x3 ("mini") circuit is pinned. The node also tries
 * 13x13, so a genuine 13x13 proof is rejected here.
 *
 * Each verification runs in a fresh child process (main-thread semantics, as
 * the package's own verify job), so the curve state never enters the host.
 */
'use strict';
const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const PINS = Object.freeze({
  // Byte-identical to railgun-prover.asar/serial-prover.cjs (snarkjs 0.7.5).
  serialProver: '7bdacf7141be85646a669f82aec5498616e405c6d978412aea83e6cc8841d4c4',
  // Pinned engine source tree, byte-identical to railgun-engine.asar.
  engine: Object.freeze({
    'prover/prover.js': 'b327c48435abd05b8ce348f7d0268ec6c9c646411cc06d78975bf3b882b46c06',
    'prover/proof-cache-poi.js': '0efd6f1aca7483d65d46ecefc63f5f72bbce17dfaff2bae6af129cb28912742c',
    'utils/bytes.js': '62a6b5db48c13ab6faf7641c2e457104045b18a270ba1cd41bc323c8d1111579',
  }),
  // Current POI_3x3 key (wallet 11.2.0 bundle QmZ2MyM6…Sje8new), derived from
  // the verified zkey; see tmp/privacy-research-oct9-poi-artifacts/PROVENANCE.md.
  vkey: 'b7ca7ba048666fb0e17efd0af1e407a8dcb0906bfaf2f20e362ed40cbec6f4d8',
});
const VKEY_FILE = path.join(__dirname, 'POI_3x3-current.vkey.json');
const TIMEOUT_MS = 120000;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const KEYS = ['blindedCommitmentsOut', 'poiMerkleroots', 'railgunTxidIfHasUnshield', 'snarkProof', 'txidMerkleroot', 'txidMerklerootIndex'];

function pinned({ engineModules, serialProver }) {
  assert.ok(typeof engineModules === 'string' && path.isAbsolute(engineModules));
  assert.ok(typeof serialProver === 'string' && path.isAbsolute(serialProver));
  const dist = path.join(engineModules, '@railgun-community/engine/dist');
  for (const [name, expected] of Object.entries(PINS.engine))
    assert.equal(sha(fs.readFileSync(path.join(dist, name))), expected, 'Engine pin ' + name);
  assert.equal(sha(fs.readFileSync(serialProver)), PINS.serialProver, 'Serial prover pin');
  const text = fs.readFileSync(VKEY_FILE);
  assert.equal(sha(text), PINS.vkey, 'Current POI_3x3 key pin');
  const vkey = JSON.parse(text);
  assert.equal(vkey.protocol, 'groth16');
  assert.equal(vkey.curve, 'bn128');
  assert.equal(vkey.nPublic, 8);
  return { dist, vkey };
}

function createJourneyPoiVerifier({ engineModules, serialProver }) {
  pinned({ engineModules, serialProver });
  let verified = 0,
    rejected = 0,
    failed = 0;
  // Resolves true/false; rejects only when the verifier itself failed.
  function verify(data) {
    assert.deepEqual(Object.keys(data).sort(), KEYS);
    return new Promise((resolve, reject) => {
      let settled = false;
      const child = fork(__filename, [], {
        env: { ELECTRON_RUN_AS_NODE: '1' },
        execArgv: [],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        serialization: 'json',
      });
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        if (error) {
          failed++;
          reject(Object.assign(Error('Synthetic POI verifier unavailable: ' + error), { code: 'SYNTHETIC_POI_VERIFIER_FAILED' }));
        } else {
          if (value) verified++;
          else rejected++;
          resolve(value);
        }
      };
      const timer = setTimeout(() => finish('timeout'), TIMEOUT_MS);
      timer.unref?.();
      child.once('message', (message) => {
        if (message && typeof message.valid === 'boolean' && Object.keys(message).length === 1) finish(null, message.valid);
        else finish(String(message?.error ?? 'malformed reply').slice(0, 200));
      });
      child.once('error', (error) => finish(String(error?.message ?? error).slice(0, 200)));
      child.once('exit', (code) => finish('exited ' + code));
      child.send({ engineModules, serialProver, data: JSON.parse(JSON.stringify(data)) });
    });
  }
  return Object.freeze({
    verify,
    report: () => ({ key: PINS.vkey, circuits: ['3x3'], verified, rejected, failed }),
  });
}

async function child({ engineModules, serialProver, data }) {
  const { dist, vkey } = pinned({ engineModules, serialProver });
  const serial = require(serialProver);
  assert.equal(typeof serial.verify, 'function');
  const { Prover } = require(path.join(dist, 'prover/prover.js'));
  const prover = new Prover({
    getArtifactsPOI: async (maxInputs, maxOutputs) => {
      assert.ok(maxInputs === 3 && maxOutputs === 3);
      return { vkey };
    },
  });
  prover.setSnarkJSGroth16(serial);
  assert.deepEqual(Object.keys(data).sort(), KEYS);
  // As the node's tryVerifyProof(transactProofData, 3, 3).
  try {
    const inputs = prover.getPublicInputsPOI(
      data.txidMerkleroot,
      data.blindedCommitmentsOut,
      data.poiMerkleroots,
      data.railgunTxidIfHasUnshield,
      3,
      3
    );
    return (await prover.verifyPOIProof(inputs, data.snarkProof, 3, 3)) === true;
  } catch {
    return false;
  }
}

if (require.main === module)
  process.once('message', (input) => {
    child(input).then(
      (valid) => process.send({ valid }, () => process.exit(0)),
      (error) => process.send({ error: String(error?.message ?? error).slice(0, 200) }, () => process.exit(1))
    );
  });

module.exports = Object.freeze({ PINS, createJourneyPoiVerifier });
