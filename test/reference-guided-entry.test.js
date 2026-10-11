"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const base = "../examples/reference-wallet/";
async function entry(
  command,
  { saved = null, failTor = false, result = { status: "account-opened" } } = {},
) {
  jest.resetModules();
  const profile = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "guided-entry-")),
  );
  const config = {
    unlockMinutes: 60,
    rpcUrl: "https://public.invalid",
    runtime: {},
    tor: {},
    serviceOrigins: [],
  };
  const identity = require(base + "journey.cjs").journeyIdentity(
    config,
    "a".repeat(64),
  );
  if (saved)
    saved = {
      version: 1,
      identity,
      role: "alice",
      calls: 0,
      history: [],
      inflight: null,
      data: {},
      ...saved,
    };
  const state = {
    get: jest.fn(async () => structuredClone(saved)),
    update: jest.fn(async (_key, fn) => {
      saved = structuredClone(fn(saved));
    }),
    close: jest.fn(),
  };
  const terminal = {
    read: jest.fn(async () => Buffer.from("public fixture password")),
    confirm: jest.fn(async () => true),
  };
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  const app = {
    dock: { hide() {} },
    whenReady: async () => {},
    exit: (code) => finish({ exit: code }),
  };
  const account = jest.fn(async (options) => {
    expect(saved.inflight).not.toBeNull();
    return typeof result === "function" ? result(options) : result;
  });
  const tor = {
    start: jest.fn(async () => {
      if (failTor)
        throw Object.assign(Error("bootstrap"), { code: "TOR_REQUEST_FAILED" });
    }),
  };
  const signal = new AbortController().signal;
  jest.doMock("electron", () => ({ app }), { virtual: true });
  jest.doMock(base + "fatal.cjs", () => ({
    installFatalHandlers: () => () => {},
  }));
  jest.doMock(base + "shutdown.cjs", () => ({
    createShutdown: () => ({
      quit: async () => finish({ exit: 0 }),
      close: async () => {},
    }),
  }));
  jest.doMock(base + "config.cjs", () => ({
    parseArguments: () => ({
      command,
      role: "alice",
      profile,
      config: command === "journey-status" ? undefined : "/public/config",
    }),
    loadConfiguration: () => config,
  }));
  jest.doMock(base + "terminal.cjs", () => ({
    createTerminal: () => terminal,
  }));
  jest.doMock(base + "host/profile-lock.cjs", () => ({
    acquireProfileLock: () => ({ directory: profile, verify() {} }),
  }));
  jest.doMock(base + "host/vault.cjs", () => ({
    readVaultProfile: () => ({ id: "public-fixture", userDataDir: profile }),
    createVault: () => ({
      unlock: async () => {},
      currentSession: () => signal,
    }),
  }));
  jest.doMock(base + "host/application-state.cjs", () => ({
    createApplicationState: () => state,
  }));
  jest.doMock(base + "host/source-identity.cjs", () => ({
    createSourceIdentityHost: () => ({ readDigest: () => "a".repeat(64) }),
  }));
  jest.doMock(base + "host/signers.cjs", () => ({
    createSignerHost: () => ({
      submitter: { readMetadata: () => ({ address: "0x" + "2".repeat(40) }) },
    }),
  }));
  jest.doMock(base + "host/tor.cjs", () => ({ createTorManager: () => tor }));
  jest.doMock(base + "host/compose.cjs", () => ({
    initializeReferenceOwner: () => ({
      owner: {},
      applicationPolicy: { maxOperationAmount: 100n },
      cacheDigests: { public: "b".repeat(64) },
    }),
  }));
  jest.doMock(base + "account-command.cjs", () => ({
    accountCommand: account,
  }));
  const output = [],
    errors = [];
  const stdout = jest
    .spyOn(process.stdout, "write")
    .mockImplementation((value) => {
      output.push(value);
      return true;
    });
  const stderr = jest
    .spyOn(process.stderr, "write")
    .mockImplementation((value) => {
      errors.push(value);
      return true;
    });
  let completion;
  try {
    require(base + "main.cjs");
    completion = await done;
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
  return { completion, saved, state, account, tor, terminal, output, errors };
}
test("actual entry starts a local guide without Tor or account access", async () => {
  const f = await entry("journey-start");
  expect(f.completion.exit).toBe(0);
  expect(f.saved.step).toBe("funding");
  expect(f.tor.start).not.toHaveBeenCalled();
  expect(f.account).not.toHaveBeenCalled();
});
test("actual status entry reads encrypted bookkeeping without configuration or Tor", async () => {
  const f = await entry("journey-status", {
    saved: { step: "payment", data: {} },
  });
  expect(f.completion.exit).toBe(0);
  expect(f.tor.start).not.toHaveBeenCalled();
  expect(f.output.join("")).toContain('"step":"payment"');
});
test("actual proxy startup failure leaves guide action unstarted", async () => {
  const f = await entry("journey-next", {
    saved: { step: "account" },
    failTor: true,
  });
  expect(f.completion.exit).toBe(1);
  expect(f.saved.inflight).toBeNull();
  expect(f.saved.calls).toBe(0);
  expect(f.account).not.toHaveBeenCalled();
  expect(f.errors.join("")).toContain("TOR_REQUEST_FAILED");
});
test("actual account dispatch sees durable intent after startup and retains returned progress", async () => {
  const f = await entry("journey-next", { saved: { step: "account" } });
  expect(f.completion.exit).toBe(0);
  expect(f.saved.step).toBe("initial-scan");
  expect(f.saved.inflight).toBeNull();
  expect(f.saved.calls).toBe(1);
  expect(f.account).toHaveBeenCalledTimes(1);
  expect(f.tor.start).toHaveBeenCalledTimes(1);
});
