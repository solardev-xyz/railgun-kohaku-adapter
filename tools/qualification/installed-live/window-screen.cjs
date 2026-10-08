/** Bounded public-only Tor screen of every remaining scan window: one
 * address-only eth_getLogs on the Railgun proxy per window of the runner's
 * schedule, from FROM to the finalized block. Each window is measured against
 * the scan source's per-window bounds (at most 4096 logs, 4 MiB of log JSON and
 * 512 distinct log blocks) and its distinct blocks, which set its event-header
 * reads. No profile, vault, owned root, note, EOA, nullifier or transaction:
 * public deployment data only.
 *
 * node window-screen.cjs FREEDOM_ROOT OUTPUT_DIRECTORY FROM
 *
 * Bounds: at most 200 explicit requests and 40 minutes after Tor is ready; no
 * retries. An unreadable window is reported as such, never given a count.
 * This screens log count, JSON bytes and distinct-block cardinality at one
 * snapshot; it does not prove a window acquirable (production also checks log
 * shapes, order, hashes, headers, freshness and application).
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { randomUUID, createHash } = require('crypto');
const { rangesTo } = require('./live-scenario.cjs');
const PROXY = '0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea';
const SENTIO = 'https://sepolia.rpc.sentio.xyz';
const MAX_LOGS = 4096,
  MAX_LOG_JSON = 4 * 1024 * 1024,
  MAX_BLOCKS = 512;
const MAX_REQUESTS = 200,
  MAX_MS = 40 * 60 * 1000;
const hex = (n) => '0x' + n.toString(16);
async function main() {
  const [root, output, fromText] = process.argv.slice(2);
  assert.ok(path.isAbsolute(root) && path.isAbsolute(output));
  const from = Number(fromText);
  assert.ok(Number.isSafeInteger(from) && from >= 0);
  assert.equal(fs.existsSync(output), false);
  fs.mkdirSync(output, { mode: 0o700 });
  const live = require(path.join(root, 'scripts/qualify-ppv2-live.js'));
  const trace = [];
  const report = {
    schema: 'railgun-installed-live-window-screen-v1',
    startedAt: new Date().toISOString(),
    sourceSha256: createHash('sha256')
      .update(fs.readFileSync(path.join(root, 'scripts/qualify-ppv2-live.js')))
      .digest('hex'),
    screenSha256: createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    scheduleSourceSha256: createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'live-scenario.cjs'))).digest('hex'),
    endpoint: SENTIO,
    trace,
    bounds: { maxLogs: MAX_LOGS, maxLogJsonBytes: MAX_LOG_JSON, maxDistinctBlocks: MAX_BLOCKS },
    windows: [],
  };
  let client;
  try {
    client = await live.openLiveTransport(path.join(output, 'transport'), () => {}, 'sentio');
    report.tor = client.metadata;
    // One monotonic request window: each timeout is bounded by what remains,
    // and no request is admitted once it is spent.
    const ready = performance.now();
    const handle = client.scope.getContext({
      kind: 'service',
      principal: 'public-deployment-probe',
      protocol: 'railgun',
      deployment: 'sepolia',
      chainId: 11155111,
      role: 'protocol-rpc',
    });
    async function call(method, params) {
      assert.ok(trace.length < MAX_REQUESTS, 'Request bound reached');
      const remaining = MAX_MS - (performance.now() - ready);
      assert.ok(remaining > 1000, 'Time bound reached');
      const started = performance.now(),
        id = randomUUID();
      const row = { method, ms: null, ok: false };
      trace.push(row);
      try {
        const response = await client.transport.request(handle, SENTIO, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
          timeoutMs: Math.min(45000, Math.floor(remaining)),
        });
        row.status = response.status;
        row.bytes = response.body.length;
        const value = JSON.parse(response.body.toString('utf8'));
        row.ms = Math.round(performance.now() - started);
        if (response.status !== 200 || value.id !== id || Object.hasOwn(value, 'error') || !Object.hasOwn(value, 'result')) {
          row.code = Object.hasOwn(value ?? {}, 'error') ? 'RPC_ERROR' : 'INVALID_RESPONSE';
          if (Number.isSafeInteger(value?.error?.code)) row.rpcErrorCode = value.error.code;
          return undefined;
        }
        row.ok = true;
        return value.result;
      } catch (error) {
        row.ms = Math.round(performance.now() - started);
        row.code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : 'REQUEST_FAILED';
        return undefined;
      }
    }
    report.requestWindowMs = MAX_MS;
    const finalized = await call('eth_getBlockByNumber', ['finalized', false]);
    assert.ok(finalized, 'No finalized block');
    const head = Number(BigInt(finalized.number));
    // An empty screen is never a pass.
    assert.ok(Number.isSafeInteger(head) && head >= from, 'Finalized block below the screen start');
    report.finalized = { number: head, hash: finalized.hash };
    let start = from;
    for (const range of rangesTo(from, { number: head, hash: finalized.hash })) {
      const logs = await call('eth_getLogs', [{ address: PROXY, fromBlock: hex(start), toBlock: hex(range.to) }]);
      const row = { from: start, to: range.to, complete: Array.isArray(logs), ms: trace.at(-1).ms };
      if (Array.isArray(logs)) {
        row.count = logs.length;
        row.logJsonBytes = Buffer.byteLength(JSON.stringify(logs));
        row.distinctBlocks = new Set(logs.map((l) => l.blockNumber)).size;
        row.withinBounds = row.count <= MAX_LOGS && row.logJsonBytes <= MAX_LOG_JSON && row.distinctBlocks <= MAX_BLOCKS;
      }
      report.windows.push(row);
      start = range.to + 1;
    }
    const complete = report.windows.filter((w) => w.complete);
    report.summary = {
      windows: report.windows.length,
      complete: complete.length,
      allWithinBounds: complete.length === report.windows.length && complete.every((w) => w.withinBounds),
      maxDistinctBlocks: Math.max(0, ...complete.map((w) => w.distinctBlocks)),
      maxCount: Math.max(0, ...complete.map((w) => w.count)),
      totalLogs: complete.reduce((sum, w) => sum + w.count, 0),
    };
  } catch (error) {
    report.failure = { code: typeof error?.code === 'string' ? error.code : null, message: String(error?.message ?? '').slice(0, 120) };
  } finally {
    const cleanup = performance.now();
    if (client) await client.close();
    report.cleanupMs = Math.round(performance.now() - cleanup);
    report.requests = trace.length;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'screen.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
}
main().catch(() => {
  process.exitCode = 1;
});
