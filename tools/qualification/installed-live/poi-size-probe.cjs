/** One public POI-service read sizing the TXID synchronization: the fixed
 * Sepolia POI node's validated TXID index, over the dedicated bundled Arti.
 * No profile, vault, owned root, note, EOA, nullifier or transaction, and no
 * chain-RPC request. One request, never retried; outcome and timing recorded.
 *
 * node poi-size-probe.cjs FREEDOM_ROOT OUTPUT_DIRECTORY
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { randomUUID, createHash } = require('crypto');
const POI_URL = 'https://ppoi.fdi.network';
async function main() {
  const [root, output] = process.argv.slice(2);
  assert.ok(path.isAbsolute(root) && path.isAbsolute(output));
  assert.equal(fs.existsSync(output), false);
  fs.mkdirSync(output, { mode: 0o700 });
  const live = require(path.join(root, 'scripts/qualify-ppv2-live.js'));
  const sourceSha256 = createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'scripts/qualify-ppv2-live.js')))
    .digest('hex');
  const trace = [];
  const report = { schema: 'railgun-installed-live-poi-size-probe-v1', startedAt: new Date().toISOString(), sourceSha256, service: POI_URL, trace };
  let client;
  try {
    client = await live.openLiveTransport(path.join(output, 'transport'), () => {}, 'sentio');
    report.tor = client.metadata;
    // One POI node acquisition: the validated TXID index and its root.
    const poiHandle = client.scope.getContext({
      kind: 'service',
      principal: 'public-deployment-probe',
      protocol: 'railgun',
      deployment: 'sepolia',
      chainId: 11155111,
      role: 'poi',
    });
    const txidStarted = Date.now();
    let txid = null;
    {
      assert.equal(trace.length, 0);
      const row = { endpoint: 'poi', method: 'ppoi_validated_txid', elapsedMs: null, ok: false };
      trace.push(row);
      try {
        const id = randomUUID();
        const response = await client.transport.request(poiHandle, POI_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id, method: 'ppoi_validated_txid', params: { chainType: '0', chainID: '11155111', txidVersion: 'V2_PoseidonMerkle' } }),
          timeoutMs: 45000,
        });
        const value = JSON.parse(response.body.toString('utf8'));
        row.status = response.status;
        row.elapsedMs = Date.now() - txidStarted;
        if (response.status === 200 && value.id === id && value.result) {
          row.ok = true;
          const index = value.result.validatedTxidIndex;
          txid = {
            validatedTxidIndex: index,
            countIfZeroBasedIndex: Number.isSafeInteger(index) ? index + 1 : null,
            belowCapacity8000: Number.isSafeInteger(index) ? index + 1 < 8000 : null,
            rootField: Object.keys(value.result).filter((key) => key !== 'validatedTxidIndex'),
          };
        } else row.code = 'INVALID_RESPONSE';
      } catch (error) {
        row.elapsedMs = Date.now() - txidStarted;
        row.code = typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED';
      }
    }
    report.txid = txid;
    report.requests = trace.length;
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
