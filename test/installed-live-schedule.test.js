"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  rangesTo,
  resumePlan,
} = require("../tools/qualification/installed-live/live-scenario.cjs");
const ledger = require("../tools/qualification/installed-live/live-ledger.cjs");
const anchor = (number) => ({ number, hash: "0x" + "a".repeat(64) });
const targets = (from, n) => rangesTo(from, anchor(n)).map((range) => range.to);
test("100000-block windows below 5.7M and 20000-block windows from it, contiguous and capped", () => {
  const all = targets(0, 5744321);
  expect(all.slice(0, 2)).toEqual([99999, 199999]);
  expect(all.indexOf(5699999)).toBe(56);
  expect(all.slice(56)).toEqual([5699999, 5719999, 5739999, 5744321]);
  let start = 0;
  for (const to of all) {
    expect(to - start).toBeLessThan(100000);
    start = to + 1;
  }
  expect(start).toBe(5744322);
});
test("non-aligned cursors end at the next aligned boundary; the tail stops at the anchor", () => {
  expect(targets(9005000, 9059999)).toEqual([9019999, 9039999, 9059999]);
  expect(targets(5650001, 5725000)).toEqual([5699999, 5719999, 5725000]);
  expect(targets(9000000, 9019999)).toEqual([9019999]);
  expect(targets(9020000, 9019999)).toEqual([]);
  // The resume's first window after the live claim's checkpoint.
  expect(targets(8999999 + 1, 11871545)[0]).toBe(9019999);
});
function resumeContext() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "installed-live-schedule-")),
  );
  const profile = path.join(root, "profile");
  fs.mkdirSync(profile);
  const caps = {
    sends: 2,
    observePerSend: { max: 40, minSpacingMs: 0 },
    readbackPerSend: { max: 6 },
    poiStatus: { max: 8, minSpacingMs: 0, windowMs: 1e9 },
    rebuildNew: 1,
    scanResumes: 4,
    scanRanges: 260,
    txidPages: 90,
  };
  const header = {
    type: "railgun-installed-journey-ledger",
    version: 1,
    name: ledger.FIRST,
    transport: "synthetic",
    profile,
    binding: { resumeFrom: { checkpoint: 8999999, failedTarget: 9099999 } },
    caps,
  };
  // A first ledger stands in for the resume ledger's records here.
  return { profile, header, params: {}, synthetic: true };
}
test("a resume tries the no-commit candidate first, then the applied candidate, never a third", () => {
  const context = resumeContext();
  expect(resumePlan(context)).toMatchObject({
    mode: "A",
    from: 9000000,
    lower: 8999999,
    upper: 9099999,
  });
  expect(resumePlan(context)).toMatchObject({ mode: "B", from: 9100000 });
  expect(() => resumePlan(context)).toThrow();
});
test("a recorded checkpoint narrows the candidates to its last attempted window", () => {
  const context = resumeContext();
  const policy = ledger.policyFor(context.header.caps, "scan-range");
  ledger.consume(
    context.profile,
    context.header,
    "scan-range",
    policy,
    Date.now(),
    { target: 9019999 },
  );
  ledger.progress(
    context.profile,
    context.header,
    9019999,
    "0x" + "b".repeat(64),
  );
  // No window attempted beyond the checkpoint: exact.
  expect(resumePlan(context)).toEqual({ mode: "exact", from: 9020000 });
  ledger.consume(
    context.profile,
    context.header,
    "scan-range",
    policy,
    Date.now(),
    { target: 9039999 },
  );
  expect(resumePlan(context)).toMatchObject({
    mode: "A",
    from: 9020000,
    lower: 9019999,
    upper: 9039999,
  });
  expect(resumePlan(context)).toMatchObject({ mode: "B", from: 9040000 });
  // Progress after B starts a fresh candidate pair.
  ledger.consume(
    context.profile,
    context.header,
    "scan-range",
    policy,
    Date.now(),
    { target: 9059999 },
  );
  ledger.progress(
    context.profile,
    context.header,
    9059999,
    "0x" + "c".repeat(64),
  );
  ledger.consume(
    context.profile,
    context.header,
    "scan-range",
    policy,
    Date.now(),
    { target: 9079999 },
  );
  expect(resumePlan(context)).toMatchObject({
    mode: "A",
    lower: 9059999,
    upper: 9079999,
  });
});
