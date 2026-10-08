/** One public ppoi_node_status read of the fixed POI service, over the
 * dedicated bundled Arti (Codex approval req-7becfaf3), like-for-like with the
 * Oct 6 public capture (params {}). No profile, vault or owned value, and no
 * chain-RPC request. One request, never retried; the bounded public body,
 * status, headers (no cookie/auth) and timing are recorded.
 *
 * node poi-node-status-probe.cjs FREEDOM_ROOT OUTPUT_DIRECTORY
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
  const report = { schema: 'railgun-installed-live-poi-node-status-probe-v1', startedAt: new Date().toISOString(), sourceSha256, service: POI_URL, trace };
  let client;
  try {
    client = await live.openLiveTransport(path.join(output, 'transport'), () => {}, 'sentio');
    report.tor = client.metadata;
    const handle = client.scope.getContext({
      kind: 'service',
      principal: 'public-deployment-probe',
      protocol: 'railgun',
      deployment: 'sepolia',
      chainId: 11155111,
      role: 'poi',
    });
    const row = { method: 'ppoi_node_status', elapsedMs: null, ok: false };
    trace.push(row);
    const started = Date.now();
    try {
      const response = await client.transport.request(handle, POI_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ppoi_node_status', params: {} }),
        timeoutMs: 45000,
      });
      row.elapsedMs = Date.now() - started;
      row.status = response.status;
      row.headers = Object.fromEntries(Object.entries(response.headers ?? {}).filter(([key]) => !/cookie|auth/i.test(key)));
      const bytes = Buffer.isBuffer(response.body) ? response.body : Buffer.from(String(response.body ?? ''));
      row.responseBytes = bytes.length;
      row.truncated = bytes.length > 65536;
      const text = bytes.subarray(0, 65536).toString('utf8');
      row.ok = response.status === 200 && !row.truncated;
      report.status = row.ok ? JSON.parse(text) : null;
      if (!row.ok) row.body = text.slice(0, 2048);
    } catch (error) {
      row.elapsedMs = Date.now() - started;
      row.code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : 'REQUEST_FAILED';
    }
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
