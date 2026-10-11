"use strict";
const {
  synchronizeTxids,
} = require("../examples/reference-wallet/txid-command.cjs");
const { createReviews } = require("../examples/reference-wallet/review.cjs");
function fixture() {
  const signal = new AbortController().signal,
    review = jest.fn(() => true);
  const session = { synchronizeTxid: jest.fn() };
  return { signal, review, session };
}
const row = (count) => ({
  count,
  serviceLatestIndex: 201,
  pending: false,
  capacityReached: false,
});
test("synchronizes create-if-missing one page at a time until the observed index is covered", async () => {
  const f = fixture();
  f.session.synchronizeTxid
    .mockResolvedValueOnce(row(100))
    .mockResolvedValueOnce(row(200))
    .mockResolvedValueOnce(row(202));
  expect(await synchronizeTxids(f)).toMatchObject({
    status: "complete",
    pages: 3,
    last: { count: 202 },
  });
  for (const [args] of f.session.synchronizeTxid.mock.calls)
    expect(args).toEqual({
      mode: "initialize",
      signal: f.signal,
      reviewDisclosure: f.review,
    });
});
test("a transport failure is returned, never retried", async () => {
  const f = fixture(),
    progress = jest.fn();
  f.session.synchronizeTxid
    .mockResolvedValueOnce({ ...row(100), root: "not-for-output" })
    .mockRejectedValueOnce(Error("transport"));
  await expect(synchronizeTxids({ ...f, progress })).rejects.toThrow("transport");
  expect(f.session.synchronizeTxid).toHaveBeenCalledTimes(2);
  expect(progress.mock.calls).toEqual([
    [{ status: "txid-syncing", pages: 1, count: 100 }],
  ]);
  expect(Object.isFrozen(progress.mock.calls[0][0])).toBe(true);
});
test("no progress stops; a deadline pauses before another page", async () => {
  const f = fixture();
  f.session.synchronizeTxid.mockResolvedValue(row(100));
  expect(await synchronizeTxids(f)).toMatchObject({
    status: "stopped",
    pages: 2,
  });
  f.session.synchronizeTxid.mockClear();
  expect(
    await synchronizeTxids({ ...f, deadline: Date.now() + 1000 }),
  ).toMatchObject({ status: "paused", pages: 0 });
  expect(f.session.synchronizeTxid).not.toHaveBeenCalled();
});
test.each([{ count: -1 }, { pending: true }, { count: 1.5 }])(
  "invalid owner progress %p refuses",
  async (patch) => {
    const f = fixture(),
      progress = jest.fn();
    f.session.synchronizeTxid.mockResolvedValue({ ...row(100), ...patch });
    await expect(synchronizeTxids({ ...f, progress })).rejects.toThrow("Invalid");
    expect(progress).not.toHaveBeenCalled();
  },
);
function summary() {
  return {
    purpose: "railgun-public-txid-synchronization-disclosure-v1",
    chainId: 11155111,
    mode: "initialize",
    maximumAdvancePages: 1,
    selectedMembershipPermitted: false,
    selectedNullifierQueryPermitted: false,
    signingEnabled: false,
    relaySendPermitted: false,
    queries: [
      { method: "latestTxid", endpoint: "https://ppoi.fdi.network" },
      { method: "validateTxidRoot", endpoint: "https://ppoi.fdi.network" },
      {
        method: "txidPage",
        endpoint:
          "https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql",
      },
    ],
  };
}
test("one bounded public-sync consent checks every page and never selected-note disclosure", async () => {
  const terminal = { confirm: jest.fn(async () => true) },
    controller = new AbortController();
  const review = await createReviews(terminal).txidConsent(controller.signal),
    context = { signal: controller.signal };
  expect(review(summary(), context)).toBe(true);
  expect(
    review({ ...summary(), selectedMembershipPermitted: true }, context),
  ).toBe(false);
  const wrong = summary();
  wrong.queries[0].endpoint = "https://foreign.invalid";
  expect(review(wrong, context)).toBe(false);
  controller.abort();
  expect(review(summary(), context)).toBe(false);
  expect(terminal.confirm).toHaveBeenCalledTimes(1);
});
test("the consent callback refuses its 81st page", async () => {
  const signal = new AbortController().signal,
    review = await createReviews({ confirm: async () => true }).txidConsent(
      signal,
    );
  for (let i = 0; i < 80; i++) expect(review(summary(), { signal })).toBe(true);
  expect(review(summary(), { signal })).toBe(false);
});

const eligible=()=>Object.freeze({schema:"railgun-public-read-failure-v1",operation:"txid-sync",category:"connection"});
test("qualified public failures resume within the original call budget and consent", async () => {
  const f=fixture(), wait=jest.fn(async()=>{}), progress=jest.fn();
  f.session.readTxidReadOutcome=eligible;
  f.session.synchronizeTxid.mockResolvedValueOnce(row(100)).mockRejectedValueOnce(Error("transport"))
    .mockResolvedValueOnce(row(200)).mockRejectedValueOnce(Error("transport"))
    .mockResolvedValueOnce(row(202));
  expect(await synchronizeTxids({...f,wait,progress})).toMatchObject({status:"complete",pages:5});
  expect(wait).toHaveBeenCalledTimes(2);
  expect(f.session.synchronizeTxid).toHaveBeenCalledTimes(5);
  expect(progress.mock.calls.filter(([v])=>v.status==="txid-recovering")).toHaveLength(2);
});
test("two consecutive no-progress failures stop and never renew the deadline", async () => {
  const f=fixture(), wait=jest.fn(async()=>{});
  f.session.readTxidReadOutcome=eligible;
  f.session.synchronizeTxid.mockRejectedValue(Error("transport"));
  await expect(synchronizeTxids({...f,wait})).rejects.toThrow("transport");
  expect(wait).toHaveBeenCalledTimes(1);
  expect(f.session.synchronizeTxid).toHaveBeenCalledTimes(2);
});
test("a third failure after progress stops at the two-recovery backstop", async () => {
  const f=fixture(), wait=jest.fn(async()=>{});
  f.session.readTxidReadOutcome=eligible;
  for(const n of [50,100,150]) f.session.synchronizeTxid.mockResolvedValueOnce(row(n)).mockRejectedValueOnce(Error("transport"));
  await expect(synchronizeTxids({...f,wait})).rejects.toThrow("transport");
  expect(wait).toHaveBeenCalledTimes(2);
  expect(f.session.synchronizeTxid).toHaveBeenCalledTimes(6);
});
test("an 80th failed call consumes the final call and cannot recover", async () => {
  const f=fixture(), wait=jest.fn(async()=>{});
  f.session.readTxidReadOutcome=eligible;
  for(let n=1;n<80;n++) f.session.synchronizeTxid.mockResolvedValueOnce(row(n));
  f.session.synchronizeTxid.mockRejectedValueOnce(Error("transport"));
  await expect(synchronizeTxids({...f,wait})).rejects.toThrow("transport");
  expect(wait).not.toHaveBeenCalled();
  expect(f.session.synchronizeTxid).toHaveBeenCalledTimes(80);
});
test("cancellation and unknown diagnostics do not recover", async () => {
  for(const outcome of [null,{...eligible()},Object.freeze({...eligible(),operation:"private"})]) {
    const f=fixture(), wait=jest.fn(async()=>{});
    f.session.readTxidReadOutcome=()=>outcome;
    f.session.synchronizeTxid.mockRejectedValueOnce(Error("refused"));
    await expect(synchronizeTxids({...f,wait})).rejects.toThrow("refused");
    expect(wait).not.toHaveBeenCalled();
  }
  const f=fixture(), controller=new AbortController(), wait=jest.fn(async()=>{});
  f.session.readTxidReadOutcome=eligible;
  f.session.synchronizeTxid.mockImplementation(async()=>{controller.abort();throw Error("refused");});
  await expect(synchronizeTxids({...f,signal:controller.signal,wait})).rejects.toThrow("refused");
  expect(wait).not.toHaveBeenCalled();
});
