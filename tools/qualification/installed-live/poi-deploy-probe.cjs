/** Two synthetic public requests characterizing the deployed POI service's
 * ppoi_submit_transact_proof error mapping (Codex approval req-6ff915d2). No
 * profile, vault, owned note, commitment, root, capsule or transaction; public
 * chain/list fields and dummy values only. Probe 2's proof is checked locally
 * to be invalid (A and C off the BN254 G1 curve) before anything is sent.
 * At most two calls, never retried; <=45 s each, <=5 min after Tor readiness.
 *
 * node poi-deploy-probe.cjs FREEDOM_ROOT PACKAGE_ROOT OUTPUT_DIRECTORY
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { createHash } = require('crypto');
const POI_URL = 'https://ppoi.fdi.network';
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const MAX_BODY = 2048;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const onG1 = ([x, y]) => (BigInt(y) ** 2n - (BigInt(x) ** 3n + 3n)) % P === 0n;
async function main() {
  const [root, pkg, output] = process.argv.slice(2);
  assert.ok(path.isAbsolute(root) && path.isAbsolute(pkg) && path.isAbsolute(output));
  assert.equal(fs.existsSync(output), false);
  const { prepareRailgunPoiSubmission } = require(path.join(pkg, 'src/data/railgun-poi-submit-data.js'));
  const { REQUIRED_LIST } = require(path.join(pkg, 'src/data/railgun-poi-records.js'));
  const zeroPad = (n) => n.toString(16).padStart(64, '0');
  // Probe 2: the package serializer's exact envelope, dummy public values only.
  const proof = { pi_a: ['1', '3'], pi_b: [['3', '4'], ['5', '6']], pi_c: ['2', '5'] };
  assert.equal(onG1(proof.pi_a), false);
  assert.equal(onG1(proof.pi_c), false);
  const invalidProof = prepareRailgunPoiSubmission({
    requestId: Date.now(),
    payload: {
      listKey: REQUIRED_LIST,
      proof,
      poiMerkleroots: [zeroPad(1n)],
      txidMerkleroot: zeroPad(2n),
      txidMerklerootIndex: 0,
      blindedCommitmentsOut: ['0x' + zeroPad(5n)],
      railgunTxidIfHasUnshield: '0x00',
    },
  }).body;
  // Probe 1: the same envelope without transactProofData (schema-invalid).
  const schemaInvalid = JSON.stringify({
    jsonrpc: '2.0',
    method: 'ppoi_submit_transact_proof',
    params: { chainType: '0', chainID: '11155111', txidVersion: 'V2_PoseidonMerkle', listKey: REQUIRED_LIST },
    id: Date.now() + 1,
  });
  fs.mkdirSync(output, { mode: 0o700 });
  const live = require(path.join(root, 'scripts/qualify-ppv2-live.js'));
  const report = {
    schema: 'railgun-installed-live-poi-deploy-probe-v1',
    approval: 'local/req-6ff915d2cf49c2aa65618192f2dd9867',
    startedAt: new Date().toISOString(),
    service: POI_URL,
    localChecks: { proofAOnG1: onG1(proof.pi_a), proofCOnG1: onG1(proof.pi_c) },
    probes: [],
  };
  let client;
  try {
    client = await live.openLiveTransport(path.join(output, 'transport'), () => {}, 'sentio');
    report.tor = client.metadata;
    const ready = Date.now();
    const handle = client.scope.getContext({
      kind: 'service',
      principal: 'public-deployment-probe',
      protocol: 'railgun',
      deployment: 'sepolia',
      chainId: 11155111,
      role: 'poi',
    });
    for (const [name, body] of [
      ['schema-invalid', schemaInvalid],
      ['invalid-proof', invalidProof],
    ]) {
      assert.ok(Date.now() - ready < 5 * 60 * 1000, 'Time bound reached');
      const row = { name, requestBytes: Buffer.byteLength(body), requestSha256: sha(body), request: JSON.parse(body) };
      report.probes.push(row);
      const started = Date.now();
      try {
        const response = await client.transport.request(handle, POI_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          timeoutMs: 45000,
        });
        row.elapsedMs = Date.now() - started;
        row.status = response.status;
        row.responseFields = Object.keys(response);
        const headers = response.headers ?? {};
        row.headers = Object.fromEntries(
          Object.entries(headers).filter(([key]) => !/cookie|auth/i.test(key))
        );
        const bytes = Buffer.isBuffer(response.body) ? response.body : Buffer.from(String(response.body ?? ''));
        row.responseBytes = bytes.length;
        row.truncated = bytes.length > MAX_BODY;
        row.body = bytes.subarray(0, MAX_BODY).toString('utf8');
      } catch (error) {
        row.elapsedMs = Date.now() - started;
        row.transportFailure = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : 'REQUEST_FAILED';
        // A transport failure ends the batch: no comparison from missing evidence.
        break;
      }
    }
  } catch (error) {
    report.failure = typeof error?.code === 'string' ? error.code : error?.message?.slice(0, 120) ?? 'unknown';
  } finally {
    if (client) await client.close();
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'probe.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
}
main().catch(() => {
  process.exitCode = 1;
});
