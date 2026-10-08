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
  expect(() => ledger.consume(p, header, "observe:transfer", policy, 10500)).toThrow(/spacing/);
  expect(ledger.consume(p, header, "observe:transfer", policy, 11000)).toBe(2);
  expect(() => ledger.consume(p, header, "observe:transfer", policy, 13000)).toThrow(/exhausted/);
  const window = { max: 5, minSpacingMs: 0, windowMs: 5000 };
  ledger.consume(p, header, "poi-status", window, 1000);
  expect(() => ledger.consume(p, header, "poi-status", window, 7001)).toThrow(/window/);
  expect(ledger.inspect(p, header).budgets["observe:transfer"]).toHaveLength(2);
});
test("one POI handoff only after a continuing transfer", () => {
  const p = profile();
  expect(() => ledger.poiReserve(p, header, {})).toThrow(/poi-order/);
  const attempt = ledger.reserve(p, header, "transfer", {});
  expect(() => ledger.poiReserve(p, header, {})).toThrow(/poi-order/);
  ledger.finish(p, header, attempt, { classification: "unknown" });
  const handoff = ledger.poiReserve(p, header, { payloadSha256: "a".repeat(64) });
  expect(() => ledger.poiReserve(p, header, {})).toThrow(/poi-pending/);
  ledger.poiFinish(p, header, handoff, { status: "recovery-required" });
  expect(() => ledger.poiFinish(p, header, handoff, {})).toThrow(/poi-finished/);
});
test("a refused transfer stops the campaign: no unshield or POI", () => {
  const p = profile();
  const attempt = ledger.reserve(p, header, "transfer", {});
  ledger.finish(p, header, attempt, { classification: "refused-before-send" });
  expect(() => ledger.reserve(p, header, "unshield", {})).toThrow(/transfer-not-continuable/);
  expect(() => ledger.poiReserve(p, header, {})).toThrow(/poi-order/);
});
test("report digests are recorded once", () => {
  const p = profile();
  ledger.recordReport(p, header, "live-rebuild", "b".repeat(64));
  expect(() => ledger.recordReport(p, header, "live-submit", "b".repeat(64))).toThrow(/duplicate/);
  expect(ledger.inspect(p, header).reports).toHaveLength(1);
});
