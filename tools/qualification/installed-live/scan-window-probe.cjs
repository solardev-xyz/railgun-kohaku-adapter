/** Bounded public-only Tor screen of the scan windows the runner uses: one
 * eth_getLogs per window on the Railgun proxy, with the runner's 100000-block
 * alignment. No profile, vault, owned root, note, EOA, nullifier or
 * transaction: public deployment data only.
 *
 * node scan-window-probe.cjs FREEDOM_ROOT OUTPUT_DIRECTORY
 *
 * Bounds: at most 12 explicit requests and 10 minutes after Tor is ready.
 * Every request, error code, size and timing is recorded; nothing is retried.
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { randomUUID, createHash } = require('crypto');
const PROXY = '0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea';
// The window holding a known public Railgun Nullified log (public-probe.cjs).
const KNOWN_LOG_BLOCK = 11816741;
const RANGE = 100000;
const ENDPOINTS = Object.freeze({
  sentio: 'https://sepolia.rpc.sentio.xyz',
  tenderly: 'https://gateway.tenderly.co/public/sepolia',
});
const MAX_REQUESTS = 12,
  MAX_MS = 10 * 60 * 1000;
const hex = (n) => '0x' + n.toString(16);
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
  const report = {
    schema: 'railgun-installed-live-scan-window-probe-v1',
    startedAt: new Date().toISOString(),
    sourceSha256,
    endpoints: ENDPOINTS,
    range: RANGE,
    trace,
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
      role: 'protocol-rpc',
    });
    async function call(endpoint, label, method, params) {
      assert.ok(trace.length < MAX_REQUESTS, 'Request bound reached');
      assert.ok(Date.now() - ready < MAX_MS, 'Time bound reached');
      const started = Date.now(),
        id = randomUUID();
      const row = { endpoint, label, method, elapsedMs: null, ok: false };
      trace.push(row);
      try {
        const response = await client.transport.request(handle, ENDPOINTS[endpoint], {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
          timeoutMs: 45000,
        });
        row.status = response.status;
        row.bytes = response.body.length;
        const value = JSON.parse(response.body.toString('utf8'));
        row.elapsedMs = Date.now() - started;
        if (response.status !== 200 || value.id !== id || Object.hasOwn(value, 'error') || !Object.hasOwn(value, 'result')) {
          row.code = Object.hasOwn(value ?? {}, 'error') ? 'RPC_ERROR' : 'INVALID_RESPONSE';
          // A JSON-RPC error code is a public number; its message is not kept.
          if (Number.isSafeInteger(value?.error?.code)) row.rpcErrorCode = value.error.code;
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
    const finalized = await call('sentio', 'finalized', 'eth_getBlockByNumber', ['finalized', false]);
    assert.ok(finalized, 'No finalized block');
    const head = Number(BigInt(finalized.number));
    const known = Math.floor(KNOWN_LOG_BLOCK / RANGE) * RANGE;
    const latest = Math.floor(head / RANGE) * RANGE;
    const windows = [
      { label: 'first', from: 0, to: RANGE - 1 },
      { label: 'known-log', from: known, to: known + RANGE - 1 },
      { label: 'latest', from: latest, to: head },
    ];
    report.finalized = { number: head, hash: finalized.hash };
    report.windows = {};
    for (const w of windows) {
      const logs = await call('sentio', w.label, 'eth_getLogs', [{ address: PROXY, fromBlock: hex(w.from), toBlock: hex(w.to) }]);
      report.windows[w.label] = {
        from: w.from,
        to: w.to,
        count: Array.isArray(logs) ? logs.length : null,
        knownLogPresent: Array.isArray(logs) ? logs.some((l) => Number(BigInt(l.blockNumber)) === KNOWN_LOG_BLOCK) : null,
      };
    }
    // The cause of the stopped campaign: one full window on the earlier endpoint.
    const confirm = await call('tenderly', 'known-log', 'eth_getLogs', [
      { address: PROXY, fromBlock: hex(known), toBlock: hex(known + RANGE - 1) },
    ]);
    report.tenderlyFullWindowAccepted = Array.isArray(confirm);
  } catch (error) {
    report.failure = { code: typeof error?.code === 'string' ? error.code : null, name: error?.name ?? null };
  } finally {
    if (client) await client.close();
    report.requests = trace.length;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'probe.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
}
main().catch(() => {
  process.exitCode = 1;
});
