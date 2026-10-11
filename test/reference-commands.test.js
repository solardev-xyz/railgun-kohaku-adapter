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

test.each([
  ["shield", ["--amount", "1000"]],
  ["pay-note", ["--note", "0:1", "--to", "public-fixture-recipient"]],
  ["unshield-note", ["--note", "0:1", "--to", "0x" + "a1".repeat(20)]],
  ["shield-resolve", ["--transaction", "0x" + "1".repeat(64)]],
  ["receipt", ["--transaction", "0x" + "1".repeat(64)]],
  ["resolve", ["--hold", "1".repeat(64)]],
  ["submit-stored", ["--hold", "1".repeat(64)]],
  ["poi-prepare-shield", ["--hold", "1".repeat(64)]],
  ["poi-submit", ["--capsule", "1".repeat(64)]],
  ["poi-status", ["--note", "0:1"]],
])(
  "%s requires its own selectors and rejects irrelevant authority",
  (command, extra) => {
    const base = [
      command,
      "--profile",
      "/fixture",
      "--config",
      "/fixture.json",
    ];
    expect(parseArguments([...base, ...extra]).command).toBe(command);
    expect(() => parseArguments(base)).toThrow();
    expect(() =>
      parseArguments([...base, ...extra, "--seed", "never"]),
    ).toThrow();
  },
);
test("read commands cannot carry a transaction, capsule or recipient", () => {
  const base = ["notes", "--profile", "/fixture", "--config", "/fixture.json"];
  for (const extra of [
    ["--transaction", "0x" + "1".repeat(64)],
    ["--capsule", "1".repeat(64)],
    ["--to", "recipient"],
  ])
    expect(() => parseArguments([...base, ...extra])).toThrow();
});

test("configuration rejects missing pinned service origins before network startup", () => {
  const {
    loadConfiguration,
  } = require("../examples/reference-wallet/config.cjs");
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "reference-config-")),
  );
  const filename = path.join(root, "settings.json");
  const configuration = {
    version: 1,
    runtime: {
      archive: path.join(root, "engine.asar"),
      proverArchive: path.join(root, "prover.asar"),
      artifactDirectory: root,
    },
    tor: { binary: path.join(root, "arti"), sha256: "1".repeat(64) },
    rpcUrl: "https://synthetic.invalid",
    serviceOrigins: [
      "https://ppoi.fdi.network",
      "https://rail-squid.squids.live",
    ],
    unlockMinutes: 60,
  };
  fs.writeFileSync(filename, JSON.stringify(configuration), { mode: 0o600 });
  expect(loadConfiguration(filename).serviceOrigins).toEqual(
    configuration.serviceOrigins,
  );
  configuration.maxOperationAmount = "50000000000000000";
  fs.writeFileSync(filename, JSON.stringify(configuration));
  expect(loadConfiguration(filename).maxOperationAmount).toBe("50000000000000000");
  for (const invalid of ["0", "01", "-1", 1, null, (1n << 120n).toString()]) {
    configuration.maxOperationAmount = invalid;
    fs.writeFileSync(filename, JSON.stringify(configuration));
    expect(() => loadConfiguration(filename)).toThrow();
  }
  delete configuration.maxOperationAmount;
  configuration.serviceOrigins = ["https://another.invalid"];
  fs.writeFileSync(filename, JSON.stringify(configuration));
  expect(() => loadConfiguration(filename)).toThrow(
    expect.objectContaining({ code: "REFERENCE_TXID_CONFIGURATION_REFUSED" }),
  );
});


test("shield CLI admits the full structural amount domain and refuses overflow", () => {
  const args = ["shield", "--profile", "/profile", "--config", "/config", "--amount"];
  const max = ((1n << 120n) - 1n).toString();
  expect(parseArguments([...args, max]).amount).toBe(max);
  for (const amount of [(1n << 120n).toString(), "01", "0", "1e18", "-1"])
    expect(() => parseArguments([...args, amount])).toThrow();
});
