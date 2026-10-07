"use strict";
const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const transitions = require("../docs/owners/CALLER-TRANSITIONS.json");
const {
  getProcessJob,
  admitsProcessJob,
} = require("../src/owners/process-jobs");
const root = path.join(__dirname, "..");
const expected = {
  "relay-quote-verify": ["relay-quote-review", "engine", false],
  "shield-prepare": ["shield-prepare", "engine", false],
  "poi-membership": ["poi-membership", "poi", false],
  "note-provenance": ["note-provenance", "engine", false],
  "relay-proof": ["relay-verify", "prover", false],
  "relay-signature-verify": ["relay-signature-verify", "prover", false],
  "poi-shield-selector": ["poi-shield-selector", "engine", false],
  "own-selector": ["own-txid-selector", "engine", false],
  "own-txid-verifier": ["own-txid-proof", "engine", false],
  "poi-verifier": ["poi-verify", "prover", false],
  "shield-receive": ["shield-receive", "engine", true],
  "own-poi-proof": ["poi-prove", "engine", true],
  "poi-output-recovery": ["poi-output-recover", "engine", true],
  "own-poi-membership": ["poi-transact-selector", "engine", true],
  "public-run": ["public-scan", "engine", false],
};
const sha = (text) => createHash("sha256").update(text).digest("hex");
function source(stem) {
  return fs.readFileSync(
    path.join(root, "src/owners/railgun-" + stem + ".js"),
    "utf8",
  );
}
test("all caller transitions reconstruct exact base bytes without changing any other expression", () => {
  expect(transitions.baseRevision).toBe(
    "8905ee2fab85c2fc5b866299cdc2021198e15b63",
  );
  expect(
    transitions.changes.map((row) => path.basename(row.file)).sort(),
  ).toEqual(
    [...Object.keys(expected), "wallet-run", "txid-runner"]
      .map((s) => "railgun-" + s + ".js")
      .sort(),
  );
  for (const row of transitions.changes) {
    let text = fs.readFileSync(path.join(root, row.file), "utf8");
    expect(sha(text)).toBe(row.afterSha256);
    for (const edit of [...row.replacements].reverse()) {
      expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(
        edit.after,
      );
      expect(edit.before).toMatch(/filename: require.resolve|binaryKey:/);
      expect(edit.after === "" || /executionJob: /.test(edit.after)).toBe(true);
      text =
        text.slice(0, edit.start) +
        edit.before +
        text.slice(edit.start + edit.after.length);
    }
    expect(sha(text)).toBe(row.beforeSha256);
  }
});
test.each(Object.entries(expected))(
  "%s selects its exact role/key-constrained route",
  (stem, [job, role, key]) => {
    expect(source(stem)).toContain("executionJob: '" + job + "'");
    expect(getProcessJob(job)).toEqual({ role, key });
    const subject = {
      kind: "private-account",
      protocol: "railgun",
      chainId: 11155111,
      deployment: "sepolia",
      role,
      operation: job === "poi-membership" ? "poi:" + "a".repeat(64) : job,
    };
    expect(admitsProcessJob(job, subject)).toBe(true);
    for (const changed of [
      { role: "storage" },
      { operation: "other" },
      { kind: "public-address" },
    ])
      expect(admitsProcessJob(job, { ...subject, ...changed })).toBe(false);
    expect(getProcessJob("./railgun-" + job + "-job.js")).toBeUndefined();
  },
);
test("dynamic wallet and TXID routes retain original closed purpose/mode guards and wire input", () => {
  const wallet = source("wallet-run");
  expect(wallet).toContain("executionJob: purpose,");
  expect(wallet).toContain("role: 'engine', operation: purpose");
  expect(wallet).toContain("input: jobInput,");
  const txid = source("txid-runner");
  expect(txid).toContain("executionJob: 'txid-' + mode,");
  expect(txid).toContain("operation: 'txid-' + mode");
  expect(txid).toContain("].includes(mode)");
  expect(txid).toContain("input: JSON.stringify({ archive, mode }),");
  for (const mode of [
    "inspect",
    "project",
    "apply",
    "witness",
    "note-witness",
    "historical-root",
    "coverage",
  ]) {
    expect(txid).toContain("'" + mode + "'");
    expect(getProcessJob("txid-" + mode)).toEqual({
      role: "engine",
      key: false,
    });
  }
});
test("no process caller retains a legacy filename/key selector", () => {
  const dir = path.join(root, "src/owners");
  let callers = 0;
  for (const name of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    if (!text.includes("startRailgunProcess({")) continue;
    callers++;
    expect(text).not.toMatch(/\b(?:filename|binaryKey)\s*:/);
  }
  expect(callers).toBe(20);
});
