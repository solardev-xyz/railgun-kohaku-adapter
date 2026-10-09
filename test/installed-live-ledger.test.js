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
  // Durable progress answers its window reservation and is strictly increasing.
  const policy = ledger.policyFor(resume.caps, "scan-range");
  const one = ledger.consume(p, resume, "scan-range", policy, 9001, {
    target: 9019999,
  });
  expect(() =>
    ledger.progress(p, resume, 9019999, "0x" + "a".repeat(64), one - 1),
  ).toThrow();
  expect(() =>
    ledger.progress(p, resume, 9039999, "0x" + "a".repeat(64), one),
  ).toThrow();
  expect(
    ledger.progress(p, resume, 9019999, "0x" + "a".repeat(64), one),
  ).toHaveLength(1);
  expect(() =>
    ledger.progress(p, resume, 9019999, "0x" + "b".repeat(64), one),
  ).toThrow();
  const two = ledger.consume(p, resume, "scan-range", policy, 9002, {
    target: 9039999,
  });
  expect(() => ledger.progress(p, resume, 9039999, "0xnot", two)).toThrow();
  expect(
    ledger.progress(p, resume, 9039999, "0x" + "c".repeat(64), two),
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
  const n = ledger.consume(
    t.p,
    t.continuation,
    "scan-range",
    ledger.policyFor(CAPS, "scan-range"),
    9500,
    { target: 99999 },
  );
  ledger.progress(t.p, t.continuation, 99999, "0x" + "d".repeat(64), n);
  expect(() => ledger.inspect(t.p, resumeOf(t.p, t.continuation))).toThrow();
});

function stoppedResume() {
  const { p, continuation } = stoppedContinuation(3);
  const resume = resumeOf(p, continuation, {
    binding: {
      ...resumeOf(p, continuation).binding,
      resumeFrom: { checkpoint: 199999, failedTarget: 299999, evidence: "x" },
    },
  });
  ledger.consume(
    p,
    resume,
    "scan-open:pending",
    ledger.policyFor(resume.caps, "scan-open:pending"),
    9000,
  );
  ledger.resumeAttempt(p, resume, "first", 199999, 299999, 299999);
  ledger.consume(
    p,
    resume,
    "scan-range",
    ledger.policyFor(resume.caps, "scan-range"),
    9001,
    { target: 299999 },
  );
  return { p, continuation, resume };
}
function resume2Of(p, resume, overrides = {}) {
  const crypto = require("crypto");
  const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
  return {
    ...resume,
    name: ledger.RESUME2,
    runnerSha256: "4".repeat(64),
    binding: {
      ...resume.binding,
      predecessor: {
        name: ledger.RESUME,
        ledgerSha256: hash(
          fs.readFileSync(ledger.ledgerFile(p, ledger.RESUME)),
        ),
        headerSha256: hash(JSON.stringify(resume)),
        reason: "first resume target exceeded the per-window block bound",
      },
    },
    ...overrides,
  };
}
test("the second resume link binds the first resume, its attempt record included, and carries all budgets", () => {
  const { p, continuation, resume } = stoppedResume();
  const next = resume2Of(p, resume);
  const state = ledger.inspect(p, next);
  expect(state.budgets["scan-open:pending"]).toHaveLength(3);
  expect(state.budgets["scan-range"]).toHaveLength(5);
  expect(state.attempts).toEqual([]);
  expect(Object.keys(ledger.chainRecords(p, next)).sort()).toEqual(
    [ledger.CONTINUATION, ledger.FIRST, ledger.RESUME].sort(),
  );
  ledger.consume(
    p,
    next,
    "scan-open:pending",
    ledger.policyFor(next.caps, "scan-open:pending"),
    9100,
  );
  expect(() => ledger.inspect(p, resume)).toThrow();
  expect(() => ledger.inspect(p, continuation)).toThrow();
  for (const bad of [
    {
      ...next,
      binding: { ...next.binding, rpc: { url: "https://other.example" } },
    },
    {
      ...next,
      binding: {
        ...next.binding,
        predecessor: { ...next.binding.predecessor, name: ledger.CONTINUATION },
      },
    },
  ])
    expect(() => ledger.inspect(p, bad)).toThrow();
});
test("a first resume that recorded a checkpoint, or a continuation with an attempt record, never admits a successor", () => {
  const a = stoppedResume();
  const n = ledger.consume(
    a.p,
    a.resume,
    "scan-range",
    ledger.policyFor(a.resume.caps, "scan-range"),
    9002,
    { target: 319999 },
  );
  ledger.progress(a.p, a.resume, 319999, "0x" + "e".repeat(64), n);
  expect(() => ledger.inspect(a.p, resume2Of(a.p, a.resume))).toThrow();
  const b = stoppedContinuation(2);
  fs.appendFileSync(
    ledger.ledgerFile(b.p, ledger.CONTINUATION),
    JSON.stringify({
      type: "resume-attempt",
      mode: "first",
      lower: 1,
      upper: 2,
      target: 2,
      at: 1,
    }) + "\n",
  );
  expect(() => ledger.inspect(b.p, resumeOf(b.p, b.continuation))).toThrow();
});
test("the second link refuses any first resume that differs from the bound single attempt", () => {
  const mutations = {
    checkpoint: (s) => {
      const n = ledger.consume(
        s.p,
        s.resume,
        "scan-range",
        ledger.policyFor(s.resume.caps, "scan-range"),
        9100,
        { target: 319999 },
      );
      ledger.progress(s.p, s.resume, 319999, "0x" + "e".repeat(64), n);
    },
    report: (s) =>
      ledger.recordReport(s.p, s.resume, "live-rebuild", "f".repeat(64)),
    send: (s) => ledger.reserve(s.p, s.resume, "transfer", {}),
    "second attempt": (s) =>
      ledger.resumeAttempt(s.p, s.resume, "second", 199999, 299999, 319999),
    "other window target": (s) =>
      ledger.consume(
        s.p,
        s.resume,
        "scan-range",
        ledger.policyFor(s.resume.caps, "scan-range"),
        9100,
        { target: 219999 },
      ),
    "second opener": (s) =>
      ledger.consume(
        s.p,
        s.resume,
        "scan-open:pending",
        ledger.policyFor(s.resume.caps, "scan-open:pending"),
        9100,
      ),
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const s = stoppedResume();
    mutate(s);
    expect(() => ledger.inspect(s.p, resume2Of(s.p, s.resume))).toThrow();
    void name;
  }
  // Changed bytes after binding, and a claim differing from the first resume's.
  const s = stoppedResume();
  const next = resume2Of(s.p, s.resume);
  expect(ledger.inspect(s.p, next).budgets["scan-range"]).toHaveLength(5);
  const file = ledger.ledgerFile(s.p, ledger.RESUME);
  const original = fs.readFileSync(file);
  fs.writeFileSync(file, Buffer.concat([original, Buffer.from(" ")]));
  expect(() => ledger.inspect(s.p, next)).toThrow();
  fs.writeFileSync(file, original);
  expect(() =>
    ledger.inspect(s.p, {
      ...next,
      binding: {
        ...next.binding,
        resumeFrom: { checkpoint: 99999, failedTarget: 299999, evidence: "x" },
      },
    }),
  ).toThrow();
});

function stoppedResume2() {
  const s = stoppedResume();
  const next = resume2Of(s.p, s.resume);
  const policy = ledger.policyFor(next.caps, "scan-range");
  ledger.consume(
    s.p,
    next,
    "scan-open:pending",
    ledger.policyFor(next.caps, "scan-open:pending"),
    9100,
  );
  ledger.resumeAttempt(s.p, next, "first", 199999, 299999, 219999);
  let n = ledger.consume(s.p, next, "scan-range", policy, 9101, {
    target: 219999,
  });
  ledger.progress(s.p, next, 219999, "0x" + "1".repeat(64), n);
  n = ledger.consume(s.p, next, "scan-range", policy, 9102, { target: 239999 });
  ledger.progress(s.p, next, 239999, "0x" + "2".repeat(64), n);
  ledger.consume(s.p, next, "scan-range", policy, 9103, { target: 259999 });
  return { ...s, resume2: next };
}
function resume3Of(p, resume2, overrides = {}) {
  const crypto = require("crypto");
  const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
  return {
    ...resume2,
    name: ledger.RESUME3,
    runnerSha256: "5".repeat(64),
    caps: { ...resume2.caps, scanResumes: 17 },
    binding: {
      ...resume2.binding,
      resumeFrom: {
        checkpoint: 239999,
        checkpointHash: "0x" + "2".repeat(64),
        failedTarget: 259999,
        evidence: "x",
      },
      predecessor: {
        name: ledger.RESUME2,
        ledgerSha256: hash(
          fs.readFileSync(ledger.ledgerFile(p, ledger.RESUME2)),
        ),
        headerSha256: hash(JSON.stringify(resume2)),
        reason: "vault lifetime ended the session",
      },
    },
    ...overrides,
  };
}
test("the third link derives its claim, hash included, from the second link's own records", () => {
  const { p, resume2 } = stoppedResume2();
  const next = resume3Of(p, resume2);
  expect(ledger.inspect(p, next).budgets["scan-open:pending"]).toHaveLength(4);
  for (const resumeFrom of [
    {
      checkpoint: 219999,
      checkpointHash: "0x" + "1".repeat(64),
      failedTarget: 259999,
      evidence: "x",
    },
    {
      checkpoint: 239999,
      checkpointHash: "0x" + "9".repeat(64),
      failedTarget: 259999,
      evidence: "x",
    },
    {
      checkpoint: 239999,
      checkpointHash: "0x" + "2".repeat(64),
      failedTarget: 279999,
      evidence: "x",
    },
  ])
    expect(() =>
      ledger.inspect(p, { ...next, binding: { ...next.binding, resumeFrom } }),
    ).toThrow();
  // A second link holding a send never continues.
  const t = stoppedResume2();
  ledger.reserve(t.p, t.resume2, "transfer", {});
  expect(() => ledger.inspect(t.p, resume3Of(t.p, t.resume2))).toThrow();
});
test("third-link openers are admitted by progress: two sessions without a checkpoint stop, any checkpoint resets", () => {
  const { p, resume2 } = stoppedResume2();
  const next = resume3Of(p, resume2);
  const opener = (at) =>
    ledger.consume(
      p,
      next,
      "scan-open:pending",
      ledger.policyFor(next.caps, "scan-open:pending"),
      at,
    );
  const window = (at, target) =>
    ledger.consume(
      p,
      next,
      "scan-range",
      ledger.policyFor(next.caps, "scan-range"),
      at,
      { target },
    );
  opener(20000);
  opener(20001);
  expect(() => opener(20002)).toThrow();
  const n = window(20003, 259999);
  ledger.progress(p, next, 259999, "0x" + "3".repeat(64), n);
  expect(opener(20004)).toBe(7);
  // The admission window is fixed from the first third-link opener.
  expect(() => opener(20000 + 4 * 3600 * 1000 + 1)).toThrow();
  expect(ledger.resumeDeadline(p, next)).toBe(20000 + 4 * 3600 * 1000);
});

function resolvedResume3() {
  const s = stoppedResume2();
  const r3 = resume3Of(s.p, s.resume2);
  const pol = (kind) => ledger.policyFor(r3.caps, kind);
  ledger.consume(s.p, r3, "scan-open:pending", pol("scan-open:pending"), 30000);
  const n = ledger.consume(s.p, r3, "scan-range", pol("scan-range"), 30001, {
    target: 259999,
  });
  ledger.progress(s.p, r3, 259999, "0x" + "4".repeat(64), n);
  ledger.recordReport(s.p, r3, "live-rebuild", "a".repeat(64));
  const attempt = ledger.reserve(s.p, r3, "transfer", {
    holdIdSha256: "h".repeat(64),
  });
  ledger.finish(s.p, r3, attempt, {
    classification: "acknowledged",
    transactionHash: "0x" + "5".repeat(64),
  });
  ledger.recordReport(s.p, r3, "live-submit", "b".repeat(64));
  ledger.consume(s.p, r3, "observe:transfer", pol("observe:transfer"), 30100);
  ledger.recordReport(s.p, r3, "live-observe", "c".repeat(64));
  ledger.consume(s.p, r3, "txid-page", pol("txid-page"), 30200);
  return { ...s, r3 };
}
function journey2Of(p, r3, overrides = {}) {
  const crypto = require("crypto");
  const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
  const { resumeFrom, ...binding } = r3.binding;
  void resumeFrom;
  return {
    ...r3,
    name: ledger.JOURNEY2,
    runnerSha256: "6".repeat(64),
    binding: {
      ...binding,
      predecessor: {
        name: ledger.RESUME3,
        ledgerSha256: hash(
          fs.readFileSync(ledger.ledgerFile(p, ledger.RESUME3)),
        ),
        headerSha256: hash(JSON.stringify(r3)),
        reason: "poi stage not restart-safe",
      },
    },
    ...overrides,
  };
}
test("the post-send link carries the complete state: one send left, budgets and reports kept", () => {
  const { p, r3 } = resolvedResume3();
  const next = journey2Of(p, r3);
  const state = ledger.inspect(p, next);
  expect(state.sends).toHaveLength(1);
  expect(state.sends[0].finished.outcome.classification).toBe("acknowledged");
  expect(state.reports.map((row) => row.sha256)).toEqual([
    "a".repeat(64),
    "b".repeat(64),
    "c".repeat(64),
  ]);
  expect(state.budgets["observe:transfer"]).toHaveLength(1);
  expect(state.budgets["txid-page"]).toHaveLength(1);
  expect(state.progress.at(-1).to).toBe(259999);
  expect(ledger.predecessorReports(p, next).map((row) => row.mode)).toEqual([
    "live-rebuild",
    "live-submit",
    "live-observe",
  ]);
  // No second transfer; the one remaining send is the unshield; budgets continue.
  expect(() => ledger.reserve(p, next, "transfer", {})).toThrow();
  expect(
    ledger.consume(
      p,
      next,
      "txid-page",
      ledger.policyFor(next.caps, "txid-page"),
      30300,
    ),
  ).toBe(2);
  ledger.poiReserve(p, next, {});
  expect(() => ledger.poiReserve(p, next, {})).toThrow();
  // The predecessor is closed; its bytes stay bound.
  expect(() => ledger.inspect(p, r3)).toThrow();
  const file = ledger.ledgerFile(p, ledger.RESUME3);
  const original = fs.readFileSync(file);
  fs.writeFileSync(file, Buffer.concat([original, Buffer.from(" ")]));
  expect(() => ledger.inspect(p, next)).toThrow();
  fs.writeFileSync(file, original);
  expect(ledger.inspect(p, next).poi.pending).not.toBeNull();
});
test("the post-send link refuses a predecessor with a pending send, a POI record or an unshield, and changed caps", () => {
  const pending = stoppedResume2();
  const r3 = resume3Of(pending.p, pending.resume2);
  ledger.consume(
    pending.p,
    r3,
    "scan-open:pending",
    ledger.policyFor(r3.caps, "scan-open:pending"),
    30000,
  );
  ledger.reserve(pending.p, r3, "transfer", {});
  expect(() => ledger.inspect(pending.p, journey2Of(pending.p, r3))).toThrow();
  const poi = resolvedResume3();
  ledger.poiReserve(poi.p, poi.r3, {});
  expect(() => ledger.inspect(poi.p, journey2Of(poi.p, poi.r3))).toThrow();
  const unshield = resolvedResume3();
  ledger.reserve(unshield.p, unshield.r3, "unshield", {});
  expect(() =>
    ledger.inspect(unshield.p, journey2Of(unshield.p, unshield.r3)),
  ).toThrow();
  const caps = resolvedResume3();
  expect(() =>
    ledger.inspect(
      caps.p,
      journey2Of(caps.p, caps.r3, { caps: { ...caps.r3.caps, txidPages: 91 } }),
    ),
  ).toThrow();
});
test("old-header reports are admitted only as the bound predecessor's exact recorded rows", () => {
  const {
    assertChained,
    scanStart,
  } = require("../tools/qualification/installed-live/live-scenario.cjs");
  const crypto = require("crypto");
  const { p, r3 } = resolvedResume3();
  const next = journey2Of(p, r3);
  const context = { profile: p, header: next };
  const report = (header, digest, mode) =>
    Object.defineProperties(
      {
        ledgerHeaderSha256: crypto
          .createHash("sha256")
          .update(JSON.stringify(header))
          .digest("hex"),
      },
      { reportSha256: { value: digest }, reportMode: { value: mode } },
    );
  expect(() =>
    assertChained(context, report(r3, "c".repeat(64), "live-observe")),
  ).not.toThrow();
  expect(() =>
    assertChained(context, report(next, "z".repeat(64), "live-poi")),
  ).not.toThrow();
  for (const bad of [
    report(r3, "d".repeat(64), "live-observe"),
    report(r3, "c".repeat(64), "live-submit"),
    report({ ...r3, name: "other" }, "c".repeat(64), "live-observe"),
  ])
    expect(() => assertChained(context, bad)).toThrow();
  expect(() =>
    assertChained(
      { profile: p, header: r3 },
      report(next, "c".repeat(64), "live-observe"),
    ),
  ).toThrow();
  // A stage resumes from the last returned checkpoint, within the anchors.
  expect(scanStart(context, 239999, { number: 300000 })).toBe(260000);
  expect(() => scanStart(context, 279999, { number: 300000 })).toThrow();
  expect(() => scanStart(context, 239999, { number: 250000 })).toThrow();
});

// --- The upgrade link (journey-3) -------------------------------------------
function attemptedJourney2() {
  const s = resolvedResume3();
  const j2 = journey2Of(s.p, s.r3);
  const handoff = ledger.poiReserve(s.p, j2, {
    capsuleDigestSha256: "c".repeat(64),
  });
  ledger.poiFinish(s.p, j2, handoff, {
    status: "recovery-required",
    classification: "http-failure",
  });
  ledger.recordReport(s.p, j2, "live-poi", "d".repeat(64));
  ledger.consume(
    s.p,
    j2,
    "poi-status",
    ledger.policyFor(j2.caps, "poi-status"),
    40000,
  );
  ledger.recordReport(s.p, j2, "live-poi-status", "e".repeat(64));
  return { ...s, j2 };
}
function journey3Of(p, j2, overrides = {}) {
  const crypto = require("crypto");
  const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
  const state = ledger.inspect(p, j2);
  const count = (kind) => (state.budgets[kind] ?? []).length;
  const boundary = {
    scanRanges: count("scan-range"),
    txidPages: count("txid-page"),
    scanOpenNew: count("scan-open:new"),
    scanOpenPending: count("scan-open:pending"),
    poiStatus: count("poi-status"),
  };
  const add = ledger.UPGRADE_ADDITIONS;
  const next = {
    ...j2,
    name: ledger.JOURNEY3,
    freedomCommit: "f".repeat(40),
    packageCommit: "e".repeat(40),
    packageTarSha256: "8".repeat(64),
    runnerSha256: "7".repeat(64),
    caps: {
      ...j2.caps,
      scanRanges: boundary.scanRanges + add.scanRanges,
      txidPages: boundary.txidPages + add.txidPages,
      rebuildNew: boundary.scanOpenNew + add.scanOpenNew,
      scanResumes: boundary.scanOpenPending + add.scanOpenPending,
      poiStatus: {
        max: boundary.poiStatus + add.poiStatus,
        ...ledger.UPGRADE_STATUS,
        phaseFrom: boundary.poiStatus,
      },
      poiRetries: 1,
    },
  };
  const identity = (v) => ({
    freedomCommit: v.freedomCommit,
    packageCommit: v.packageCommit,
    packageTarSha256: v.packageTarSha256,
    runnerSha256: v.runnerSha256,
  });
  next.binding = {
    ...j2.binding,
    predecessor: {
      name: ledger.JOURNEY2,
      ledgerSha256: hash(
        fs.readFileSync(ledger.ledgerFile(p, ledger.JOURNEY2)),
      ),
      headerSha256: hash(JSON.stringify(j2)),
      reason: "package upgrade for one explicit POI retry",
    },
    upgrade: {
      from: identity(j2),
      to: identity(next),
      reason: "one explicit POI retry",
    },
    phase: { boundary, additions: { ...add } },
  };
  return { ...next, ...overrides };
}
test("the upgrade link carries the complete state and adds exactly the phase allowances", () => {
  const { p, j2 } = attemptedJourney2();
  const j3 = journey3Of(p, j2);
  const state = ledger.inspect(p, j3);
  expect(state.sends).toHaveLength(1);
  expect(state.poi.pending).not.toBeNull();
  expect(state.poi.finished).not.toBeNull();
  expect(state.reports.map((row) => row.mode)).toEqual([
    "live-rebuild",
    "live-submit",
    "live-observe",
    "live-poi",
    "live-poi-status",
  ]);
  expect(state.phase).toBeNull();
  expect(j3.caps.scanRanges).toBe(j3.binding.phase.boundary.scanRanges + 400);
  expect(j3.caps.txidPages).toBe(j3.binding.phase.boundary.txidPages + 60);
  expect(j3.caps.poiStatus.max).toBe(j3.binding.phase.boundary.poiStatus + 4);
  // The transfer and the first handoff stay consumed.
  expect(() => ledger.reserve(p, j3, "transfer", {})).toThrow();
  expect(() => ledger.poiReserve(p, j3, {})).toThrow();
  // Old reports are admitted only with their own producer header.
  const rows = ledger.predecessorReports(p, j3);
  const crypto = require("crypto");
  const j2Header = crypto
    .createHash("sha256")
    .update(JSON.stringify(j2))
    .digest("hex");
  expect(rows.find((row) => row.mode === "live-poi").headerSha256).toBe(
    j2Header,
  );
  expect(rows.find((row) => row.mode === "live-rebuild").headerSha256).not.toBe(
    j2Header,
  );
});
test.each([
  [
    "a boundary that omits a used range",
    (j3) => ({
      binding: {
        ...j3.binding,
        phase: {
          ...j3.binding.phase,
          boundary: {
            ...j3.binding.phase.boundary,
            scanRanges: j3.binding.phase.boundary.scanRanges - 1,
          },
        },
      },
    }),
  ],
  [
    "one more range than the phase allows",
    (j3) => ({ caps: { ...j3.caps, scanRanges: j3.caps.scanRanges + 1 } }),
  ],
  [
    "old unused capacity added again",
    (j3) => ({ caps: { ...j3.caps, txidPages: j3.caps.txidPages + 38 } }),
  ],
  [
    "twelve pending openers",
    (j3) => ({ caps: { ...j3.caps, scanResumes: j3.caps.scanResumes + 1 } }),
  ],
  [
    "a status window from the chain origin",
    (j3) => ({
      caps: { ...j3.caps, poiStatus: { ...j3.caps.poiStatus, phaseFrom: 0 } },
    }),
  ],
  ["two retries", (j3) => ({ caps: { ...j3.caps, poiRetries: 2 } })],
  [
    "a changed fee cap",
    (j3) => ({ caps: { ...j3.caps, perSendMaxGasFeeWei: "3000000000000000" } }),
  ],
  [
    "an upgrade from another identity",
    (j3) => ({
      binding: {
        ...j3.binding,
        upgrade: {
          ...j3.binding.upgrade,
          from: { ...j3.binding.upgrade.from, runnerSha256: "0".repeat(64) },
        },
      },
    }),
  ],
  [
    "an upgrade to another identity",
    (j3) => ({
      binding: {
        ...j3.binding,
        upgrade: {
          ...j3.binding.upgrade,
          to: { ...j3.binding.upgrade.to, packageTarSha256: "0".repeat(64) },
        },
      },
    }),
  ],
  ["a changed profile", () => ({ profile: "/elsewhere" })],
])("the upgrade link refuses %s", (_name, change) => {
  const { p, j2 } = attemptedJourney2();
  const j3 = journey3Of(p, j2);
  expect(() => ledger.inspect(p, { ...j3, ...change(j3) })).toThrow();
});
test("the upgrade link refuses a predecessor without the consumed first handoff or with an unshield", () => {
  const s = resolvedResume3();
  const j2 = journey2Of(s.p, s.r3);
  expect(() => ledger.inspect(s.p, journey3Of(s.p, j2))).toThrow();
  const t = attemptedJourney2();
  ledger.reserve(t.p, t.j2, "unshield", {});
  expect(() => ledger.inspect(t.p, journey3Of(t.p, t.j2))).toThrow();
});
test("the new generation starts once and orders its own progress below the carried head", () => {
  const { p, j2 } = attemptedJourney2();
  const j3 = journey3Of(p, j2);
  const range = ledger.policyFor(j3.caps, "scan-range");
  expect(() =>
    ledger.consume(p, j3, "scan-range", range, 50000, { target: 99999 }),
  ).toThrow();
  expect(() =>
    ledger.consume(
      p,
      j3,
      "scan-open:new",
      ledger.policyFor(j3.caps, "scan-open:new"),
      50000,
    ),
  ).toThrow();
  const carried = ledger.inspect(p, j3).progress.length;
  const phase = ledger.startPhase(p, j3);
  expect(phase.progressFrom).toBe(carried);
  expect(() => ledger.startPhase(p, j3)).toThrow();
  ledger.consume(
    p,
    j3,
    "scan-open:new",
    ledger.policyFor(j3.caps, "scan-open:new"),
    50001,
  );
  let n = ledger.consume(p, j3, "scan-range", range, 50002, { target: 99999 });
  // Below journey-2's carried head (259999): the new generation's own first checkpoint.
  ledger.progress(p, j3, 99999, "0x" + "6".repeat(64), n);
  n = ledger.consume(p, j3, "scan-range", range, 50003, { target: 99999 });
  expect(() =>
    ledger.progress(p, j3, 99999, "0x" + "6".repeat(64), n),
  ).toThrow();
  const state = ledger.inspect(p, j3);
  expect(state.progress.at(-1).to).toBe(99999);
  expect(state.progress.slice(0, state.phase.progressFrom).at(-1).to).toBe(
    259999,
  );
  expect(() =>
    ledger.consume(
      p,
      j3,
      "scan-open:new",
      ledger.policyFor(j3.caps, "scan-open:new"),
      50004,
    ),
  ).toThrow();
});
test("upgrade openers need progress and stay inside eight hours from the first", () => {
  const { p, j2 } = attemptedJourney2();
  const j3 = journey3Of(p, j2);
  ledger.startPhase(p, j3);
  const pending = ledger.policyFor(j3.caps, "scan-open:pending");
  ledger.consume(
    p,
    j3,
    "scan-open:new",
    ledger.policyFor(j3.caps, "scan-open:new"),
    60000,
  );
  ledger.consume(p, j3, "scan-open:pending", pending, 60001);
  expect(() =>
    ledger.consume(p, j3, "scan-open:pending", pending, 60002),
  ).toThrow();
  const n = ledger.consume(
    p,
    j3,
    "scan-range",
    ledger.policyFor(j3.caps, "scan-range"),
    60003,
    { target: 99999 },
  );
  ledger.progress(p, j3, 99999, "0x" + "6".repeat(64), n);
  expect(() =>
    ledger.consume(
      p,
      j3,
      "scan-open:pending",
      pending,
      60000 + 8 * 3600 * 1000 + 1,
    ),
  ).toThrow();
  ledger.consume(p, j3, "scan-open:pending", pending, 60004);
  expect(ledger.upgradeDeadline(p, j3)).toBe(60000 + 8 * 3600 * 1000);
});
test("phase status reads: four more, ten minutes apart, inside 24 hours from the first phase read", () => {
  const { p, j2 } = attemptedJourney2();
  const j3 = journey3Of(p, j2);
  const status = ledger.policyFor(j3.caps, "poi-status");
  const t0 = 2 * 24 * 3600 * 1000;
  // Long after the chain's own 24-hour window: the phase window starts here.
  ledger.consume(p, j3, "poi-status", status, t0);
  expect(() =>
    ledger.consume(p, j3, "poi-status", status, t0 + 599999),
  ).toThrow();
  ledger.consume(p, j3, "poi-status", status, t0 + 600000);
  expect(() =>
    ledger.consume(p, j3, "poi-status", status, t0 + 24 * 3600 * 1000 + 1),
  ).toThrow();
  ledger.consume(p, j3, "poi-status", status, t0 + 1200000);
  ledger.consume(p, j3, "poi-status", status, t0 + 1800000);
  expect(() =>
    ledger.consume(p, j3, "poi-status", status, t0 + 2400000),
  ).toThrow();
});
test("the explicit retry is reserved once, after the consumed first handoff", () => {
  const { p, j2 } = attemptedJourney2();
  const j3 = journey3Of(p, j2);
  const retryId = ledger.poiRetryReserve(p, j3, {
    holdIdSha256: "a".repeat(64),
  });
  expect(() => ledger.poiRetryReserve(p, j3, {})).toThrow();
  expect(() => ledger.poiRetryFinish(p, j3, "0".repeat(32), {})).toThrow();
  const retry = ledger.poiRetryFinish(p, j3, retryId, {
    status: "recovery-required",
  });
  expect(retry.finished.retryId).toBe(retryId);
  expect(() => ledger.poiRetryReserve(p, j3, {})).toThrow();
  // Not on the post-send link.
  const other = attemptedJourney2();
  expect(() => ledger.poiRetryReserve(other.p, other.j2, {})).toThrow();
});

// --- The circuit link (journey-4) -------------------------------------------
// A journey-3 that rebuilt, read one status and spent its retry.
function retriedJourney3({ finishRetry = true } = {}) {
  const s = attemptedJourney2();
  const j3 = journey3Of(s.p, s.j2);
  ledger.startPhase(s.p, j3);
  ledger.consume(
    s.p,
    j3,
    "scan-open:new",
    ledger.policyFor(j3.caps, "scan-open:new"),
    50001,
  );
  const n = ledger.consume(
    s.p,
    j3,
    "scan-range",
    ledger.policyFor(j3.caps, "scan-range"),
    50002,
    { target: 99999 },
  );
  ledger.progress(s.p, j3, 99999, "0x" + "6".repeat(64), n);
  ledger.consume(
    s.p,
    j3,
    "txid-page",
    ledger.policyFor(j3.caps, "txid-page"),
    50003,
  );
  ledger.recordReport(s.p, j3, "live-upgrade-rebuild", "9".repeat(64));
  ledger.consume(
    s.p,
    j3,
    "poi-status",
    ledger.policyFor(j3.caps, "poi-status"),
    2 * 24 * 3600 * 1000,
  );
  const retryId = ledger.poiRetryReserve(s.p, j3, {
    holdIdSha256: "a".repeat(64),
  });
  if (finishRetry) {
    ledger.poiRetryFinish(s.p, j3, retryId, {
      status: "recovery-required",
      classification: "http-failure",
    });
    ledger.recordReport(s.p, j3, "live-poi-retry", "8".repeat(64));
  }
  return { ...s, j3 };
}
function journey4Of(p, j3, overrides = {}) {
  const crypto = require("crypto");
  const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
  const state = ledger.inspect(p, j3);
  const count = (kind) => (state.budgets[kind] ?? []).length;
  const boundary = {
    scanRanges: count("scan-range"),
    txidPages: count("txid-page"),
    scanOpenNew: count("scan-open:new"),
    scanOpenPending: count("scan-open:pending"),
    poiStatus: count("poi-status"),
  };
  const add = ledger.REPROOF_ADDITIONS;
  const next = {
    ...j3,
    name: ledger.JOURNEY4,
    freedomCommit: "4".repeat(40),
    packageCommit: "3".repeat(40),
    packageTarSha256: "2".repeat(64),
    runnerSha256: "1".repeat(64),
    caps: {
      ...j3.caps,
      scanRanges: boundary.scanRanges + add.scanRanges,
      txidPages: boundary.txidPages + add.txidPages,
      rebuildNew: boundary.scanOpenNew + add.scanOpenNew,
      scanResumes: boundary.scanOpenPending + add.scanOpenPending,
      poiStatus: {
        max: boundary.poiStatus + add.poiStatus,
        ...ledger.UPGRADE_STATUS,
        phaseFrom: boundary.poiStatus,
      },
      poiRetries: 1,
      poiReproofs: 1,
    },
  };
  const identity = (v) => ({
    freedomCommit: v.freedomCommit,
    packageCommit: v.packageCommit,
    packageTarSha256: v.packageTarSha256,
    runnerSha256: v.runnerSha256,
  });
  next.binding = {
    ...j3.binding,
    predecessor: {
      name: ledger.JOURNEY3,
      ledgerSha256: hash(
        fs.readFileSync(ledger.ledgerFile(p, ledger.JOURNEY3)),
      ),
      headerSha256: hash(JSON.stringify(j3)),
      reason: "POI circuit rotation: one replacement proof",
    },
    upgrade: {
      from: identity(j3),
      to: identity(next),
      reason: "POI circuit rotation",
      artifacts: {
        from: { POI_3x3: { ...ledger.RETIRED_POI_3X3 } },
        to: { POI_3x3: { ...ledger.CURRENT_POI_3X3 } },
      },
    },
    phase: { boundary, additions: { ...add } },
  };
  return { ...next, ...overrides };
}
test("the circuit link carries the complete state, the consumed retry included, and adds exactly its phase allowances", () => {
  const { p, j3 } = retriedJourney3();
  const j4 = journey4Of(p, j3);
  const state = ledger.inspect(p, j4);
  expect(state.sends).toHaveLength(1);
  expect(state.poi.pending).not.toBeNull();
  expect(state.poi.finished).not.toBeNull();
  expect(state.retry.pending).not.toBeNull();
  expect(state.retry.finished).not.toBeNull();
  expect(state.reproof).toEqual({ pending: null, finished: null });
  expect(state.phase).toBeNull();
  expect(state.reports.map((row) => row.mode)).toEqual([
    "live-rebuild",
    "live-submit",
    "live-observe",
    "live-poi",
    "live-poi-status",
    "live-upgrade-rebuild",
    "live-poi-retry",
  ]);
  const { boundary } = j4.binding.phase;
  expect(boundary).toEqual({
    scanRanges: ledger.inspect(p, j3).budgets["scan-range"].length,
    txidPages: ledger.inspect(p, j3).budgets["txid-page"].length,
    scanOpenNew: 2,
    scanOpenPending: ledger.inspect(p, j3).budgets["scan-open:pending"]
      .length,
    poiStatus: 2,
  });
  expect(j4.caps.scanRanges).toBe(boundary.scanRanges + 400);
  expect(j4.caps.txidPages).toBe(boundary.txidPages + 60);
  expect(j4.caps.rebuildNew).toBe(3);
  expect(j4.caps.scanResumes).toBe(boundary.scanOpenPending + 11);
  expect(j4.caps.poiStatus).toEqual({
    max: 6,
    minSpacingMs: 600000,
    windowMs: 86400000,
    phaseFrom: 2,
  });
  // Everything consumed stays consumed: the transfer, the first handoff, the retry.
  expect(() => ledger.reserve(p, j4, "transfer", {})).toThrow();
  expect(() => ledger.poiReserve(p, j4, {})).toThrow();
  expect(() => ledger.poiRetryReserve(p, j4, {})).toThrow();
  // Old reports are admitted only with their own producer header.
  const crypto = require("crypto");
  const digest = (v) =>
    crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const rows = ledger.predecessorReports(p, j4);
  expect(rows.find((row) => row.mode === "live-poi-retry").headerSha256).toBe(
    digest(j3),
  );
  expect(rows.find((row) => row.mode === "live-poi").headerSha256).not.toBe(
    digest(j3),
  );
  expect(rows.map((row) => row.mode)).toContain("live-rebuild");
});
test.each([
  [
    "a boundary that omits a used range",
    (j4) => ({
      binding: {
        ...j4.binding,
        phase: {
          ...j4.binding.phase,
          boundary: {
            ...j4.binding.phase.boundary,
            scanRanges: j4.binding.phase.boundary.scanRanges - 1,
          },
        },
      },
    }),
  ],
  [
    "one more range than the phase allows",
    (j4) => ({ caps: { ...j4.caps, scanRanges: j4.caps.scanRanges + 1 } }),
  ],
  [
    "a status read more than the phase allows",
    (j4) => ({
      caps: {
        ...j4.caps,
        poiStatus: { ...j4.caps.poiStatus, max: j4.caps.poiStatus.max + 1 },
      },
    }),
  ],
  [
    "a status window from the journey-3 phase",
    (j4) => ({
      caps: { ...j4.caps, poiStatus: { ...j4.caps.poiStatus, phaseFrom: 1 } },
    }),
  ],
  ["a replenished retry", (j4) => ({ caps: { ...j4.caps, poiRetries: 2 } })],
  [
    "a dropped retry cap",
    (j4) => {
      const { poiRetries, ...caps } = j4.caps;
      void poiRetries;
      return { caps };
    },
  ],
  ["two replacements", (j4) => ({ caps: { ...j4.caps, poiReproofs: 2 } })],
  [
    "no replacement allowance",
    (j4) => {
      const { poiReproofs, ...caps } = j4.caps;
      void poiReproofs;
      return { caps };
    },
  ],
  [
    "a changed fee cap",
    (j4) => ({ caps: { ...j4.caps, totalMaxFeeWei: "5000000000000000" } }),
  ],
  [
    "a third send",
    (j4) => ({ caps: { ...j4.caps, sends: 3 } }),
  ],
  [
    "an upgrade from another identity",
    (j4) => ({
      binding: {
        ...j4.binding,
        upgrade: {
          ...j4.binding.upgrade,
          from: { ...j4.binding.upgrade.from, packageCommit: "0".repeat(40) },
        },
      },
    }),
  ],
  [
    "an upgrade to another identity",
    (j4) => ({
      binding: {
        ...j4.binding,
        upgrade: {
          ...j4.binding.upgrade,
          to: { ...j4.binding.upgrade.to, runnerSha256: "0".repeat(64) },
        },
      },
    }),
  ],
  [
    "no artifact move",
    (j4) => {
      const { artifacts, ...upgrade } = j4.binding.upgrade;
      void artifacts;
      return { binding: { ...j4.binding, upgrade } };
    },
  ],
  [
    "a move to the retired circuit",
    (j4) => ({
      binding: {
        ...j4.binding,
        upgrade: {
          ...j4.binding.upgrade,
          artifacts: {
            from: { POI_3x3: { ...ledger.RETIRED_POI_3X3 } },
            to: { POI_3x3: { ...ledger.RETIRED_POI_3X3 } },
          },
        },
      },
    }),
  ],
  [
    "another current key",
    (j4) => ({
      binding: {
        ...j4.binding,
        upgrade: {
          ...j4.binding.upgrade,
          artifacts: {
            ...j4.binding.upgrade.artifacts,
            to: {
              POI_3x3: {
                ...ledger.CURRENT_POI_3X3,
                vkey: { bytes: 4206, sha256: "0".repeat(64) },
              },
            },
          },
        },
      },
    }),
  ],
  ["a changed profile", () => ({ profile: "/elsewhere" })],
])("the circuit link refuses %s", (_name, change) => {
  const { p, j3 } = retriedJourney3();
  const j4 = journey4Of(p, j3);
  expect(() => ledger.inspect(p, { ...j4, ...change(j4) })).toThrow();
});
test("the circuit link admits artifact identities in any key order", () => {
  const { p, j3 } = retriedJourney3();
  const j4 = journey4Of(p, j3);
  const reorder = (pins) =>
    Object.fromEntries(
      ["vkey", "wasm", "zkey"].map((kind) => [
        kind,
        { sha256: pins[kind].sha256, bytes: pins[kind].bytes },
      ]),
    );
  const changed = {
    ...j4,
    binding: {
      ...j4.binding,
      upgrade: {
        ...j4.binding.upgrade,
        artifacts: {
          to: { POI_3x3: reorder(ledger.CURRENT_POI_3X3) },
          from: { POI_3x3: reorder(ledger.RETIRED_POI_3X3) },
        },
      },
    },
  };
  expect(ledger.inspect(p, changed).retry.finished).not.toBeNull();
});
test("the circuit link refuses a journey-3 without a consumed and finished retry, or with an unshield", () => {
  const plain = attemptedJourney2();
  const j3 = journey3Of(plain.p, plain.j2);
  ledger.startPhase(plain.p, j3);
  expect(() => ledger.inspect(plain.p, journey4Of(plain.p, j3))).toThrow();
  const open = retriedJourney3({ finishRetry: false });
  expect(() => ledger.inspect(open.p, journey4Of(open.p, open.j3))).toThrow();
  const sent = retriedJourney3();
  ledger.reserve(sent.p, sent.j3, "unshield", {});
  expect(() => ledger.inspect(sent.p, journey4Of(sent.p, sent.j3))).toThrow();
  // Exactly the bound journey-3 bytes: a later journey-3 record refuses.
  const later = retriedJourney3();
  const bound = journey4Of(later.p, later.j3);
  ledger.inspect(later.p, bound);
  ledger.recordReport(later.p, later.j3, "live-poi-status", "7".repeat(64));
  expect(() => ledger.inspect(later.p, bound)).toThrow();
  // Only journey-3 can precede it.
  const skipped = retriedJourney3();
  const j4 = journey4Of(skipped.p, skipped.j3);
  expect(() =>
    ledger.inspect(skipped.p, {
      ...j4,
      binding: {
        ...j4.binding,
        predecessor: { ...j4.binding.predecessor, name: ledger.JOURNEY2 },
      },
    }),
  ).toThrow();
});
test("the circuit generation starts once, below the carried heads, with its own openers and window", () => {
  const { p, j3 } = retriedJourney3();
  const j4 = journey4Of(p, j3);
  const range = ledger.policyFor(j4.caps, "scan-range");
  const opener = ledger.policyFor(j4.caps, "scan-open:new");
  const pending = ledger.policyFor(j4.caps, "scan-open:pending");
  expect(() =>
    ledger.consume(p, j4, "scan-range", range, 70000, { target: 99999 }),
  ).toThrow();
  expect(() => ledger.consume(p, j4, "scan-open:new", opener, 70000)).toThrow();
  expect(() =>
    ledger.consume(
      p,
      j4,
      "txid-page",
      ledger.policyFor(j4.caps, "txid-page"),
      70000,
    ),
  ).toThrow();
  const carried = ledger.inspect(p, j4).progress.length;
  expect(ledger.startPhase(p, j4).progressFrom).toBe(carried);
  expect(() => ledger.startPhase(p, j4)).toThrow();
  ledger.consume(p, j4, "scan-open:new", opener, 70001);
  // Journey-3's own generation's head was 99999: the new one restarts below it.
  const n = ledger.consume(p, j4, "scan-range", range, 70002, {
    target: 49999,
  });
  ledger.progress(p, j4, 49999, "0x" + "7".repeat(64), n);
  // Two sessions without a checkpoint, then a stop.
  ledger.consume(p, j4, "scan-open:pending", pending, 70003);
  ledger.consume(p, j4, "scan-open:pending", pending, 70004);
  expect(() =>
    ledger.consume(p, j4, "scan-open:pending", pending, 70005),
  ).toThrow();
  // The chain's fourth new opener: none is left.
  expect(() => ledger.consume(p, j4, "scan-open:new", opener, 70005)).toThrow();
  const m = ledger.consume(p, j4, "scan-range", range, 70006, {
    target: 99999,
  });
  ledger.progress(p, j4, 99999, "0x" + "8".repeat(64), m);
  expect(() =>
    ledger.consume(
      p,
      j4,
      "scan-open:pending",
      pending,
      70001 + 8 * 3600 * 1000 + 1,
    ),
  ).toThrow();
  ledger.consume(p, j4, "scan-open:pending", pending, 70007);
  expect(ledger.upgradeDeadline(p, j4)).toBe(70001 + 8 * 3600 * 1000);
  const state = ledger.inspect(p, j4);
  expect(state.progress.slice(state.phase.progressFrom).map((r) => r.to)).toEqual(
    [49999, 99999],
  );
});
test("circuit status reads: four more, ten minutes apart, inside 24 hours from the circuit phase's first read", () => {
  const { p, j3 } = retriedJourney3();
  const j4 = journey4Of(p, j3);
  const status = ledger.policyFor(j4.caps, "poi-status");
  // Long after journey-3's own phase window: this phase's window starts here.
  const t0 = 5 * 24 * 3600 * 1000;
  ledger.consume(p, j4, "poi-status", status, t0);
  expect(() =>
    ledger.consume(p, j4, "poi-status", status, t0 + 599999),
  ).toThrow();
  ledger.consume(p, j4, "poi-status", status, t0 + 600000);
  expect(() =>
    ledger.consume(p, j4, "poi-status", status, t0 + 24 * 3600 * 1000 + 1),
  ).toThrow();
  ledger.consume(p, j4, "poi-status", status, t0 + 1200000);
  ledger.consume(p, j4, "poi-status", status, t0 + 1800000);
  expect(() =>
    ledger.consume(p, j4, "poi-status", status, t0 + 2400000),
  ).toThrow();
});
test("the replacement handoff is reserved once on the circuit link, consumed even without a finish", () => {
  const { p, j3 } = retriedJourney3();
  const j4 = journey4Of(p, j3);
  const reproofId = ledger.poiReproofReserve(p, j4, {
    holdIdSha256: "a".repeat(64),
  });
  // A crash here leaves it consumed: no second reservation.
  expect(ledger.inspect(p, j4).reproof.pending.reproofId).toBe(reproofId);
  expect(() => ledger.poiReproofReserve(p, j4, {})).toThrow();
  expect(() => ledger.poiReproofFinish(p, j4, "0".repeat(32), {})).toThrow();
  const reproof = ledger.poiReproofFinish(p, j4, reproofId, {
    status: "recovery-required",
  });
  expect(reproof.finished.reproofId).toBe(reproofId);
  expect(() => ledger.poiReproofFinish(p, j4, reproofId, {})).toThrow();
  expect(() => ledger.poiReproofReserve(p, j4, {})).toThrow();
  expect(() => ledger.poiRetryReserve(p, j4, {})).toThrow();
  // Never on the upgrade link.
  const other = retriedJourney3();
  expect(() => ledger.poiReproofReserve(other.p, other.j3, {})).toThrow();
});
test("hand-written replacement records refuse on replay", () => {
  const { p, j3 } = retriedJourney3();
  const j4 = journey4Of(p, j3);
  ledger.poiReproofReserve(p, j4, {});
  const file = ledger.ledgerFile(p, ledger.JOURNEY4);
  const bytes = fs.readFileSync(file);
  fs.appendFileSync(
    file,
    JSON.stringify({
      type: "poi-reproof-pending",
      reproofId: "b".repeat(32),
      reservedAt: "x",
      binding: {},
    }) + "\n",
  );
  expect(() => ledger.inspect(p, j4)).toThrow();
  fs.writeFileSync(file, bytes);
  fs.appendFileSync(
    file,
    JSON.stringify({
      type: "poi-retry-pending",
      retryId: "c".repeat(32),
      reservedAt: "x",
      binding: {},
    }) + "\n",
  );
  expect(() => ledger.inspect(p, j4)).toThrow();
  fs.writeFileSync(file, bytes);
  expect(ledger.inspect(p, j4).reproof.pending).not.toBeNull();
});

// --- The replacement mode over a mocked facade -------------------------------
function circuitContext(outcomes = {}) {
  const crypto = require("crypto");
  const sha = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
  const { p, j3 } = retriedJourney3();
  const j4 = journey4Of(p, j3);
  ledger.startPhase(p, j4);
  ledger.consume(
    p,
    j4,
    "scan-open:new",
    ledger.policyFor(j4.caps, "scan-open:new"),
    Date.now(),
  );
  const n = ledger.consume(
    p,
    j4,
    "scan-range",
    ledger.policyFor(j4.caps, "scan-range"),
    Date.now(),
    { target: 99999 },
  );
  ledger.progress(p, j4, 99999, "0x" + "6".repeat(64), n);
  const holdId = "hold-1";
  const noteId = "0:7";
  const calls = [];
  let open = 0;
  const closable = (value) => {
    open++;
    let closed;
    return {
      ...value,
      close: () => {
        if (!closed) open--;
        closed = true;
      },
      closed: Promise.resolve(),
    };
  };
  const session = closable({
    advancePublic: async (range) => ({
      to: { number: range.to, hash: "0x" + "5".repeat(64) },
      status: "applied",
    }),
    synchronizeTxid: async () => ({
      count: 10,
      serviceLatestIndex: 9,
      capacityReached: false,
    }),
    openRead: async () =>
      closable({
        notes: async () => [
          {
            id: noteId,
            txid: "0x" + "a".repeat(64),
            spentTxid: false,
            amount: 997500000000000n,
          },
        ],
      }),
    openRecovery: async () =>
      closable({
        history: async () => ({
          records: [{ holdId, kind: "railgun-private-transfer" }],
          nextAfter: null,
        }),
      }),
    openPoiRecovery: async () =>
      closable({
        reproveRetiredShield: async (id) => {
          calls.push(["reprove", id, open]);
          return (
            outcomes.prepared ?? {
              status: "reproof-prepared",
              capsuleDigest: "c".repeat(64),
              payloadSha256: "d".repeat(64),
              reproofRevision: 1,
              circuit: { from: "2f4dcbf5", to: "b7ca7ba0" },
            }
          );
        },
        submitReproof: async (id) => {
          calls.push(["submit", id, open]);
          return (
            outcomes.submitted ?? {
              status: "recovery-required",
              stage: "response",
              response: { classification: "accepted", diagnostic: null },
            }
          );
        },
      }),
    observeOwnedPoi: async ({ noteId: id }) => {
      // An owned read admits no open lane.
      calls.push(["status", id, open]);
      if (outcomes.status instanceof Error) throw outcomes.status;
      return (
        outcomes.status ?? {
          statuses: ["Missing"],
          allValid: false,
          inputType: "Transact",
        }
      );
    },
  });
  const context = {
    facade: { openAccount: async () => session },
    signal: new AbortController().signal,
    milestone: (value) => calls.push(["milestone", value]),
    owner: "0x" + "1".repeat(40),
    readFinalized: async () => ({ number: 99999, hash: "0x" + "4".repeat(64) }),
    previous: {
      schema: "railgun-installed-live-reproof-rebuild-v1",
      ledgerHeaderSha256: sha(JSON.stringify(j4)),
      holdIdSha256: sha(holdId),
      transactionHash: "0x" + "a".repeat(64),
      outputNoteIdSha256: sha(noteId),
      outputAmount: "997500000000000",
      inputAmount: "997500000000000",
      anchor: { number: 99999 },
    },
    params: outcomes.params ?? {},
    synthetic: true,
    mode: "live-poi-reproof",
    vault: { unlockedAt: performance.now(), lifetimeMs: 15 * 60 * 1000 },
    crash: () => {
      throw Object.assign(Error("crashed"), { code: "TEST_CRASH" });
    },
    profile: p,
    header: j4,
  };
  return { context, calls, p, j4, j3 };
}
const reproofMode = () =>
  require("../tools/qualification/installed-live/live-scenario.cjs").MODES[
    "live-poi-reproof"
  ];
test("the replacement mode prepares first, then one fresh Missing read with no lane open, then reserves and hands off once", async () => {
  const { context, calls, p, j4 } = circuitContext();
  const statusBefore = ledger.inspect(p, j4).budgets["poi-status"].length;
  const report = await reproofMode()(context);
  const order = calls.filter(([kind]) => kind !== "milestone");
  expect(order.map(([kind]) => kind)).toEqual(["reprove", "status", "submit"]);
  expect(order[1][2]).toBe(1); // only the session is open during the read
  const milestones = calls
    .filter(([kind]) => kind === "milestone")
    .map(([, value]) => value.split(":")[0]);
  expect(milestones.indexOf("ledger-reserved")).toBeLessThan(
    milestones.indexOf("poi-reproof-submitted"),
  );
  const state = ledger.inspect(p, j4);
  expect(state.budgets["poi-status"]).toHaveLength(statusBefore + 1);
  expect(state.reproof.pending.binding).toMatchObject({
    replacementPayloadSha256: "d".repeat(64),
    retryId: state.retry.pending.retryId,
  });
  expect(state.reproof.finished.outcome).toEqual({
    status: "recovery-required",
    stage: "response",
    classification: "accepted",
    diagnostic: null,
    code: null,
  });
  expect(report).toMatchObject({
    schema: "railgun-installed-live-poi-reproof-v1",
    skipped: false,
    continuable: false,
    stop: false,
    prepared: { status: "reproof-prepared", reproofRevision: 1 },
  });
  expect(JSON.stringify(report)).not.toContain("c".repeat(64));
  // Consumed: a second run refuses before opening anything.
  const again = circuitContext();
  again.context.profile = p;
  again.context.header = j4;
  again.context.previous = context.previous;
  await expect(reproofMode()(again.context)).rejects.toThrow(
    /replacement is consumed/,
  );
  expect(again.calls).toEqual([]);
});
test("a refused preparation spends no status read and no handoff", async () => {
  const { context, calls, p, j4 } = circuitContext({
    prepared: { status: "refused", stage: "eligibility" },
  });
  const statusBefore = ledger.inspect(p, j4).budgets["poi-status"].length;
  const report = await reproofMode()(context);
  expect(calls.filter(([k]) => k !== "milestone").map(([k]) => k)).toEqual([
    "reprove",
  ]);
  const state = ledger.inspect(p, j4);
  expect(state.budgets["poi-status"]).toHaveLength(statusBefore);
  expect(state.reproof).toEqual({ pending: null, finished: null });
  expect(report).toMatchObject({
    prepared: { status: "refused", stage: "eligibility" },
    reproof: null,
    continuable: false,
    stop: true,
  });
});
test.each([
  [
    "an already valid output",
    { statuses: ["Valid"], allValid: true, inputType: "Transact" },
    { skipped: true, continuable: true, stop: false },
  ],
  [
    "a failed read",
    Object.assign(Error("x"), { code: "RAILGUN_POI_FACADE_REFUSED" }),
    { skipped: true, continuable: false, stop: true },
  ],
  [
    "a shield-typed status",
    { statuses: ["Missing"], allValid: false, inputType: "Shield" },
    { skipped: true, continuable: false, stop: true },
  ],
])("%s skips the handoff with nothing reserved", async (_name, status, expected) => {
  const { context, calls, p, j4 } = circuitContext({ status });
  const report = await reproofMode()(context);
  expect(calls.some(([k]) => k === "submit")).toBe(false);
  expect(ledger.inspect(p, j4).reproof.pending).toBeNull();
  expect(report).toMatchObject({ ...expected, reproof: null });
});
test("a crash right after the reservation leaves the replacement consumed", async () => {
  const { context, calls, p, j4 } = circuitContext({
    params: { fault: "exit-after-poi-reproof-reserve" },
  });
  await expect(reproofMode()(context)).rejects.toThrow("crashed");
  expect(calls.some(([k]) => k === "submit")).toBe(false);
  const state = ledger.inspect(p, j4);
  expect(state.reproof.pending).not.toBeNull();
  expect(state.reproof.finished).toBeNull();
  expect(() => ledger.poiReproofReserve(p, j4, {})).toThrow();
});
test("the replacement and circuit rebuild modes run on the circuit link only", async () => {
  const { MODES } = require("../tools/qualification/installed-live/live-scenario.cjs");
  const { context, j3 } = circuitContext();
  await expect(
    MODES["live-poi-reproof"]({ ...context, header: j3 }),
  ).rejects.toThrow(/circuit link only/);
  await expect(
    MODES["live-reproof-rebuild"]({ ...context, header: j3 }),
  ).rejects.toThrow(/circuit link only/);
  // The circuit rebuild follows the consumed retry's own report only.
  await expect(
    MODES["live-reproof-rebuild"]({
      ...context,
      previous: { ...context.previous, schema: "railgun-installed-live-observe-v1" },
    }),
  ).rejects.toThrow();
});
