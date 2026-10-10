"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Mnemonic } = require("ethers");
const { parseArguments } = require("../examples/reference-wallet/config.cjs");
const { custodyCommand } = require("../examples/reference-wallet/custody.cjs");
const { createVault } = require("../examples/reference-wallet/host/vault.cjs");
function fixture() {
  const userDataDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "reference-command-")),
  );
  const vault = createVault({
    profile: { id: "public-command-fixture", userDataDir },
  });
  return { vault, userDataDir, signal: new AbortController().signal };
}
test("parser admits only named commands and paths, never password/seed arguments", () => {
  const base = ["init", "--profile", "/public/profile"];
  expect(parseArguments(base)).toMatchObject({
    command: "init",
    profile: "/public/profile",
  });
  for (const extra of [
    ["--password", "public"],
    ["--seed", "public"],
    ["--profile", "/other"],
    ["--cache", "new"],
    ["--unknown", "value"],
    ["--locks", "/other"],
  ])
    expect(() => parseArguments([...base, ...extra])).toThrow();
  expect(() => parseArguments(["account-create", ...base.slice(1)])).toThrow();
  expect(() =>
    parseArguments(["init", "--profile", "relative", "--locks", "/locks"]),
  ).toThrow();
});
test("restore uses real encrypted custody and wipes every returned credential buffer", async () => {
  const f = fixture();
  const phrase = Buffer.from(Mnemonic.fromEntropy(Buffer.alloc(32, 7)).phrase);
  const password = Buffer.from("public fixture password"),
    confirmation = Buffer.from(password);
  const inputs = [phrase, password, confirmation];
  const terminal = {
    confirm: jest.fn(async () => true),
    read: jest.fn(async () => inputs.shift()),
    showRecovery: jest.fn(),
  };
  try {
    expect(
      await custodyCommand({ ...f, terminal, command: "restore" }),
    ).toEqual({ status: "vault-restored-rescan-required" });
    for (const bytes of [phrase, password, confirmation])
      expect(bytes.every((byte) => byte === 0)).toBe(true);
    expect(terminal.showRecovery).not.toHaveBeenCalled();
    expect(f.vault.currentSession().aborted).toBe(true);
    const reauth = Buffer.from("public fixture password");
    try {
      await f.vault.exportRecovery(reauth, (bytes) => {
        expect(bytes.toString()).toBe(
          Mnemonic.fromEntropy(Buffer.alloc(32, 7)).phrase,
        );
      });
    } finally {
      reauth.fill(0);
    }
  } finally {
    f.vault.lock();
  }
});
test("password mismatch writes nothing; denied backup never asks for credentials", async () => {
  const f = fixture(),
    first = Buffer.from("public password one"),
    second = Buffer.from("public password two");
  const answers = [first, second];
  const terminal = {
    confirm: jest.fn(async () => false),
    read: jest.fn(async () => answers.shift()),
    showRecovery: jest.fn(),
  };
  await expect(
    custodyCommand({ ...f, terminal, command: "init" }),
  ).rejects.toMatchObject({ code: "REFERENCE_PASSWORD_MISMATCH" });
  expect(fs.readdirSync(f.userDataDir)).toEqual([]);
  expect(
    first.every((byte) => byte === 0) && second.every((byte) => byte === 0),
  ).toBe(true);
  terminal.read.mockClear();
  expect(await custodyCommand({ ...f, terminal, command: "backup" })).toEqual({
    status: "cancelled",
  });
  expect(terminal.read).not.toHaveBeenCalled();
});
