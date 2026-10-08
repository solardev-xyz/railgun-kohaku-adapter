/** Bounded public-only Tor screen of the scan acquisitions the runner makes,
 * with the scan source's exact request shapes: the finalized header, the
 * canonical headers (anchor, from, to, from-1), one address-only eth_getLogs on
 * the Railgun proxy, and the headers of the returned log blocks. Windows use
 * the runner's 100000-block alignment. No profile, vault, owned root, note,
 * EOA, nullifier or transaction: public deployment data only.
 *
 * node scan-window-probe.cjs FREEDOM_ROOT OUTPUT_DIRECTORY [WINDOW_LABELS]
 *
 * WINDOW_LABELS (comma-separated) limits a repeat screen to named windows and
 * then skips the Tenderly confirmation.
 *
 * Bounds: at most 40 explicit requests and 10 minutes after Tor is ready (Tor
 * readiness is counted separately). Every request, closed error code, size and
 * timing is recorded; nothing is retried. An empty or truncated response is
 * never success: the known public event must be present.
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
const MAX_REQUESTS = 40,
  MAX_LOG_HEADERS = 3,
  MAX_MS = 10 * 60 * 1000;
const hex = (n) => '0x' + n.toString(16);
async function main() {
  const [root, output, only] = process.argv.slice(2);
  const selected = only ? new Set(only.split(',')) : null;
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
    // A fixed recent window: the last complete aligned window below finalized.
    const recent = Math.floor(head / RANGE) * RANGE - RANGE;
    // As the runner's ranges: aligned starts, capped at the finalized anchor.
    const windows = [
      { label: 'first', from: 0, to: RANGE - 1 },
      { label: 'known-event', from: known, to: Math.min(known + RANGE - 1, head) },
      { label: 'recent-sampled', from: recent, to: recent + RANGE - 1 },
    ].filter((w) => !selected || selected.has(w.label));
    assert.ok(windows.length > 0 && windows.every((w) => w.to <= head));
    report.finalized = { number: head, hash: finalized.hash };
    report.windows = {};
    for (const w of windows) {
      const row = (report.windows[w.label] = { from: w.from, to: w.to, headers: {}, count: null, logHeaders: [] });
      // The scan source's canonical boundary reads for this range.
      const numbers = [...new Set([head, w.from, w.to, ...(w.from ? [w.from - 1] : [])])];
      for (const number of numbers) {
        const block = await call('sentio', w.label + ':header', 'eth_getBlockByNumber', [hex(number), false]);
        row.headers[number] = block ? { ok: Number(BigInt(block.number)) === number && /^0x[0-9a-f]{64}$/.test(block.hash) } : { ok: false };
      }
      const logs = await call('sentio', w.label + ':logs', 'eth_getLogs', [{ address: PROXY, fromBlock: hex(w.from), toBlock: hex(w.to) }]);
      if (!Array.isArray(logs)) continue;
      row.count = logs.length;
      row.inRange = logs.every((l) => {
        const n = Number(BigInt(l.blockNumber));
        return n >= w.from && n <= w.to && l.address.toLowerCase() === PROXY;
      });
      row.knownEventPresent = logs.some((l) => Number(BigInt(l.blockNumber)) === KNOWN_LOG_BLOCK);
      // The event-header reads, bounded: each must match the log's block hash.
      const blocks = [...new Map(logs.map((l) => [Number(BigInt(l.blockNumber)), l.blockHash])).entries()].slice(0, MAX_LOG_HEADERS);
      for (const [number, hash] of blocks) {
        const block = await call('sentio', w.label + ':event-header', 'eth_getBlockByNumber', [hex(number), false]);
        row.logHeaders.push({ ok: !!block && block.hash === hash });
      }
    }
    report.passed =
      (!report.windows.first || report.windows.first.count === 0) &&
      (!report.windows['known-event'] || report.windows['known-event'].knownEventPresent === true) &&
      Object.values(report.windows).every(
        (w) => Array.isArray(w.logHeaders) && w.count !== null && w.inRange !== false && Object.values(w.headers).every((h) => h.ok) && w.logHeaders.every((h) => h.ok)
      );
    // The cause of the stopped campaign: one full window on the earlier endpoint.
    if (selected) return;
    const confirm = await call('tenderly', 'known-event:logs', 'eth_getLogs', [
      { address: PROXY, fromBlock: hex(known), toBlock: hex(known + RANGE - 1) },
    ]);
    report.tenderlyFullWindowAccepted = Array.isArray(confirm);
    report.tenderlyLimitSources = {
      documentation: {
        url: 'https://docs.tenderly.co/web3-gateway/references/detailed-json-rpc',
        excerpt:
          'A single eth_getLogs call returns at most 3,000 results. A filter that matches more logs is rejected with JSON-RPC error -32602 ... Each IP address gets 1 GB of response data per day.',
        blockSpanCap: 'not stated',
      },
      thirdParty: {
        url: 'https://github.com/agadgil-sap/aero-bot/pull/43',
        observation: 'Base public gateway, 2026-10-04: spans of 1024 or more blocks rejected with -32602; spans of 1000 or fewer accepted',
      },
    };
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
