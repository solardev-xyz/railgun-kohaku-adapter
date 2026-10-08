/** Bounded public-only Tor screen before any funded-profile work: compares two
 * fixed Sepolia RPC endpoints on the exact requirements of the journey and reads
 * the POI node's validated TXID position once. No profile, vault, owned root,
 * note, EOA, nullifier or transaction: public deployment data only.
 *
 * node public-probe.cjs FREEDOM_ROOT OUTPUT_DIRECTORY
 *
 * Bounds: at most 40 explicit requests and 10 minutes after Tor is ready.
 * Every request, error code and timing is recorded; nothing is retried.
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { randomUUID, createHash } = require('crypto');
const PROXY = '0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea';
const RELAY = '0x7e3d929ebd5bdc84d02bd3205c777578f33a214d';
// A public block with a known Railgun Nullified log (the package's documented
// TXID continuity break, src/data/railgun-txid-omissions.js).
const KNOWN_LOG_BLOCK = 11816741;
const ENDPOINTS = Object.freeze({
  sentio: 'https://sepolia.rpc.sentio.xyz',
  tenderly: 'https://gateway.tenderly.co/public/sepolia',
});
const POI_URL = 'https://ppoi.fdi.network';
const MAX_REQUESTS = 40,
  MAX_MS = 10 * 60 * 1000;
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
  const report = { schema: 'railgun-installed-live-public-probe-v1', startedAt: new Date().toISOString(), sourceSha256, endpoints: ENDPOINTS, trace };
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
      role: 'protocol-rpc',
    });
    async function call(endpoint, url, method, params) {
      assert.ok(trace.length < MAX_REQUESTS, 'Request bound reached');
      assert.ok(Date.now() - ready < MAX_MS, 'Time bound reached');
      const started = Date.now(),
        id = randomUUID();
      const row = { endpoint, method, elapsedMs: null, ok: false };
      trace.push(row);
      try {
        const response = await client.transport.request(handle, url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
          timeoutMs: 45000,
        });
        row.status = response.status;
        const value = JSON.parse(response.body.toString('utf8'));
        row.elapsedMs = Date.now() - started;
        if (response.status !== 200 || value.id !== id || Object.hasOwn(value, 'error') || !Object.hasOwn(value, 'result')) {
          row.code = Object.hasOwn(value ?? {}, 'error') ? 'RPC_ERROR' : 'INVALID_RESPONSE';
          return undefined;
        }
        row.ok = true;
        return value.result;
      } catch (error) {
        row.elapsedMs = Date.now() - started;
        row.code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : 'REQUEST_FAILED';
        return undefined;
      }
    }
    const results = {};
    for (const [name, url] of Object.entries(ENDPOINTS)) {
      const r = (results[name] = {});
      r.chainId = await call(name, url, 'eth_chainId', []);
      const finalized = await call(name, url, 'eth_getBlockByNumber', ['finalized', false]);
      r.finalized = finalized ? { number: Number(BigInt(finalized.number)), hash: finalized.hash } : null;
    }
    // A common finalized block: the lower of the two, read by number from both.
    const numbers = Object.values(results).map((r) => r.finalized?.number).filter(Number.isSafeInteger);
    const common = numbers.length ? Math.min(...numbers) : null;
    const knownLogs = {};
    for (const [name, url] of Object.entries(ENDPOINTS)) {
      const r = results[name];
      if (common === null) continue;
      const block = await call(name, url, 'eth_getBlockByNumber', ['0x' + common.toString(16), false]);
      r.common = block ? { number: Number(BigInt(block.number)), hash: block.hash } : null;
      if (!r.common) continue;
      const anchor = { blockHash: r.common.hash, requireCanonical: true };
      const code = await call(name, url, 'eth_getCode', [PROXY, anchor]);
      r.proxyCodeSha256 = typeof code === 'string' ? createHash('sha256').update(code).digest('hex') : null;
      // RelayAdapt railgun() and wBase(): public deployment pins.
      r.relayRailgun = await call(name, url, 'eth_call', [{ to: RELAY, data: '0x4013074d' }, anchor]);
      r.relayWBase = await call(name, url, 'eth_call', [{ to: RELAY, data: '0x77321c75' }, anchor]);
      const logs = await call(name, url, 'eth_getLogs', [
        { address: PROXY, fromBlock: '0x' + KNOWN_LOG_BLOCK.toString(16), toBlock: '0x' + KNOWN_LOG_BLOCK.toString(16) },
      ]);
      knownLogs[name] = Array.isArray(logs)
        ? { count: logs.length, digest: createHash('sha256').update(JSON.stringify(logs.map((l) => [l.transactionHash, l.logIndex, l.topics, l.data]))).digest('hex') }
        : null;
    }
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
      assert.ok(trace.length < MAX_REQUESTS);
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
    report.results = results;
    report.common = common;
    report.knownLogs = knownLogs;
    report.txid = txid;
    report.requests = trace.length;
    report.elapsedMs = Date.now() - ready;
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
