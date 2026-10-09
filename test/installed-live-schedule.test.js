"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  rangesTo,
  resumePlan: plan,
} = require("../tools/qualification/installed-live/live-scenario.cjs");
const ledger = require("../tools/qualification/installed-live/live-ledger.cjs");
// As the rebuild does: plan, then record the attempt with its opener.
function resumePlan(context) {
  const value = plan(context);
  if (value.mode !== "exact")
    ledger.resumeAttempt(
      context.profile,
      context.header,
      value.mode,
      value.lower,
      value.upper,
      value.firstTarget,
    );
  return value;
}
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
test("a resume targets the next schedule window after each candidate, never a whole wide window, never a third", () => {
  const context = resumeContext();
  // Live: L = 8,999,999 and T = 9,099,999 (the earlier runner's 100k window).
  expect(resumePlan(context)).toMatchObject({
    mode: "first",
    firstTarget: 9019999,
    lower: 8999999,
    upper: 9099999,
  });
  expect(resumePlan(context)).toMatchObject({
    mode: "second",
    firstTarget: 9119999,
  });
  expect(() => resumePlan(context)).toThrow();
});
test("the earlier first-target rule is reproducible in synthetic runs only", () => {
  const synthetic = resumeContext();
  synthetic.params = { legacyResumeRule: true };
  expect(resumePlan(synthetic)).toMatchObject({
    mode: "first",
    firstTarget: 9099999,
  });
  const live = resumeContext();
  live.params = { legacyResumeRule: true };
  live.synthetic = false;
  expect(() => resumePlan(live)).toThrow();
});
test("a recorded checkpoint narrows the candidates to its last attempted window", () => {
  const context = resumeContext();
  const policy = ledger.policyFor(context.header.caps, "scan-range");
  const reserve = (target) =>
    ledger.consume(
      context.profile,
      context.header,
      "scan-range",
      policy,
      Date.now(),
      { target },
    );
  let n = reserve(9019999);
  ledger.progress(
    context.profile,
    context.header,
    9019999,
    "0x" + "b".repeat(64),
    n,
  );
  // No window attempted beyond the checkpoint: exact.
  expect(resumePlan(context)).toEqual({
    mode: "exact",
    from: 9020000,
    firstTarget: null,
  });
  reserve(9039999);
  expect(resumePlan(context)).toMatchObject({
    mode: "first",
    firstTarget: 9039999,
    lower: 9019999,
    upper: 9039999,
  });
  expect(resumePlan(context)).toMatchObject({
    mode: "second",
    firstTarget: 9059999,
  });
  // Progress after the second attempt starts a fresh candidate pair.
  n = reserve(9059999);
  ledger.progress(
    context.profile,
    context.header,
    9059999,
    "0x" + "c".repeat(64),
    n,
  );
  reserve(9079999);
  expect(resumePlan(context)).toMatchObject({
    mode: "first",
    lower: 9059999,
    upper: 9079999,
    firstTarget: 9079999,
  });
});
test("below 5.7M the second target is the next 100000-block boundary", () => {
  const {
    windowEnd,
  } = require("../tools/qualification/installed-live/live-scenario.cjs");
  expect(windowEnd(3100000)).toBe(3199999);
  expect(windowEnd(5650001)).toBe(5699999);
  expect(windowEnd(9100000)).toBe(9119999);
});
test("after a failed smaller first window the second target still derives from the original pair", () => {
  const context = resumeContext();
  const policy = ledger.policyFor(context.header.caps, "scan-range");
  // The first attempt reserved its 20000-block window and made no progress.
  expect(resumePlan(context)).toMatchObject({
    mode: "first",
    firstTarget: 9019999,
  });
  ledger.consume(
    context.profile,
    context.header,
    "scan-range",
    policy,
    Date.now(),
    { target: 9019999 },
  );
  expect(resumePlan(context)).toMatchObject({
    mode: "second",
    lower: 8999999,
    upper: 9099999,
    firstTarget: 9119999,
  });
  expect(() => resumePlan(context)).toThrow();
});
test("the upgrade plan scopes progress and resume targets to its own phase", () => {
  const fs = require("fs"),
    os = require("os"),
    path = require("path");
  const ledger = require("../tools/qualification/installed-live/live-ledger.cjs");
  const scenario = require("../tools/qualification/installed-live/live-scenario.cjs");
  // Pure: the plan only reads the ledger through the context's profile and header.
  const inspect = jest.spyOn(ledger, "inspect");
  const phaseState = (progress, windows, attempts = []) => ({
    progress: [{ to: 259999, hash: "0x" + "1".repeat(64) }, ...progress],
    budgets: { "scan-range": [{ n: 1, target: 259999 }, ...windows] },
    attempts,
    phase: { progressFrom: 1, rangesFrom: 1, at: 1 },
  });
  const context = { profile: "/p", header: { name: ledger.JOURNEY3 } };
  inspect.mockReturnValue(phaseState([], []));
  expect(scenario.upgradePlan(context)).toEqual({
    mode: "exact",
    lower: -1,
    upper: null,
    from: 0,
    firstTarget: null,
  });
  inspect.mockReturnValue(phaseState([], [{ n: 2, target: 99999 }]));
  expect(scenario.upgradePlan(context)).toMatchObject({
    mode: "first",
    lower: -1,
    upper: 99999,
    firstTarget: 99999,
  });
  inspect.mockReturnValue(
    phaseState([], [{ n: 2, target: 99999 }], [{ lower: -1, upper: 99999 }]),
  );
  expect(scenario.upgradePlan(context)).toMatchObject({
    mode: "second",
    firstTarget: 199999,
  });
  inspect.mockReturnValue(
    phaseState(
      [{ to: 99999, hash: "0x" + "2".repeat(64) }],
      [{ n: 2, target: 99999 }],
    ),
  );
  expect(scenario.upgradePlan(context)).toEqual({
    mode: "exact",
    lower: 99999,
    upper: null,
    from: 100000,
    firstTarget: null,
  });
  // The carried old head never becomes the new generation's start.
  inspect.mockReturnValue(
    phaseState([{ to: 99999, hash: "0x" + "2".repeat(64) }], []),
  );
  expect(scenario.scanStart(context, 0, { number: 120000 })).toBe(100000);
  inspect.mockRestore();
  void fs;
  void os;
  void path;
});
