"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

assert.equal(process.argv.length, 3, "Pass one disposable upstream checkout path");
const checkout = resolve(process.argv[2]);
const git = (...args) => execFileSync("git", args, { cwd: checkout, encoding: "utf8" }).trim();
assert.equal(git("rev-parse", "HEAD"), "da0b0b1f57f1351d5223a741583c0f3f46595531", "Wrong upstream revision");
assert.equal(git("status", "--porcelain"), "", "Use a clean disposable checkout");

const library = join(checkout, "crates/railgun/src/lib.rs");
const modulePath = join(checkout, "crates/railgun/src/host_boundary_tests.rs");
const before = readFileSync(library);
assert.equal(createHash("sha256").update(before).digest("hex"), "80a07c4512db32ebf330552cd1a00d6006953840f14048070e83b3983cc02bfb", "Changed library bytes");
assert(!existsSync(modulePath), "Evaluation module already exists");
const moduleBytes = readFileSync(join(__dirname, "host-boundary-tests.rs"));
const anchor = "pub use common::MaybeSend;";
assert.equal(before.toString().split(anchor).length, 2, "Ambiguous insertion point");
writeFileSync(modulePath, moduleBytes, { flag: "wx" });
writeFileSync(library, before.toString().replace(anchor, `${anchor}\n\n#[cfg(all(test, native))]\nmod host_boundary_tests;`));
process.stdout.write("Installed native-only public-fixture harness. Run the README's locked cargo test command.\n");
