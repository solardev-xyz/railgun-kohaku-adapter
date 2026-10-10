"use strict";
const {
  windowEnd,
  scanAccount,
} = require("../examples/reference-wallet/scan.cjs");
const hash = `0x${"a".repeat(64)}`,
  identity = "b".repeat(64);
function fixture(anchorNumber = 200001) {
  let saved = null;
  const state = {
    get: async () => structuredClone(saved),
    update: async (_name, change) => {
      saved = structuredClone(change(structuredClone(saved)));
    },
  };
  let checkpoint = -1,
    fault = null;
  const session = {
    advancePublic: jest.fn(async ({ to }) => {
      if (fault === "before") {
        fault = null;
        throw Error("unavailable");
      }
      if (to <= checkpoint || to - checkpoint > 100000)
        throw Error("out of range");
      checkpoint = to;
      if (fault === "after") {
        fault = null;
        throw Error("acknowledgement lost");
      }
      return { status: "applied-unverified", to: { number: to, hash } };
    }),
  };
  const options = {
    session,
    state,
    anchor: { number: anchorNumber, hash },
    identity,
    signal: new AbortController().signal,
    deadline: Date.now() + 3600000,
  };
  return {
    options,
    fault: (value) => {
      fault = value;
    },
    saved: () => saved,
    checkpoint: () => checkpoint,
  };
}
test("schedule aligns boundaries and caps final tail", () => {
  expect(windowEnd(5600123, 11800000)).toBe(5699999);
  expect(windowEnd(5700000, 11800000)).toBe(5719999);
  expect(windowEnd(5700100, 5711111)).toBe(5711111);
});
test("scan records only returned checkpoints and completes contiguous ranges", async () => {
  const f = fixture();
  expect(await scanAccount({ ...f.options, fresh: true })).toMatchObject({
    status: "complete",
    ranges: 3,
  });
  expect(
    f.options.session.advancePublic.mock.calls.map(([value]) => value.to),
  ).toEqual([99999, 199999, 200001]);
  expect(f.saved()).toMatchObject({
    checkpoint: 200001,
    attempt: null,
    status: "complete",
  });
});
test.each(["before", "after"])(
  "cold resume after failure %s commit never infers a checkpoint",
  async (fault) => {
    const f = fixture();
    f.fault(fault);
    await expect(scanAccount({ ...f.options, fresh: true })).rejects.toThrow();
    expect(f.saved()).toMatchObject({
      checkpoint: -1,
      attempt: { to: 99999, number: 0 },
    });
    if (fault === "after") {
      await expect(scanAccount(f.options)).rejects.toThrow("out of range");
      expect(f.saved()).toMatchObject({
        checkpoint: -1,
        attempt: { to: 99999, number: 1 },
      });
    }
    expect(await scanAccount(f.options)).toMatchObject({ status: "complete" });
    expect(f.checkpoint()).toBe(200001);
  },
);
test("two failed recovery targets stop, and a too-far target never skips data", async () => {
  const f = fixture();
  f.fault("before");
  await expect(scanAccount({ ...f.options, fresh: true })).rejects.toThrow();
  f.fault("before");
  await expect(scanAccount(f.options)).rejects.toThrow();
  await expect(scanAccount(f.options)).rejects.toThrow("out of range");
  const calls = f.options.session.advancePublic.mock.calls.length;
  await expect(scanAccount(f.options)).rejects.toMatchObject({
    code: "REFERENCE_SCAN_RECOVERY_REQUIRED",
  });
  expect(f.options.session.advancePublic).toHaveBeenCalledTimes(calls);
  expect(f.checkpoint()).toBe(-1);
});
test("pause starts no window near expiry; changed identity refuses before a window", async () => {
  const f = fixture();
  expect(
    await scanAccount({
      ...f.options,
      fresh: true,
      deadline: Date.now() + 120000,
    }),
  ).toMatchObject({ status: "paused", checkpoint: -1 });
  expect(f.options.session.advancePublic).not.toHaveBeenCalled();
  await expect(
    scanAccount({ ...f.options, identity: "c".repeat(64) }),
  ).rejects.toThrow("identity");
  expect(f.options.session.advancePublic).not.toHaveBeenCalled();
});
