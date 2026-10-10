"use strict";
// Public deployment reads only. This tool never imports a vault or account,
// opens a supplied data directory, signs, submits POI or sends a transaction.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const {
  createContextHost,
} = require("../../examples/reference-wallet/host/context.cjs");
const {
  createTorManager,
} = require("../../examples/reference-wallet/host/tor.cjs");
const {
  createTransportHost,
} = require("../../examples/reference-wallet/host/transport.cjs");
const { windowEnd } = require("../../examples/reference-wallet/scan.cjs");
const pins = require("../../src/railgun-shield-pins.json");
const LIMITS = Object.freeze({
  requests: 1100,
  windows: 500,
  elapsedMs: 3600000,
  acquisitionMs: 180000,
});
const METHODS = new Set(["eth_chainId", "eth_getBlockByNumber", "eth_getLogs"]);
const HASH = /^0x[0-9a-f]{64}$/;
const tag = (n) => "0x" + n.toString(16);
function check(value, code = "SCREEN_INVALID_RESPONSE") {
  if (!value) throw Object.assign(Error("Public screen refused"), { code });
}
function quantity(value) {
  check(typeof value === "string" && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value));
  const result = Number(BigInt(value));
  check(Number.isSafeInteger(result) && result >= 0);
  return result;
}
function header(value, number) {
  check(value && HASH.test(value.hash) && HASH.test(value.parentHash));
  const result = {
    number: quantity(value.number),
    hash: value.hash,
    parentHash: value.parentHash,
  };
  check(number === undefined || result.number === number);
  return result;
}
function windowsTo(anchor) {
  check(Number.isSafeInteger(anchor) && anchor >= 0, "SCREEN_INPUT_REFUSED");
  const windows = [];
  for (let from = 0; from <= anchor;) {
    check(windows.length < LIMITS.windows, "SCREEN_WINDOW_LIMIT");
    const to = windowEnd(from, anchor);
    windows.push({ from, to });
    from = to + 1;
  }
  return windows;
}
function logCounts(logs, from, to) {
  check(Array.isArray(logs) && logs.length <= 4096, "SCREEN_LOG_BOUND");
  const bytes = Buffer.byteLength(JSON.stringify(logs));
  check(bytes <= 4 * 1024 * 1024, "SCREEN_LOG_BOUND");
  const blocks = new Map();
  for (const log of logs) {
    check(log?.address?.toLowerCase() === pins.proxy && log.removed === false);
    const number = quantity(log.blockNumber);
    check(number >= from && number <= to && HASH.test(log.blockHash));
    check(!blocks.has(number) || blocks.get(number) === log.blockHash);
    blocks.set(number, log.blockHash);
  }
  check(blocks.size <= 512, "SCREEN_LOG_BOUND");
  return { count: logs.length, bytes, distinctBlocks: blocks.size, blocks };
}
function config(value) {
  check(
    value && Object.keys(value).sort().join() === "binary,rpcUrl,sha256",
    "SCREEN_INPUT_REFUSED",
  );
  check(
    typeof value.binary === "string" &&
      path.isAbsolute(value.binary) &&
      typeof value.sha256 === "string" &&
      /^[0-9a-f]{64}$/.test(value.sha256),
    "SCREEN_INPUT_REFUSED",
  );
  let url;
  try {
    url = new URL(value.rpcUrl);
  } catch {
    check(false, "SCREEN_INPUT_REFUSED");
  }
  check(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    "SCREEN_INPUT_REFUSED",
  );
  return { ...value, rpcUrl: url.href };
}
async function screen({
  transport,
  handle,
  rpcUrl,
  signal,
  report,
  now = () => performance.now(),
  progress = () => {},
  windowFrom,
}) {
  const started = now();
  report.passed = false;
  report.trace = [];
  report.windows = [];
  check(
    windowFrom === undefined ||
      (Number.isSafeInteger(windowFrom) && windowFrom >= 0),
    "SCREEN_INPUT_REFUSED",
  );
  report.coverage =
    windowFrom === undefined ? "all-schedule-windows" : "selected-window";
  async function call(method, params, localSignal = signal) {
    check(METHODS.has(method), "SCREEN_METHOD_REFUSED");
    check(!signal.aborted && !localSignal.aborted, "SCREEN_CANCELLED");
    check(report.trace.length < LIMITS.requests, "SCREEN_REQUEST_LIMIT");
    check(now() - started < LIMITS.elapsedMs, "SCREEN_TIME_LIMIT");
    const row = {
      method,
      status: null,
      bytes: null,
      elapsedMs: null,
      code: null,
    };
    report.trace.push(row);
    const began = now(),
      id = randomUUID();
    try {
      const response = await transport.request(handle, rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: localSignal,
        timeoutMs: 30000,
        connectTimeoutMs:
          method === "eth_getBlockByNumber" || method === "eth_chainId"
            ? 30000
            : 10000,
      });
      row.status = response.status;
      row.bytes = response.body.length;
      let value;
      try {
        value = JSON.parse(response.body.toString("utf8"));
      } catch {
        check(false);
      }
      check(
        response.status === 200 &&
          value &&
          !Array.isArray(value) &&
          value.jsonrpc === "2.0" &&
          value.id === id &&
          !Object.hasOwn(value, "error") &&
          Object.hasOwn(value, "result"),
      );
      check(!signal.aborted && !localSignal.aborted, "SCREEN_CANCELLED");
      return value.result;
    } catch (error) {
      row.code = [
        "TOR_REQUEST_FAILED",
        "TOR_REQUEST_TIMEOUT",
        "PRIVACY_REQUEST_ABORTED",
        "SCREEN_CANCELLED",
        "SCREEN_INVALID_RESPONSE",
      ].includes(error?.code)
        ? error.code
        : "SCREEN_REQUEST_REFUSED";
      throw Object.assign(Error("Public screen request refused"), {
        code: row.code,
      });
    } finally {
      row.elapsedMs = Math.round(now() - began);
    }
  }
  check(
    quantity(await call("eth_chainId", [])) === pins.chainId,
    "SCREEN_CHAIN_MISMATCH",
  );
  const anchor = header(
    await call("eth_getBlockByNumber", ["finalized", false]),
  );
  report.anchor = anchor;
  let densest = null;
  const ranges =
    windowFrom === undefined
      ? windowsTo(anchor.number)
      : [{ from: windowFrom, to: windowEnd(windowFrom, anchor.number) }];
  for (const range of ranges) {
    const began = now();
    const logs = await call("eth_getLogs", [
      {
        address: pins.proxy,
        fromBlock: tag(range.from),
        toBlock: tag(range.to),
      },
    ]);
    const { blocks, ...counts } = logCounts(logs, range.from, range.to);
    const row = { ...range, ...counts, elapsedMs: Math.round(now() - began) };
    report.windows.push(row);
    progress(row);
    if (!densest || counts.distinctBlocks > densest.distinctBlocks)
      densest = { ...row, blocks };
  }
  check(
    windowFrom !== undefined || report.windows.some((row) => row.count > 0),
    "SCREEN_EMPTY_DEPLOYMENT",
  );
  // Exercise one complete header acquisition, not a latency extrapolation.
  // Re-read its logs and canonical boundaries: the inventory above is a snapshot.
  const acquisition = new AbortController();
  const combined = AbortSignal.any([signal, acquisition.signal]);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    acquisition.abort();
  }, LIMITS.acquisitionMs);
  const began = now();
  try {
    const fresh = header(
      await call("eth_getBlockByNumber", ["finalized", false], combined),
    );
    check(fresh.number >= anchor.number);
    const boundaries = new Map();
    for (const n of new Set([
      anchor.number,
      densest.from,
      densest.to,
      ...(densest.from ? [densest.from - 1] : []),
    ]))
      boundaries.set(
        n,
        header(
          await call("eth_getBlockByNumber", [tag(n), false], combined),
          n,
        ),
      );
    check(boundaries.get(anchor.number).hash === anchor.hash);
    if (fresh.number === anchor.number) check(fresh.hash === anchor.hash);
    if (densest.from)
      check(
        boundaries.get(densest.from).parentHash ===
          boundaries.get(densest.from - 1).hash,
      );
    const logs = await call(
      "eth_getLogs",
      [
        {
          address: pins.proxy,
          fromBlock: tag(densest.from),
          toBlock: tag(densest.to),
        },
      ],
      combined,
    );
    const { blocks } = logCounts(logs, densest.from, densest.to);
    // The production normalizer orders blocks and waits for the slowest header
    // in each batch of eight before admitting the next batch. Do not refill a
    // pool: that would understate the effect of heavy-tailed Tor latency.
    const jobs = [...blocks].sort(([a], [b]) => a - b);
    for (let start = 0; start < jobs.length; start += 8) {
      let firstFailure;
      const results = await Promise.allSettled(
        jobs.slice(start, start + 8).map(async ([n, expected]) => {
          try {
            check(
              header(
                await call("eth_getBlockByNumber", [tag(n), false], combined),
                n,
              ).hash === expected,
            );
          } catch (error) {
            firstFailure ||= error;
            acquisition.abort();
            throw error;
          }
        }),
      );
      if (results.some((r) => r.status === "rejected")) throw firstFailure;
    }
    check(
      !combined.aborted && now() - began < LIMITS.acquisitionMs,
      "SCREEN_ACQUISITION_LIMIT",
    );
    report.acquisition = {
      from: densest.from,
      to: densest.to,
      headers: blocks.size,
      elapsedMs: Math.round(now() - began),
      schedule: "sorted-fixed-batches-of-eight",
    };
  } catch (error) {
    if (timedOut && !signal.aborted) check(false, "SCREEN_ACQUISITION_LIMIT");
    throw error;
  } finally {
    clearTimeout(timer);
    acquisition.abort();
  }
  report.passed = true;
  return report;
}
async function main(file, selected) {
  check(
    selected === undefined || /^(?:0|[1-9][0-9]*)$/.test(selected),
    "SCREEN_INPUT_REFUSED",
  );
  const windowFrom = selected === undefined ? undefined : Number(selected);
  check(
    windowFrom === undefined || Number.isSafeInteger(windowFrom),
    "SCREEN_INPUT_REFUSED",
  );
  const stat = fs.lstatSync(file);
  check(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16384,
    "SCREEN_INPUT_REFUSED",
  );
  const bytes = fs.readFileSync(file);
  check(bytes.length <= 16384, "SCREEN_INPUT_REFUSED");
  const input = config(JSON.parse(bytes.toString("utf8")));
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "railgun-reference-public-screen-")),
  );
  fs.chmodSync(root, 0o700);
  const lifetime = new AbortController();
  const stop = () => lifetime.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const timer = setTimeout(stop, LIMITS.elapsedMs);
  timer.unref();
  const tor = createTorManager({
    ...input,
    directory: root,
    signal: lifetime.signal,
  });
  const context = createContextHost();
  const scope = context.createPrivacyScope({
    profileId: "public-deployment-screen",
    signal: lifetime.signal,
  });
  const handle = scope.getContext({
    kind: "service",
    principal: "public-deployment-screen",
    chainId: pins.chainId,
    role: "protocol-rpc",
  });
  const transport = createTransportHost({
    context,
    getEndpoint: tor.getWalletSocksEndpoint,
    allowedOrigins: [new URL(input.rpcUrl).origin],
  }).createWalletTorTransport();
  const report = {
    schema: "reference-public-screen-v1",
    passed: false,
    startedAt: new Date().toISOString(),
    rpcUrl: input.rpcUrl,
    artiSha256: input.sha256,
    limits: LIMITS,
    source: {},
    trust: "unverified-rpc",
    scope:
      windowFrom === undefined
        ? "all schedule window size checks and densest-window batched header acquisition; no projection, proof or service acceptance"
        : "selected public window size checks and batched header acquisition only; no full inventory, projection, proof or service acceptance",
  };
  for (const name of [
    "tools/conformance/reference-public-screen.cjs",
    "examples/reference-wallet/scan.cjs",
    ...[
      "tor",
      "tor-supervisor",
      "transport",
      "socks",
      "context",
      "files",
      "errors",
    ].map((n) => `examples/reference-wallet/host/${n}.cjs`),
    "src/railgun-shield-pins.json",
  ])
    report.source[name] = createHash("sha256")
      .update(fs.readFileSync(path.join(__dirname, "../..", name)))
      .digest("hex");
  process.stdout.write(
    JSON.stringify({ directory: root, starting: true }) + "\n",
  );
  try {
    await tor.start();
    await screen({
      transport,
      handle,
      rpcUrl: input.rpcUrl,
      signal: lifetime.signal,
      report,
      windowFrom,
      progress: (row) => {
        fs.appendFileSync(
          path.join(root, "windows.jsonl"),
          JSON.stringify(row) + "\n",
          { mode: 0o600 },
        );
        if (report.windows.length % 25 === 0)
          process.stdout.write(
            JSON.stringify({
              windows: report.windows.length,
              through: row.to,
            }) + "\n",
          );
      },
    });
  } catch (error) {
    report.code =
      typeof error?.code === "string" &&
      /^(SCREEN_|TOR_)[A-Z_]+$/.test(error.code)
        ? error.code
        : "SCREEN_REFUSED";
  } finally {
    const drains = await Promise.allSettled([
      Promise.resolve().then(() => {
        transport.close();
        return transport.closed;
      }),
      Promise.resolve().then(() => {
        scope.close();
        lifetime.abort();
        return tor.close();
      }),
    ]);
    if (drains.some((r) => r.status === "rejected")) {
      report.passed = false;
      report.primaryCode = report.code ?? null;
      report.code = "SCREEN_DRAIN_FAILED";
    }
    clearTimeout(timer);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(
      path.join(root, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
  }
  process.stdout.write(
    JSON.stringify({
      directory: root,
      passed: report.passed,
      code: report.code ?? null,
    }) + "\n",
  );
  process.exitCode = report.passed ? 0 : 1;
}
if (require.main === module) {
  if (process.argv.length < 3 || process.argv.length > 4) {
    process.stderr.write(
      "Usage: node reference-public-screen.cjs CONFIG.json [PUBLIC_WINDOW_FROM]\n",
    );
    process.exitCode = 1;
  } else
    main(process.argv[2], process.argv[3]).catch(() => {
      process.stderr.write("SCREEN_INPUT_REFUSED\n");
      process.exitCode = 1;
    });
}
module.exports = { screen, windowsTo, logCounts, config, LIMITS };
