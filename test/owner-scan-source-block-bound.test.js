"use strict";
// The real scan-source normalizer's per-window distinct-block bound, which
// refused the live window [9,000,000, 9,099,999] (548 distinct blocks).
require("../tools/owner-test-staging/context-host.cjs");
const {
  normalizeLogs,
  PROXY,
} = require("../src/owners/railgun-scan-source.js");
const hash = (n) => "0x" + n.toString(16).padStart(64, "0");
const logAt = (block, index = 0) => ({
  address: PROXY,
  blockNumber: "0x" + block.toString(16),
  blockHash: hash(block + 1),
  transactionHash: hash(1000000 + block * 4 + index),
  transactionIndex: "0x" + index.toString(16),
  logIndex: "0x" + index.toString(16),
  removed: false,
  topics: [hash(22)],
  data: "0x0102",
});
const spread = (count, from, to) => {
  const step = Math.floor((to - from + 1) / count);
  return Array.from({ length: count }, (_, i) => logAt(from + i * step));
};
test("512 distinct log blocks pass and 513 are refused, independent of log count", () => {
  expect(normalizeLogs(spread(512, 0, 99999), 0, 99999).blocks.size).toBe(512);
  expect(() => normalizeLogs(spread(513, 0, 99999), 0, 99999)).toThrow();
  // 513 logs within 512 distinct blocks still pass: the bound counts blocks.
  const logs = [...spread(512, 0, 99999), logAt(0, 1)];
  const value = normalizeLogs(logs, 0, 99999);
  expect(value.logs).toHaveLength(513);
  expect(value.blocks.size).toBe(512);
});
test("a 600-block window is refused while its five 20000-block parts pass and union to the same logs", () => {
  const all = spread(600, 0, 99999);
  expect(() => normalizeLogs(all, 0, 99999)).toThrow();
  const union = [];
  for (let from = 0; from < 100000; from += 20000) {
    const part = all.filter((log) => {
      const n = Number(BigInt(log.blockNumber));
      return n >= from && n <= from + 19999;
    });
    const value = normalizeLogs(part, from, from + 19999);
    expect(value.blocks.size).toBeLessThanOrEqual(512);
    union.push(...value.logs);
  }
  expect(union).toEqual(
    normalizeLogs(all.slice(0, 512), 0, 99999).logs.concat(
      normalizeLogs(all.slice(512), 0, 99999).logs,
    ),
  );
  expect(union).toHaveLength(600);
});
