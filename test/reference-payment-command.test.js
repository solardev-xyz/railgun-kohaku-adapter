"use strict";
const {
  paymentCommand,
} = require("../examples/reference-wallet/payment-command.cjs");
const {
  independentPrivateHost,
  INSTANCE,
  ADDRESS,
} = require("./fixtures/railgun-kohaku-private-conformance");
const {
  independentPublicHost,
} = require("./fixtures/railgun-kohaku-public-conformance");
function fixture(command) {
  const host =
    command === "shield" ? independentPublicHost() : independentPrivateHost();
  let rows = null;
  const writes = [];
  const options = {
    command,
    session: {
      openPublic: jest.fn(async () => host.host),
      openPrivate: jest.fn(async () => host.host),
    },
    signal: new AbortController().signal,
    reviews: { preparation: jest.fn(), transaction: jest.fn() },
    state: {
      update: async (_key, change) => {
        rows = change(rows);
        writes.push(structuredClone(rows));
      },
    },
    noteId: command === "shield" ? undefined : "0:1",
    recipient:
      command === "pay-note"
        ? INSTANCE
        : command === "unshield-note"
          ? ADDRESS
          : undefined,
    amount: command === "shield" ? "1000" : undefined,
  };
  return { host, options, writes, rows: () => rows };
}
test.each(["shield", "pay-note", "unshield-note"])(
  "%s uses the actual public adapter wrapper and makes one submission",
  async (command) => {
    const f = fixture(command);
    const result = await paymentCommand(f.options);
    expect(result.outcome).toBe(f.host.acknowledged);
    expect(result.next.authority).toContain("bookkeeping only");
    expect(result.next.commands[0]).toBe(
      command === "shield" ? "shield-history" : "holds",
    );
    expect(
      f.host.calls.filter((row) =>
        ["broadcast", "submit"].includes(
          typeof row === "string" ? row : row.method,
        ),
      ),
    ).toHaveLength(1);
    expect(
      f.host.calls.filter(
        (row) => (typeof row === "string" ? row : row.method) === "close",
      ),
    ).toHaveLength(1);
    expect(f.writes.map((rows) => rows[0].status)).toEqual([
      "preparing",
      "prepared",
      "reported",
    ]);
    expect(f.rows()[0].outcome).toBe(f.host.acknowledged);
  },
);
test("exact note selection refuses absent or spent inputs before preparation", async () => {
  const f = fixture("pay-note");
  f.options.noteId = "unowned";
  await expect(paymentCommand(f.options)).rejects.toThrow();
  expect(f.host.calls.map((row) => row.method)).toEqual(["notes", "close"]);
  expect(f.rows()[0].status).toBe("preparing");
});
test("private delivery uncertainty is recorded, never broadcast a second time", async () => {
  const f = fixture("pay-note");
  let sends = 0;
  f.host.host.broadcast = async () => {
    sends++;
    return {
      transactionHash: "0x" + "a".repeat(64),
      submissionStatus: "unknown",
    };
  };
  const result = await paymentCommand(f.options);
  expect(result.outcome.submissionStatus).toBe("unknown");
  expect(sends).toBe(1);
  expect(result.next.instruction).toContain("Do not repeat");
  expect(f.rows()[0].outcome.submissionStatus).toBe("unknown");
});
test("a durable-history failure after preparation closes the adapter without sending", async () => {
  const f = fixture("pay-note"),
    original = f.options.state.update;
  let writes = 0;
  f.options.state.update = async (...args) => {
    if (++writes === 2) throw Error("disk");
    return original(...args);
  };
  await expect(paymentCommand(f.options)).rejects.toThrow("disk");
  expect(f.host.calls.some((row) => row.method === "prepareTransfer")).toBe(
    true,
  );
  expect(f.host.calls.some((row) => row.method === "broadcast")).toBe(false);
  expect(f.host.calls.at(-1).method).toBe("close");
});
test("post-send record failure does not repeat the network call or fabricate an outcome", async () => {
  const f = fixture("pay-note"),
    original = f.options.state.update;
  let writes = 0;
  f.options.state.update = async (...args) => {
    if (++writes === 3) throw Error("disk");
    return original(...args);
  };
  await expect(paymentCommand(f.options)).rejects.toThrow("disk");
  expect(f.host.calls.filter((row) => row.method === "broadcast")).toHaveLength(
    1,
  );
  expect(f.rows()[0].status).toBe("prepared");
});
