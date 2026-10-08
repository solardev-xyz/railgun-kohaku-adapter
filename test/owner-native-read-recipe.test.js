/** Source-only recipe controls. Mock facade calls are NOT native qualification. */
"use strict";
const fs = require("fs");
const path = require("path");
const {
  publicFixture,
  ranges,
  createRouter,
  runReadScenario,
} = require("../tools/qualification/owner-facade/read-scenario.cjs");
const bytes = fs.readFileSync(
  path.join(
    __dirname,
    "../docs/freedom-qualification/railgun-unsigned-relay-preparation-2026-10-06/public-source.json",
  ),
);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  promise.catch(() => {});
  return { promise, resolve, reject };
};
function fixture() {
  const readDrain = deferred(),
    sessionDrain = deferred();
  const asset = {
    __type: "erc20",
    contract: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
  };
  const notes = [
    { asset, amount: 1000n, spentTxid: "spent" },
    { asset, amount: 2000n, spentTxid: false },
    { asset, amount: 700n, spentTxid: false },
  ];
  const order = [];
  const read = {
    instanceId: async () => publicFixture(bytes).instanceId,
    notes: async (_, includeSpent) =>
      includeSpent ? notes : notes.filter((note) => note.spentTxid === false),
    balance: async () => [{ asset, amount: 2700n, tag: "unverified" }],
    close: jest.fn(() => {
      order.push("read-close");
      readDrain.resolve();
    }),
    closed: readDrain.promise,
  };
  const session = {
    describe: () => ({
      accountIndex: 0,
      instanceId: publicFixture(bytes).instanceId,
      chainId: 11155111,
      deployment: "sepolia",
    }),
    advancePublic: jest.fn(async () => {
      order.push("advance");
    }),
    openRead: jest.fn(async () => {
      order.push("open-read");
      return read;
    }),
    close: jest.fn(() => {
      order.push("session-close");
      sessionDrain.resolve();
      return sessionDrain.promise;
    }),
    closed: sessionDrain.promise,
  };
  const facade = { createAccount: jest.fn(async () => session) };
  return { facade, session, read, order, readDrain, sessionDrain };
}
test("only exact published source bytes and non-renewed 60 source ranges", () => {
  expect(() =>
    publicFixture(Buffer.concat([bytes, Buffer.from(" ")])),
  ).toThrow();
  expect(ranges()).toHaveLength(60);
  expect(ranges()[0].to).toBe(99999);
  expect(ranges().at(-1).to).toBe(5944730);
  expect(
    new Set(ranges().map((range) => JSON.stringify(range.anchor))).size,
  ).toBe(1);
  const logs = publicFixture(bytes).logs;
  expect(logs.map((log) => log.blockNumber)).toEqual([
    5944710, 5944720, 5944730,
  ]);
  expect(logs[0].blockHash).toBe(
    "0x" + BigInt(5945710).toString(16).padStart(64, "0"),
  );
});
test("synthetic router serves only chain/header/log routes and refuses proof or disclosure calls", () => {
  const router = createRouter(bytes),
    fixture = publicFixture(bytes);
  expect(router.request("eth_chainId", [])).toBe("0xaa36a7");
  const logs = router.request("eth_getLogs", [
    {
      address: fixture.logs[0].address,
      fromBlock: "0x" + (5944700).toString(16),
      toBlock: "0x" + (5944730).toString(16),
    },
  ]);
  expect(logs).toHaveLength(3);
  expect(
    router.request("eth_getBlockByNumber", ["finalized", false]).hash,
  ).toBe(ranges()[0].anchor.hash);
  for (const method of [
    "eth_sendRawTransaction",
    "eth_call",
    "ppoi_pois_per_list",
  ])
    expect(() => router.request(method, [])).toThrow();
  expect(() =>
    router.request("eth_getLogs", [
      {
        address: fixture.logs[0].address,
        fromBlock: "0x0",
        toBlock: "0x186a0",
      },
    ]),
  ).toThrow();
  expect(() => router.assertClean()).toThrow();
  expect(router.counts()).toEqual({
    eth_chainId: 1,
    eth_getLogs: 1,
    eth_getBlockByNumber: 1,
  });
});
test("recipe uses public methods and awaits both exact original closure barriers", async () => {
  const f = fixture(),
    signal = new AbortController().signal;
  const result = await runReadScenario(f.facade, bytes, signal);
  expect(f.facade.createAccount).toHaveBeenCalledWith({
    accountIndex: 0,
    signal,
  });
  expect(f.session.advancePublic).toHaveBeenCalledTimes(60);
  expect(f.session.openRead).toHaveBeenCalledWith({ wallet: "new", signal });
  expect(f.order.slice(-3)).toEqual([
    "open-read",
    "read-close",
    "session-close",
  ]);
  expect(result.unspentAmount).toBe("2700");
  expect(result.proofRecoveryQualified).toBe(false);
});
test("original lane closure is retained before session closure, including failure", async () => {
  const f = fixture();
  f.read.balance = async () => {
    throw Error("read refusal");
  };
  f.read.close.mockImplementation(() => {});
  const run = runReadScenario(f.facade, bytes, new AbortController().signal);
  const failure = expect(run).rejects.toThrow("read refusal");
  for (let i = 0; i < 150; i++) await Promise.resolve();
  expect(f.read.close).toHaveBeenCalledTimes(1);
  expect(f.session.close).not.toHaveBeenCalled();
  f.readDrain.resolve();
  await failure;
  expect(f.session.close).toHaveBeenCalledTimes(1);
});
test("mismatched read values refuse while closing acquired owners", async () => {
  const f = fixture();
  f.read.balance = async () => [
    { amount: 2701n, tag: "unverified", asset: {} },
  ];
  await expect(
    runReadScenario(f.facade, bytes, new AbortController().signal),
  ).rejects.toThrow();
  expect(f.read.close).toHaveBeenCalled();
  expect(f.session.close).toHaveBeenCalled();
});
test("read closure failure is never reported as success", async () => {
  const f = fixture();
  f.read.close.mockImplementation(() =>
    f.readDrain.reject(Error("unknown exit")),
  );
  await expect(
    runReadScenario(f.facade, bytes, new AbortController().signal),
  ).rejects.toThrow("unknown exit");
  expect(f.session.close).toHaveBeenCalled();
});
test("thin host module imports no host or installed runtime until explicit invocation", () => {
  const { execFileSync } = require("child_process");
  const filename = path.resolve(
    __dirname,
    "../tools/qualification/owner-facade/freedom-read.cjs",
  );
  expect(
    execFileSync(
      process.execPath,
      [
        "-e",
        `
    const assert = require('assert/strict');
    const Module = require('module');
    const load = Module._load;
    Module._load = function(request, parent, main) {
      assert.ok(!request.includes('/src/') && !request.startsWith('@freedom/'));
      return Reflect.apply(load, this, [request,parent,main]);
    };
    assert.deepEqual(Object.keys(require(${JSON.stringify(filename)})), ['execute']);
    process.stdout.write('loaded-without-host');
  `,
      ],
      { encoding: "utf8" },
    ),
  ).toBe("loaded-without-host");
});
