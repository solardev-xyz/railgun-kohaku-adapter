"use strict";
const {
  screen,
  windowsTo,
  logCounts,
  config,
  LIMITS,
} = require("../tools/conformance/reference-public-screen.cjs");
const { proxy } = require("../src/railgun-shield-pins.json");
const hash = (n) => "0x" + n.toString(16).padStart(64, "0");
const tag = (n) => "0x" + n.toString(16);
const block = (n) => ({
  number: tag(n),
  hash: hash(n + 1),
  parentHash: hash(n),
});
const log = (n) => ({
  address: proxy,
  removed: false,
  blockNumber: tag(n),
  blockHash: hash(n + 1),
});
function fixture(change = () => {}) {
  const calls = [],
    signal = new AbortController();
  let active = 0,
    peak = 0;
  const transport = {
    async request(_handle, _url, options) {
      const request = JSON.parse(options.body);
      calls.push(request);
      active++;
      peak = Math.max(peak, active);
      try {
        await Promise.resolve();
        let result;
        if (request.method === "eth_chainId") result = "0xaa36a7";
        else if (request.method === "eth_getBlockByNumber")
          result = block(
            request.params[0] === "finalized"
              ? 40
              : Number(BigInt(request.params[0])),
          );
        else if (request.method === "eth_getLogs")
          result = Array.from({ length: 24 }, (_, n) => log(n + 1));
        else throw Error("Unexpected method");
        const response = {
          status: 200,
          body: Buffer.from(
            JSON.stringify({ jsonrpc: "2.0", id: request.id, result }),
          ),
        };
        await change({ request, response, options, signal, calls });
        if (options.signal.aborted)
          throw Object.assign(Error("Aborted"), {
            code: "PRIVACY_REQUEST_ABORTED",
          });
        return response;
      } finally {
        active--;
      }
    },
  };
  const report = { passed: false };
  return {
    calls,
    report,
    signal,
    peak: () => peak,
    run: (extra = {}) =>
      screen({
        transport,
        handle: {},
        rpcUrl: "https://fixture.invalid/",
        signal: signal.signal,
        report,
        ...extra,
      }),
  };
}
test("the inventory uses the application's aligned schedule and finalized tail", () => {
  const windows = windowsTo(5700042);
  expect(windows).toHaveLength(58);
  expect(windows[56]).toEqual({ from: 5600000, to: 5699999 });
  expect(windows[57]).toEqual({ from: 5700000, to: 5700042 });
  expect(windowsTo(0)).toEqual([{ from: 0, to: 0 }]);
  expect(() => windowsTo(-1)).toThrow();
  expect(() => windowsTo(1e9)).toThrow(
    expect.objectContaining({ code: "SCREEN_WINDOW_LIMIT" }),
  );
});
test("all three log bounds are checked independently", () => {
  expect(
    logCounts(
      Array.from({ length: 512 }, (_, n) => log(n)),
      0,
      1000,
    ).distinctBlocks,
  ).toBe(512);
  expect(() =>
    logCounts(
      Array.from({ length: 513 }, (_, n) => log(n)),
      0,
      1000,
    ),
  ).toThrow();
  expect(() =>
    logCounts(
      Array.from({ length: 4097 }, () => log(1)),
      0,
      1000,
    ),
  ).toThrow();
  expect(() =>
    logCounts([{ ...log(1), data: "a".repeat(4 * 1024 * 1024) }], 0, 1000),
  ).toThrow();
  expect(
    logCounts(
      Array.from({ length: 513 }, () => log(1)),
      0,
      1000,
    ).distinctBlocks,
  ).toBe(1);
});
test.each([
  { ...log(1), address: "0x" + "0".repeat(40) },
  { ...log(1), removed: true },
  { ...log(1), blockNumber: "0x01" },
  { ...log(1), blockNumber: "0x400" },
  { ...log(1), blockHash: "bad" },
])("malformed or unrelated public logs refuse", (value) => {
  expect(() => logCounts([value], 0, 100)).toThrow();
});
test("conflicting hashes for the same log block refuse", () => {
  expect(() =>
    logCounts([log(1), { ...log(1), blockHash: hash(9) }], 0, 10),
  ).toThrow();
});
test("configuration has no profile, credentials or request-override surface", () => {
  const input = {
    binary: "/public/arti",
    sha256: "a".repeat(64),
    rpcUrl: "https://fixture.invalid",
  };
  expect(config(input).rpcUrl).toBe("https://fixture.invalid/");
  for (const value of [
    { ...input, profile: "/wallet" },
    { ...input, sha256: "wrong" },
    { ...input, binary: "relative" },
    ...[
      "http://fixture.invalid",
      "https://secret@fixture.invalid",
      "https://fixture.invalid/?key=secret",
      "https://fixture.invalid/#hash",
    ].map((rpcUrl) => ({ ...input, rpcUrl })),
  ])
    expect(() => config(value)).toThrow();
});
test("screen exercises real request shapes, all event headers and eight-worker ceiling", async () => {
  const f = fixture();
  const result = await f.run();
  expect(result.passed).toBe(true);
  expect(result.windows[0].distinctBlocks).toBe(24);
  expect(result.acquisition.headers).toBe(24);
  expect(f.peak()).toBe(8);
  expect(new Set(f.calls.map((c) => c.method))).toEqual(
    new Set(["eth_chainId", "eth_getBlockByNumber", "eth_getLogs"]),
  );
  for (const request of f.calls.filter((c) => c.method === "eth_getLogs"))
    expect(request.params).toEqual([
      { address: proxy, fromBlock: "0x0", toBlock: "0x28" },
    ]);
  expect(JSON.stringify(result)).not.toContain("params");
});
test.each([
  "http",
  "rpc-error",
  "id",
  "body",
  "chain",
  "null-header",
  "header-hash",
])("%s refuses without retry and never passes", async (kind) => {
  const f = fixture(({ request, response }) => {
    const data = JSON.parse(response.body);
    if (kind === "http") response.status = 403;
    if (kind === "rpc-error")
      data.error = { code: -32602, message: "not retained" };
    if (kind === "id") data.id = "wrong";
    if (kind === "chain") data.result = "0x1";
    if (kind === "null-header" && request.method === "eth_getBlockByNumber")
      data.result = null;
    if (kind === "header-hash" && request.params[0] === "0x1")
      data.result.hash = hash(999);
    response.body =
      kind === "body"
        ? Buffer.from("not json")
        : Buffer.from(JSON.stringify(data));
  });
  await expect(f.run()).rejects.toThrow();
  expect(f.report.passed).toBe(false);
  expect(JSON.stringify(f.report)).not.toContain("not retained");
  expect(f.calls.filter((c) => c.method === "eth_chainId")).toHaveLength(1);
});
test("an acquisition timeout/abort drains all workers and refuses", async () => {
  let active = 0;
  const f = fixture(async ({ request, signal }) => {
    active++;
    try {
      if (request.params[0] === "0x1") signal.abort();
      await Promise.resolve();
    } finally {
      active--;
    }
  });
  await expect(f.run()).rejects.toThrow();
  expect(active).toBe(0);
  expect(f.report.passed).toBe(false);
});
test("aggregate lifetime is checked before each dispatch", async () => {
  const f = fixture();
  let time = 0;
  await expect(
    f.run({ now: () => (time += LIMITS.elapsedMs) }),
  ).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});
test("an empty deployment never passes even with a caller-supplied true result", async () => {
  const f = fixture(({ request, response }) => {
    if (request.method === "eth_getLogs") {
      const data = JSON.parse(response.body);
      data.result = [];
      response.body = Buffer.from(JSON.stringify(data));
    }
  });
  f.report.passed = true;
  await expect(f.run()).rejects.toThrow(
    expect.objectContaining({ code: "SCREEN_EMPTY_DEPLOYMENT" }),
  );
  expect(f.report.passed).toBe(false);
});
test("the next sorted batch waits for every header in the first batch", async () => {
  let release, ready;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const entered = new Promise((resolve) => {
    ready = resolve;
  });
  const f = fixture(async ({ request, response }) => {
    if (request.method === "eth_getLogs") {
      const data = JSON.parse(response.body);
      data.result.reverse();
      response.body = Buffer.from(JSON.stringify(data));
    }
    if (request.params[0] === "0x8") ready();
    if (request.params[0] === "0x1") await barrier;
  });
  const pending = f.run();
  try {
    await entered;
    await new Promise(setImmediate);
    expect(f.calls.some((c) => c.params[0] === "0x9")).toBe(false);
  } finally {
    release();
  }
  expect((await pending).acquisition.schedule).toBe(
    "sorted-fixed-batches-of-eight",
  );
});
test("selected-window mode is separately labeled and rejects a target beyond finalized", async () => {
  const f = fixture();
  expect((await f.run({ windowFrom: 0 })).coverage).toBe("selected-window");
  await expect(fixture().run({ windowFrom: 41 })).rejects.toThrow();
});
test("the real acquisition timer is reported distinctly from transport failure", async () => {
  jest.useFakeTimers();
  try {
    let ready;
    const entered = new Promise((resolve) => {
      ready = resolve;
    });
    const f = fixture(async ({ request, options }) => {
      if (request.params[0] === "0x1") {
        ready();
        await new Promise((resolve) =>
          options.signal.addEventListener("abort", resolve, { once: true }),
        );
      }
    });
    const pending = f.run().catch((error) => error);
    await entered;
    jest.advanceTimersByTime(LIMITS.acquisitionMs);
    expect((await pending).code).toBe("SCREEN_ACQUISITION_LIMIT");
    expect(f.report.passed).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});
