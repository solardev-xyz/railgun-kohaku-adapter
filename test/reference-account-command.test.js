"use strict";
const {
  accountCommand,
} = require("../examples/reference-wallet/account-command.cjs");
function fixture(command) {
  const lane = {
    instanceId: jest.fn(async () => "public-address-fixture"),
    notes: jest.fn(async () => []),
    balance: jest.fn(async () => []),
    close: jest.fn(async () => {}),
    closed: Promise.resolve(),
  };
  const session = {
    describe: () => ({ instanceId: "public-fixture" }),
    openRead: jest.fn(async () => lane),
    recoverPublic: jest.fn(async () => ({ status: "unscanned", to: null })),
    advancePublic: jest.fn(async ({ to }) => ({
      status: "applied-unverified",
      to: { number: to, hash: "0x" + "a".repeat(64) },
    })),
  };
  let saved = null;
  const options = {
    command,
    owner: {
      createAccount: jest.fn(async () => session),
      openAccount: jest.fn(async () => session),
    },
    onSession: jest.fn(),
    signal: new AbortController().signal,
    confirm: jest.fn(async () => true),
    state: {
      get: async () => saved,
      update: async (_key, f) => {
        saved = f(saved);
      },
    },
    chain: {
      finalized: async () => ({ number: 1, hash: "0x" + "a".repeat(64) }),
    },
    scanCacheDigest: "b".repeat(64),
    deadline: Date.now() + 3600000,
  };
  return { options, session, lane };
}
test("scan requests existing-generation recovery and retains the opened session", async () => {
  const f = fixture("scan");
  expect(await accountCommand(f.options)).toMatchObject({ status: "complete" });
  expect(f.options.owner.openAccount).toHaveBeenCalledWith({
    accountIndex: 0,
    signal: f.options.signal,
    publicCache: "recover",
  });
  expect(f.options.onSession).toHaveBeenCalledWith(f.session);
  expect(f.options.owner.createAccount).not.toHaveBeenCalled();
  expect(f.session.recoverPublic).toHaveBeenCalledTimes(1);
});
test("refused rebuild review never opens the account or creates a generation", async () => {
  const f = fixture("wallet-rebuild");
  f.options.confirm.mockResolvedValue(false);
  expect(await accountCommand(f.options)).toEqual({ status: "cancelled" });
  expect(f.options.owner.openAccount).not.toHaveBeenCalled();
});
test.each([
  ["notes", "active"],
  ["balance", "active"],
  ["address", "active"],
  ["wallet-rebuild", "new"],
  ["wallet-resume", "pending"],
  ["wallet-sync", "advance"],
])(
  "%s uses only the explicit wallet mode %s and drains its lane",
  async (command, wallet) => {
    const f = fixture(command);
    await accountCommand(f.options);
    expect(f.session.openRead).toHaveBeenCalledWith({
      wallet,
      signal: f.options.signal,
    });
    expect(f.lane.close).toHaveBeenCalledTimes(1);
    expect(f.session.advancePublic).not.toHaveBeenCalled();
  },
);
test("a read failure drains the lane, without silently resuming or rebuilding", async () => {
  const f = fixture("notes"),
    error = Error("read unavailable");
  f.lane.notes.mockRejectedValue(error);
  await expect(accountCommand(f.options)).rejects.toBe(error);
  expect(f.lane.close).toHaveBeenCalledTimes(1);
  expect(f.session.openRead).toHaveBeenCalledTimes(1);
});
