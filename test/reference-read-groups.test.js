"use strict";
const { readGroup } = require("../examples/reference-wallet/host/read-group.cjs");
const { createSubmissionReconciler } = require("../examples/reference-wallet/host/reconciler.cjs");
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
test("read groups start together, retain order and drain before returning the first failure", async () => {
  const a = deferred(), b = deferred(), c = deferred();
  const first = Error("first"), later = Error("later");
  let settled = false;
  const work = readGroup([() => a.promise, () => b.promise, () => c.promise]);
  const checked = expect(work).rejects.toBe(first);
  work.then(() => { settled = true; }, () => { settled = true; });
  b.reject(first); a.reject(later);
  await tick(); expect(settled).toBe(false);
  c.resolve(3); await checked;
  expect(await readGroup([() => 3, async () => 2, () => 1])).toEqual([3, 2, 1]);
  await expect(readGroup([() => { throw null; }, () => 1])).rejects.toBeNull();
});
test.each([[[]], [[1]], [[() => 1, () => 2, () => 3, () => 4]]])("read group bound refuses before work: %p", async reads => {
  await expect(readGroup(reads)).rejects.toThrow("Invalid read group");
});
function reconcilerFixture() {
  const records = [10, 11, 12].map(n => ({ hash: `0x${String(n).repeat(32)}`, revision: 1, resolution: {},
    observation: { status: "included", blockNumber: n, blockHash: `0x${"a".repeat(64)}`, confirmations: 1 } }));
  const requests = [], journal = { list: async () => records, observe: jest.fn(async () => {}) };
  const controller = new AbortController();
  const rpc = { signal: controller.signal, request: jest.fn((method, params, validate) => {
    const d = deferred(); requests.push({ method, params, ...d });
    return d.promise.then(result => { if (!validate(result)) throw Error("invalid"); return { result }; });
  }) };
  const reconciler = createSubmissionReconciler({ rpc, journal, principal: {}, assertActive() {} });
  const header = n => ({ number: `0x${n.toString(16)}`, hash: `0x${"a".repeat(64)}` });
  return { reconciler, rpc, journal, requests, header, controller };
}
test("resolved refresh overlaps head with at most two canonical headers and retains batching", async () => {
  const f = reconcilerFixture(), work = f.reconciler.refreshResolved(f.controller.signal);
  await tick(); expect(f.requests.map(r => r.method)).toEqual(["eth_blockNumber", "eth_getBlockByNumber", "eth_getBlockByNumber"]);
  f.requests[1].resolve(f.header(10)); f.requests[2].resolve(f.header(11));
  await tick(); expect(f.journal.observe).not.toHaveBeenCalled();
  f.requests[0].resolve("0x20"); await tick();
  expect(f.requests).toHaveLength(4); expect(f.journal.observe).toHaveBeenCalledTimes(2);
  f.requests[3].resolve(f.header(12)); await work;
  expect(f.journal.observe).toHaveBeenCalledTimes(3);
  expect(f.journal.observe.mock.calls[0][1].confirmations).toBe(23);
});
test("failed head drains both header reads, writes nothing and starts no next batch", async () => {
  const f = reconcilerFixture(), work = f.reconciler.refreshResolved(f.controller.signal);
  let settled = false; work.catch(() => { settled = true; });
  const checked = expect(work).rejects.toThrow("head unavailable");
  await tick(); f.requests[0].reject(Error("head unavailable"));
  f.requests[1].resolve(f.header(10)); await tick(); expect(settled).toBe(false);
  f.requests[2].resolve(f.header(11)); await checked;
  expect(f.requests).toHaveLength(3); expect(f.journal.observe).not.toHaveBeenCalled();
});
test("cancellation after head dispatch drains it before refresh returns", async () => {
  const f = reconcilerFixture();
  const request = f.rpc.request.getMockImplementation();
  f.rpc.request.mockImplementation((...args) => { const p = request(...args); f.controller.abort(); return p; });
  let settled = false;
  const work = f.reconciler.refreshResolved(f.controller.signal);
  work.catch(() => { settled = true; });
  const checked = expect(work).rejects.toMatchObject({ code: "PRIVATE_RECONCILIATION_UNAVAILABLE" });
  await tick(); expect(f.requests).toHaveLength(1); expect(settled).toBe(false);
  f.requests[0].resolve("0x20"); await checked;
  expect(f.journal.observe).not.toHaveBeenCalled();
});
