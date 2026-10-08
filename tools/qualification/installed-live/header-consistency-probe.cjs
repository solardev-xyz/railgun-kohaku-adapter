/** Bounded public-only Tor diagnostic of one scan window's header consistency,
 * as the scan source checks it: the window's address-only eth_getLogs on the
 * Railgun proxy, then eth_getBlockByNumber for each distinct log block, whose
 * hash must equal the logs' blockHash. No profile, vault, owned data, EOA or
 * transaction: public deployment data only.
 *
 * node header-consistency-probe.cjs FREEDOM_ROOT OUTPUT_DIRECTORY FROM TO
 *
 * Bounds: at most 120 explicit requests and 15 minutes after Tor is ready; no
 * retries. Concurrency 1, unlike the scan source's 8.
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { randomUUID, createHash } = require('crypto');
const PROXY = '0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea';
const SENTIO = 'https://sepolia.rpc.sentio.xyz';
const MAX_REQUESTS = 120,
  MAX_MS = 15 * 60 * 1000;
const hex = (n) => '0x' + n.toString(16);
async function main() {
  const [root, output, fromText, toText] = process.argv.slice(2);
  const from = Number(fromText),
    to = Number(toText);
  assert.ok(path.isAbsolute(root) && path.isAbsolute(output) && Number.isSafeInteger(from) && to >= from && to - from < 100000);
  assert.equal(fs.existsSync(output), false);
  fs.mkdirSync(output, { mode: 0o700 });
  const live = require(path.join(root, 'scripts/qualify-ppv2-live.js'));
  const trace = [];
  const report = {
    schema: 'railgun-installed-live-header-consistency-probe-v1',
    startedAt: new Date().toISOString(),
    probeSha256: createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    endpoint: SENTIO,
    window: { from, to },
    trace,
  };
  let client;
  try {
    client = await live.openLiveTransport(path.join(output, 'transport'), () => {}, 'sentio');
    report.tor = client.metadata;
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
    const logs = await call('eth_getLogs', [{ address: PROXY, fromBlock: hex(from), toBlock: hex(to) }]);
    assert.ok(Array.isArray(logs), 'Logs unavailable');
    const blocks = new Map();
    const conflicts = [];
    for (const log of logs) {
      const n = Number(BigInt(log.blockNumber));
      if (blocks.has(n) && blocks.get(n) !== log.blockHash) conflicts.push(n);
      blocks.set(n, log.blockHash);
    }
    report.logs = { count: logs.length, distinctBlocks: blocks.size, intraLogHashConflicts: conflicts, removed: logs.filter((l) => l.removed !== false).length };
    report.mismatches = [];
    report.unreadable = [];
    for (const [n, hash] of [...blocks.entries()].sort((a, b) => a[0] - b[0])) {
      const header = await call('eth_getBlockByNumber', [hex(n), false]);
      if (!header) report.unreadable.push(n);
      else if (header.hash !== hash || Number(BigInt(header.number)) !== n) report.mismatches.push({ block: n, logBlockHash: hash, headerHash: header.hash });
    }
    report.passed = report.mismatches.length === 0 && report.unreadable.length === 0 && conflicts.length === 0 && report.logs.removed === 0;
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
