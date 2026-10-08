"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ledger = require("../tools/qualification/installed-live/live-ledger.cjs");
const header = Object.freeze({
  type: "railgun-installed-journey-ledger",
  version: 1,
  name: "installed-journey-1",
  caps: { sends: 2 },
});
function profile() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "installed-live-ledger-")),
  );
  const directory = path.join(root, "profile");
  fs.mkdirSync(directory);
  return directory;
}
test("an absent campaign admits only the transfer, then only the unshield", () => {
  const p = profile();
  expect(ledger.inspect(p, header).sends).toEqual([]);
  expect(() => ledger.reserve(p, header, "unshield", {})).toThrow();
  const first = ledger.reserve(p, header, "transfer", { hold: "a" });
  expect(() => ledger.reserve(p, header, "unshield", {})).toThrow();
  ledger.finish(p, header, first, { classification: "acknowledged" });
  expect(() => ledger.reserve(p, header, "transfer", {})).toThrow();
  const second = ledger.reserve(p, header, "unshield", {});
  ledger.finish(p, header, second, { classification: "acknowledged" });
  expect(ledger.inspect(p, header).sends).toHaveLength(2);
  expect(() => ledger.reserve(p, header, "unshield", {})).toThrow();
  expect(() => ledger.reserve(p, header, "transfer", {})).toThrow();
});
test("a pending attempt consumes the allowance and finishes exactly once", () => {
  const p = profile();
  const attempt = ledger.reserve(p, header, "transfer", {});
  expect(() => ledger.reserve(p, header, "transfer", {})).toThrow();
  expect(() =>
    ledger.finish(p, header, "f".repeat(32), { classification: "x" }),
  ).toThrow();
  ledger.finish(p, header, attempt, { classification: "unknown" });
  expect(() =>
    ledger.finish(p, header, attempt, { classification: "again" }),
  ).toThrow();
});
test("a changed binding, torn write, extra record or foreign file refuses", () => {
  const p = profile();
  const attempt = ledger.reserve(p, header, "transfer", {});
  expect(() =>
    ledger.inspect(p, { ...header, runnerSha256: "changed" }),
  ).toThrow();
  const file = ledger.ledgerFile(p);
  const original = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, original + '{"type":"send-finished"');
  expect(() => ledger.inspect(p, header)).toThrow();
  fs.writeFileSync(file, original + '{"type":"other"}\n');
  expect(() => ledger.inspect(p, header)).toThrow();
  fs.writeFileSync(file, original);
  fs.writeFileSync(path.join(path.dirname(file), "other.jsonl"), "");
  expect(() => ledger.inspect(p, header)).toThrow();
  expect(() =>
    ledger.finish(p, header, attempt, { classification: "x" }),
  ).toThrow();
});
test("the campaign directory is a new profile sibling", () => {
  const p = profile();
  expect(ledger.ledgerFile(p)).toBe(
    path.join(p + ".installed-journey-ledger", "installed-journey-1.jsonl"),
  );
  const link = p + "-link";
  fs.symlinkSync(p, link);
  expect(() => ledger.ledgerFile(link)).toThrow();
  expect(() => ledger.ledgerFile("relative/profile")).toThrow();
});
test("budgets enforce maximum, spacing and window durably", () => {
  const p = profile();
  const policy = { max: 2, minSpacingMs: 1000, windowMs: 5000 };
  expect(ledger.consume(p, header, "observe:transfer", policy, 10000)).toBe(1);
  expect(() =>
    ledger.consume(p, header, "observe:transfer", policy, 10500),
  ).toThrow(/spacing/);
  expect(ledger.consume(p, header, "observe:transfer", policy, 11000)).toBe(2);
  expect(() =>
    ledger.consume(p, header, "observe:transfer", policy, 13000),
  ).toThrow(/exhausted/);
  const window = { max: 5, minSpacingMs: 0, windowMs: 5000 };
  ledger.consume(p, header, "poi-status", window, 1000);
  expect(() => ledger.consume(p, header, "poi-status", window, 7001)).toThrow(
    /window/,
  );
  expect(ledger.inspect(p, header).budgets["observe:transfer"]).toHaveLength(2);
});
test("one POI handoff only after a continuing transfer", () => {
  const p = profile();
  expect(() => ledger.poiReserve(p, header, {})).toThrow(/poi-order/);
  const attempt = ledger.reserve(p, header, "transfer", {});
  expect(() => ledger.poiReserve(p, header, {})).toThrow(/poi-order/);
  ledger.finish(p, header, attempt, { classification: "unknown" });
  const handoff = ledger.poiReserve(p, header, {
    payloadSha256: "a".repeat(64),
  });
  expect(() => ledger.poiReserve(p, header, {})).toThrow(/poi-pending/);
  ledger.poiFinish(p, header, handoff, { status: "recovery-required" });
  expect(() => ledger.poiFinish(p, header, handoff, {})).toThrow(
    /poi-finished/,
  );
});
test("a refused transfer stops the campaign: no unshield or POI", () => {
  const p = profile();
  const attempt = ledger.reserve(p, header, "transfer", {});
  ledger.finish(p, header, attempt, { classification: "refused-before-send" });
  expect(() => ledger.reserve(p, header, "unshield", {})).toThrow(
    /transfer-not-continuable/,
  );
  expect(() => ledger.poiReserve(p, header, {})).toThrow(/poi-order/);
});
test("report digests are recorded once", () => {
  const p = profile();
  ledger.recordReport(p, header, "live-rebuild", "b".repeat(64));
  expect(() =>
    ledger.recordReport(p, header, "live-submit", "b".repeat(64)),
  ).toThrow(/duplicate/);
  expect(ledger.inspect(p, header).reports).toHaveLength(1);
});
test("replay re-enforces the header's caps on hand-written budget records", () => {
  const p = profile();
  const live = {
    ...header,
    caps: {
      sends: 2,
      observePerSend: { max: 2, minSpacingMs: 1000 },
      readbackPerSend: { max: 1 },
      poiStatus: { max: 2, minSpacingMs: 1000, windowMs: 5000 },
      rebuildNew: 1,
      scanResumes: 1,
      scanRanges: 1,
      txidPages: 1,
    },
  };
  const policy = ledger.policyFor(live.caps, "observe:transfer");
  ledger.consume(p, live, "observe:transfer", policy, 10000);
  const file = ledger.ledgerFile(p);
  const original = fs.readFileSync(file, "utf8");
  const line = (value) => JSON.stringify(value) + "\n";
  for (const record of [
    { type: "budget", kind: "observe:transfer", n: 2, at: 10500 },
    { type: "budget", kind: "observe:transfer", n: 3, at: 11000 },
    { type: "budget", kind: "observe:transfer", n: 1, at: 12000 },
    { type: "budget", kind: "unknown-kind", n: 1, at: 12000 },
  ]) {
    fs.writeFileSync(file, original + line(record));
    expect(() => ledger.inspect(p, live)).toThrow();
  }
  fs.writeFileSync(
    file,
    original +
      line({ type: "budget", kind: "observe:transfer", n: 2, at: 11000 }),
  );
  expect(ledger.inspect(p, live).budgets["observe:transfer"]).toHaveLength(2);
});

const CAPS = {
  sends: 2,
  observePerSend: { max: 40, minSpacingMs: 0 },
  readbackPerSend: { max: 6 },
  poiStatus: { max: 8, minSpacingMs: 0, windowMs: 1e9 },
  rebuildNew: 1,
  scanResumes: 2,
  scanRanges: 260,
  txidPages: 90,
};
function stoppedFirst() {
  const p = profile();
  const first = {
    type: "railgun-installed-journey-ledger",
    version: 1,
    name: ledger.FIRST,
    transport: "live",
    profile: p,
    freedomCommit: "f".repeat(40),
    packageTarSha256: "a".repeat(64),
    runnerSha256: "1".repeat(64),
    binding: {
      heldTransferReportSha256: "d".repeat(64),
      rpc: { url: "https://tenderly.example" },
    },
    caps: CAPS,
  };
  ledger.consume(
    p,
    first,
    "scan-open:new",
    ledger.policyFor(CAPS, "scan-open:new"),
    1000,
  );
  ledger.consume(
    p,
    first,
    "scan-open:pending",
    ledger.policyFor(CAPS, "scan-open:pending"),
    2000,
  );
  ledger.consume(
    p,
    first,
    "scan-range",
    ledger.policyFor(CAPS, "scan-range"),
    3000,
  );
  return { p, first };
}
function continuationOf(p, first, overrides = {}) {
  const crypto = require("crypto");
  const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
  return {
    ...first,
    name: ledger.CONTINUATION,
    runnerSha256: "2".repeat(64),
    binding: {
      ...first.binding,
      rpc: { url: ledger.SENTIO },
      predecessor: {
        name: ledger.FIRST,
        ledgerSha256: hash(fs.readFileSync(ledger.ledgerFile(p))),
        headerSha256: hash(JSON.stringify(first)),
        reason: "frozen endpoint rejects scan windows",
      },
    },
    ...overrides,
  };
}
test("the continuation carries the stopped ledger's consumed budgets forward", () => {
  const { p, first } = stoppedFirst();
  const next = continuationOf(p, first);
  const state = ledger.inspect(p, next);
  expect(
    Object.fromEntries(
      Object.entries(state.budgets).map(([k, v]) => [k, v.length]),
    ),
  ).toEqual({
    "scan-open:new": 1,
    "scan-open:pending": 1,
    "scan-range": 1,
  });
  // No new generation: the one new rebuild is already consumed.
  expect(() =>
    ledger.consume(
      p,
      next,
      "scan-open:new",
      ledger.policyFor(CAPS, "scan-open:new"),
      4000,
    ),
  ).toThrow();
  expect(
    ledger.consume(
      p,
      next,
      "scan-open:pending",
      ledger.policyFor(CAPS, "scan-open:pending"),
      4000,
    ),
  ).toBe(2);
  expect(() =>
    ledger.consume(
      p,
      next,
      "scan-open:pending",
      ledger.policyFor(CAPS, "scan-open:pending"),
      5000,
    ),
  ).toThrow();
  expect(
    ledger.consume(
      p,
      next,
      "scan-range",
      ledger.policyFor(CAPS, "scan-range"),
      5000,
    ),
  ).toBe(2);
  // The aggregate survives replay; sends start fresh at zero.
  expect(ledger.inspect(p, next).budgets["scan-range"]).toHaveLength(2);
  expect(ledger.inspect(p, next).sends).toEqual([]);
  // Once the continuation exists the first ledger is closed.
  expect(() => ledger.inspect(p, first)).toThrow();
  // A changed predecessor byte refuses the continuation.
  const file = ledger.ledgerFile(p);
  const original = fs.readFileSync(file);
  fs.writeFileSync(file, Buffer.concat([original, Buffer.from(" ")]));
  expect(() => ledger.inspect(p, next)).toThrow();
  fs.writeFileSync(file, original);
  expect(ledger.inspect(p, next).budgets["scan-open:pending"]).toHaveLength(2);
});
test("the continuation refuses a missing, re-scoped or non-empty predecessor and any second continuation", () => {
  const empty = profile();
  const base = stoppedFirst();
  expect(() =>
    ledger.inspect(
      empty,
      continuationOf(base.p, base.first, { profile: empty }),
    ),
  ).toThrow();
  const { p, first } = stoppedFirst();
  const good = continuationOf(p, first);
  for (const bad of [
    { ...good, freedomCommit: "e".repeat(40) },
    { ...good, packageTarSha256: "b".repeat(64) },
    {
      ...good,
      binding: { ...good.binding, heldTransferReportSha256: "c".repeat(64) },
    },
    {
      ...good,
      binding: { ...good.binding, rpc: { url: "https://other.example" } },
    },
    {
      ...good,
      binding: {
        ...good.binding,
        predecessor: { ...good.binding.predecessor, reason: "" },
      },
    },
    {
      ...good,
      binding: {
        ...good.binding,
        predecessor: {
          ...good.binding.predecessor,
          headerSha256: "0".repeat(64),
        },
      },
    },
    { ...good, name: "installed-journey-sentio-2" },
  ])
    expect(() => ledger.inspect(p, bad)).toThrow();
  expect(ledger.inspect(p, good).sends).toEqual([]);
  expect(() => ledger.ledgerFile(p, "installed-journey-sentio-2")).toThrow();
  ledger.consume(
    p,
    good,
    "scan-range",
    ledger.policyFor(CAPS, "scan-range"),
    9000,
  );
  fs.writeFileSync(
    require("path").join(
      require("path").dirname(ledger.ledgerFile(p)),
      "installed-journey-sentio-2.jsonl",
    ),
    "",
  );
  expect(() => ledger.inspect(p, good)).toThrow();
  // A predecessor holding a send, a POI handoff, a report or any other event never continues.
  for (const use of [
    (q, h) => ledger.reserve(q, h, "transfer", {}),
    (q, h) => ledger.recordReport(q, h, "live-rebuild", "a".repeat(64)),
    (q, h) =>
      ledger.consume(
        q,
        h,
        "readback:transfer",
        ledger.policyFor(CAPS, "readback:transfer"),
        9000,
      ),
  ]) {
    const s = stoppedFirst();
    use(s.p, s.first);
    expect(() => ledger.inspect(s.p, continuationOf(s.p, s.first))).toThrow();
  }
  const s = stoppedFirst();
  const attempt = ledger.reserve(s.p, s.first, "transfer", {});
  ledger.finish(s.p, s.first, attempt, { classification: "acknowledged" });
  ledger.poiReserve(s.p, s.first, {});
  expect(() => ledger.inspect(s.p, continuationOf(s.p, s.first))).toThrow();
});

function stoppedContinuation(ranges = 3) {
  const { p, first } = stoppedFirst();
  const continuation = continuationOf(p, first);
  ledger.consume(
    p,
    continuation,
    "scan-open:pending",
    ledger.policyFor(CAPS, "scan-open:pending"),
    4000,
  );
  for (let i = 0; i < ranges; i++)
    ledger.consume(
      p,
      continuation,
      "scan-range",
      ledger.policyFor(CAPS, "scan-range"),
      5000 + i,
    );
  return { p, first, continuation };
}
function resumeOf(p, continuation, overrides = {}) {
  const crypto = require("crypto");
  const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
  return {
    ...continuation,
    name: ledger.RESUME,
    runnerSha256: "3".repeat(64),
    caps: { ...CAPS, scanResumes: 4 },
    binding: {
      ...continuation.binding,
      predecessor: {
        name: ledger.CONTINUATION,
        ledgerSha256: hash(
          fs.readFileSync(ledger.ledgerFile(p, ledger.CONTINUATION)),
        ),
        headerSha256: hash(JSON.stringify(continuation)),
        reason: "continuation scan stopped part-way",
      },
    },
    ...overrides,
  };
}
test("the resume binds the continuation transitively and carries the whole chain's budgets", () => {
  const { p, first, continuation } = stoppedContinuation(3);
  const resume = resumeOf(p, continuation);
  const counts = (state) =>
    Object.fromEntries(
      Object.entries(state.budgets).map(([k, v]) => [k, v.length]),
    );
  expect(counts(ledger.inspect(p, resume))).toEqual({
    "scan-open:new": 1,
    "scan-open:pending": 2,
    "scan-range": 4,
  });
  expect(ledger.chainCounts(p, resume, "scan-range")).toEqual({
    [ledger.CONTINUATION]: 3,
    [ledger.FIRST]: 1,
  });
  // The reviewed extension: two more resumes, never a new generation.
  expect(() =>
    ledger.consume(
      p,
      resume,
      "scan-open:new",
      ledger.policyFor(resume.caps, "scan-open:new"),
      9000,
    ),
  ).toThrow();
  expect(
    ledger.consume(
      p,
      resume,
      "scan-open:pending",
      ledger.policyFor(resume.caps, "scan-open:pending"),
      9000,
    ),
  ).toBe(3);
  // Durable progress is strictly increasing.
  expect(
    ledger.progress(p, resume, 9019999, "0x" + "a".repeat(64)),
  ).toHaveLength(1);
  expect(() =>
    ledger.progress(p, resume, 9019999, "0x" + "b".repeat(64)),
  ).toThrow();
  expect(() => ledger.progress(p, resume, 9039999, "0xnot")).toThrow();
  expect(
    ledger.progress(p, resume, 9039999, "0x" + "c".repeat(64)),
  ).toHaveLength(2);
  expect(
    ledger.consume(
      p,
      resume,
      "scan-open:pending",
      ledger.policyFor(resume.caps, "scan-open:pending"),
      9100,
    ),
  ).toBe(4);
  expect(() =>
    ledger.consume(
      p,
      resume,
      "scan-open:pending",
      ledger.policyFor(resume.caps, "scan-open:pending"),
      9200,
    ),
  ).toThrow();
  // Every earlier ledger is closed, and a changed predecessor byte refuses.
  expect(() => ledger.inspect(p, continuation)).toThrow();
  expect(() => ledger.inspect(p, first)).toThrow();
  const file = ledger.ledgerFile(p, ledger.CONTINUATION);
  const original = fs.readFileSync(file);
  fs.writeFileSync(file, Buffer.concat([original, Buffer.from(" ")]));
  expect(() => ledger.inspect(p, resume)).toThrow();
  fs.writeFileSync(file, original);
  expect(ledger.inspect(p, resume).progress).toHaveLength(2);
});
test("the resume refuses a changed endpoint, a skipped link or a continuation that sent", () => {
  const { p, continuation } = stoppedContinuation(2);
  const good = resumeOf(p, continuation);
  for (const bad of [
    {
      ...good,
      binding: { ...good.binding, rpc: { url: "https://other.example" } },
    },
    {
      ...good,
      binding: {
        ...good.binding,
        predecessor: { ...good.binding.predecessor, name: ledger.FIRST },
      },
    },
    { ...good, freedomCommit: "e".repeat(40) },
  ])
    expect(() => ledger.inspect(p, bad)).toThrow();
  expect(ledger.inspect(p, good).sends).toEqual([]);
  const s = stoppedContinuation(1);
  ledger.reserve(s.p, s.continuation, "transfer", {});
  expect(() => ledger.inspect(s.p, resumeOf(s.p, s.continuation))).toThrow();
  const t = stoppedContinuation(1);
  ledger.progress(t.p, t.continuation, 99999, "0x" + "d".repeat(64));
  expect(() => ledger.inspect(t.p, resumeOf(t.p, t.continuation))).toThrow();
});
