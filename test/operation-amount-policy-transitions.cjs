"use strict";
// Test-only newest-first provenance reversal; never loaded by package runtime.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const manifest = require("../docs/owners/OPERATION-AMOUNT-POLICY-TRANSITIONS.json");
const sha = value => createHash("sha256").update(value).digest("hex");
function undoOperationAmountPolicy(text, file) {
  const row = manifest.changes.find(change => change.file === file);
  if (!row) return text;
  assert.equal(sha(text), row.afterSha256, file);
  for (const edit of [...row.replacements].reverse()) {
    assert.equal(text.slice(edit.start, edit.start + edit.after.length), edit.after, file);
    text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
  }
  assert.equal(sha(text), row.beforeSha256, file);
  return text;
}
module.exports = { undoOperationAmountPolicy };
