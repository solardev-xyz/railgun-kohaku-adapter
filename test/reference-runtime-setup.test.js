"use strict";
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { createHash } = require("node:crypto");
const { assertDestination, assertArchive } = require("../tools/conformance/setup-reference-runtime.cjs");
test("runtime setup preserves existing destinations and refuses relative paths", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "runtime-setup-")));
  fs.writeFileSync(path.join(root, "preserve"), "original");
  expect(() => assertDestination(root)).toThrow("new canonical absolute");
  expect(() => assertDestination("relative")).toThrow("new canonical absolute");
  expect(fs.readdirSync(root)).toEqual(["preserve"]);
});
test("final archive identity checks bytes and size, refusing symlinks", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "runtime-archive-")));
  const file = path.join(root, "fixture.asar"), bytes = Buffer.from("inert public fixture");
  fs.writeFileSync(file, bytes);
  const pin = { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  expect(assertArchive(file, pin).sha256).toBe(pin.sha256);
  expect(() => assertArchive(file, { ...pin, size: pin.size + 1 })).toThrow("pin differs");
  fs.symlinkSync(file, path.join(root, "alias.asar"));
  expect(() => assertArchive(path.join(root, "alias.asar"), pin)).toThrow("pin differs");
  fs.writeFileSync(file, Buffer.alloc(bytes.length));
  expect(() => assertArchive(file, pin)).toThrow("pin differs");
});
