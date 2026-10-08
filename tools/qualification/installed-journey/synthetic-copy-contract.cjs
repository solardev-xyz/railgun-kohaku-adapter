/** Repo-only, pure byte transform. This function performs no filesystem I/O.
 * The outer reviewed builder must verify the tar, every copied file and inode,
 * apply only to its disposable test copy, and pin the resulting source policy. */
"use strict";
const assert = require("assert/strict");
const { createHash } = require("crypto");
const TARGET = "src/data/railgun-poi-records.js";
const ORIGINAL_SHA256 =
  "c4511c0ea185835c67bbbc8b8ba74bec6271e4b3a457a2b6a1576b42593fd1ac";
const TEST_SHA256 =
  "16a8e5e15621d2da51568319717a43ca51e3517beb59441e44931539d47b45ab";
const ORIGINAL_LIST =
  "efc6ddb59c098a13fb2b618fdae94c1c3a807abc8fb1837c93620c9143ee9e88";
const TEST_LIST =
  "43a72e714401762df66b68c26dfbdf2682aaec9f2474eca4613e424a0fbafd3c";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function transformTestList(bytes) {
  assert.ok(Buffer.isBuffer(bytes));
  assert.equal(hash(bytes), ORIGINAL_SHA256);
  const original = `const REQUIRED_LIST = '${ORIGINAL_LIST}';`;
  const replacement = `const REQUIRED_LIST = '${TEST_LIST}';`;
  const text = bytes.toString("utf8");
  assert.ok(Buffer.from(text).equals(bytes));
  assert.equal(text.split(original).length, 2);
  assert.equal(text.includes(replacement), false);
  const changed = Buffer.from(text.replace(original, replacement));
  assert.equal(changed.length, bytes.length);
  assert.equal(hash(changed), TEST_SHA256);
  return changed;
}
module.exports = Object.freeze({
  TARGET,
  ORIGINAL_SHA256,
  TEST_SHA256,
  ORIGINAL_LIST,
  TEST_LIST,
  transformTestList,
});
