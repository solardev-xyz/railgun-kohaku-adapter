/** Bounded public-only Tor diagnostic of one scan window's density against the
 * scan source's per-window bounds (at most 4096 logs, 4 MiB of log JSON and
 * 512 distinct log blocks):
 * the 100000-block window from FROM and its five aligned 20000-block parts,
 * as address-only eth_getLogs on the Railgun proxy. No profile, vault, owned
 * root, note, EOA, nullifier or transaction: public deployment data only.
 *
 * node window-density-probe.cjs FREEDOM_ROOT OUTPUT_DIRECTORY FROM
 *
 * Bounds: at most 12 explicit requests and 10 minutes after Tor is ready; no
 * retries. A response that cannot be read whole is reported as such, never
 * given an invented count.
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { randomUUID, createHash } = require('crypto');
const PROXY = '0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea';
const SENTIO = 'https://sepolia.rpc.sentio.xyz';
const WINDOW = 100000,
  PART = 20000,
  MAX_LOGS = 4096,
  MAX_LOG_JSON = 4 * 1024 * 1024,
  MAX_BLOCKS = 512;
const MAX_REQUESTS = 12,
  MAX_MS = 10 * 60 * 1000;
const hex = (n) => '0x' + n.toString(16);
async function main() {
  const [root, output, fromText] = process.argv.slice(2);
  assert.ok(path.isAbsolute(root) && path.isAbsolute(output));
  const from = Number(fromText);
  assert.ok(Number.isSafeInteger(from) && from >= 0 && from % WINDOW === 0);
  assert.equal(fs.existsSync(output), false);
  fs.mkdirSync(output, { mode: 0o700 });
  const live = require(path.join(root, 'scripts/qualify-ppv2-live.js'));
  const trace = [];
  const report = {
    schema: 'railgun-installed-live-window-density-probe-v1',
    startedAt: new Date().toISOString(),
    sourceSha256: createHash('sha256')
      .update(fs.readFileSync(path.join(root, 'scripts/qualify-ppv2-live.js')))
      .digest('hex'),
    endpoint: SENTIO,
    bounds: { maxLogs: MAX_LOGS, maxLogJsonBytes: MAX_LOG_JSON, maxDistinctBlocks: MAX_BLOCKS },
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
    async function call(label, method, params) {
      assert.ok(trace.length < MAX_REQUESTS, 'Request bound reached');
      assert.ok(Date.now() - ready < MAX_MS, 'Time bound reached');
      const started = Date.now(),
        id = randomUUID();
      const row = { label, method, elapsedMs: null, ok: false };
      trace.push(row);
      try {
        const response = await client.transport.request(handle, SENTIO, {
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
    const finalized = await call('finalized', 'eth_getBlockByNumber', ['finalized', false]);
    assert.ok(finalized, 'No finalized block');
    const head = Number(BigInt(finalized.number));
    assert.ok(from + WINDOW - 1 <= head, 'Window not finalized');
    report.finalized = { number: head, hash: finalized.hash };
    const digest = (logs) =>
      createHash('sha256')
        .update(JSON.stringify(logs.map((l) => [l.blockNumber, l.transactionHash, l.logIndex, l.topics, l.data])))
        .digest('hex');
    const measure = (label, lo, hi, logs) => {
      if (!Array.isArray(logs)) return { from: lo, to: hi, complete: false };
      const json = Buffer.byteLength(JSON.stringify(logs));
      const distinctBlocks = new Set(logs.map((l) => l.blockNumber)).size;
      return {
        distinctBlocks,
        withinBlockBound: distinctBlocks <= MAX_BLOCKS,
        from: lo,
        to: hi,
        complete: true,
        count: logs.length,
        logJsonBytes: json,
        withinLogBound: logs.length <= MAX_LOGS,
        withinJsonBound: json <= MAX_LOG_JSON,
        inRange: logs.every((l) => {
          const n = Number(BigInt(l.blockNumber));
          return n >= lo && n <= hi && l.address.toLowerCase() === PROXY;
        }),
        digest: digest(logs),
      };
    };
    const whole = await call('window', 'eth_getLogs', [{ address: PROXY, fromBlock: hex(from), toBlock: hex(from + WINDOW - 1) }]);
    report.window = measure('window', from, from + WINDOW - 1, whole);
    report.parts = [];
    const union = [];
    for (let lo = from; lo < from + WINDOW; lo += PART) {
      const logs = await call('part', 'eth_getLogs', [{ address: PROXY, fromBlock: hex(lo), toBlock: hex(lo + PART - 1) }]);
      report.parts.push(measure('part', lo, lo + PART - 1, logs));
      if (Array.isArray(logs)) union.push(...logs);
    }
    if (report.window.complete && report.parts.every((p) => p.complete))
      report.unionMatchesWindow = digest(union) === report.window.digest && union.length === report.window.count;
  } catch (error) {
    report.failure = { code: typeof error?.code === 'string' ? error.code : null, message: String(error?.message ?? '').slice(0, 120) };
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
