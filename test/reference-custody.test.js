"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { spawnSync } = require("node:child_process");
const script = path.resolve(
  __dirname,
  "../tools/conformance/reference-custody.cjs",
);
function run(root, mode, password = "public custody test password") {
  return spawnSync(process.execPath, [script, root, mode], {
    input: password,
    encoding: "utf8",
    timeout: 10000,
  });
}
test("actual vault, inventory, sessions, credentials and storage survive a cold process", () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "railgun-reference-cold-")),
  );
  for (const mode of ["create", "open", "open"]) {
    const child = run(root, mode);
    expect({ status: child.status, error: child.stderr }).toEqual({
      status: 0,
      error: "",
    });
    expect(JSON.parse(child.stdout)).toEqual({
      authenticatedInventory: true,
      encryptedRecord: true,
      rootDrained: true,
      revoked: true,
    });
  }
  const wrong = run(root, "open", "different public test password");
  expect(wrong.status).toBe(1);
  expect(wrong.stdout).toBe("");
  const overwrite = run(root, "create");
  expect(overwrite.status).toBe(1);
});
