"use strict";
const {
  startJourney,
  journeyStatus,
  nextJourney,
  journeyIdentity,
} = require("../examples/reference-wallet/journey.cjs");
const { parseArguments } = require("../examples/reference-wallet/config.cjs");
const identity = "a".repeat(64),
  hash = "0x" + "1".repeat(64),
  paymentHash = "0x" + "2".repeat(64);
const funding = "0x" + "3".repeat(40),
  hold = "4".repeat(64),
  capsule = "5".repeat(64);
const note = {
  id: "0:1",
  amount: "997500",
  txid: hash,
  spentTxid: false,
  asset: {
    __type: "erc20",
    contract: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
  },
};
function fixture() {
  const values = new Map();
  const state = {
    get: async (key) => structuredClone(values.get(key) ?? null),
    update: async (key, fn) => {
      const value = fn(structuredClone(values.get(key) ?? null));
      values.set(key, structuredClone(value));
      return value;
    },
  };
  const dispatch = jest.fn(),
    ask = jest.fn(),
    confirm = jest.fn(async () => true);
  const execute = async (options, hooks) => {
    await hooks.onDispatch();
    return dispatch(options);
  };
  // The mock instruments the real dispatch, after host startup's hook.
  Object.assign(execute, {
    mock: dispatch.mock,
    mockImplementation: (fn) => dispatch.mockImplementation(fn),
    mockResolvedValue: (value) => dispatch.mockResolvedValue(value),
    mockRejectedValue: (value) => dispatch.mockRejectedValue(value),
    mockResolvedValueOnce: (value) => dispatch.mockResolvedValueOnce(value),
    mockRejectedValueOnce: (value) => dispatch.mockRejectedValueOnce(value),
  });
  return {
    state,
    values,
    execute,
    dispatch,
    ask,
    confirm,
    identity,
    signal: new AbortController().signal,
  };
}
async function at(f, step, role = "alice", data = {}) {
  await startJourney({ ...f, role });
  await f.state.update("guided-journey", (s) => ({
    ...s,
    step,
    data: {
      funding,
      note: {
        id: note.id,
        amount: note.amount,
        txid: note.txid,
        asset: note.asset,
      },
      hold,
      paymentHash,
      shieldHash: hash,
      shieldNoteValue: note.amount,
      ...data,
    },
  }));
}
const receipt = (transactionHash) => ({
  status: "receipt",
  transactionHash,
  receiptStatus: "0x1",
  transactionHashVerified: true,
  withinCurrentGasPolicy: true,
  gasFee: "123",
});
const journaled = (resolved) => ({
  status: "journaled",
  holdId: hold,
  transactionHash: paymentHash,
  observation: { status: "included", confirmations: 12 },
  transact: { status: "matched" },
  output: { kind: "shielded", noteId: "0:2" },
  resolved,
});
test("start is explicit, encrypted-state-only and never overwrites an existing journey", async () => {
  const f = fixture();
  expect(await journeyStatus(f.state)).toMatchObject({
    status: "journey-not-started",
  });
  expect(await startJourney({ ...f, role: "alice" })).toMatchObject({
    step: "funding",
    next: "journey-next",
  });
  await expect(startJourney({ ...f, role: "bob" })).rejects.toThrow();
  expect(f.dispatch).not.toHaveBeenCalled();
});
test("identity is canonical but changes for configuration or runtime source", () => {
  expect(journeyIdentity({ a: 1, b: 2 }, identity)).toBe(
    journeyIdentity({ b: 2, a: 1 }, identity),
  );
  expect(journeyIdentity({ a: 1 }, identity)).not.toBe(
    journeyIdentity({ a: 2 }, identity),
  );
  expect(journeyIdentity({ a: 1 }, identity)).not.toBe(
    journeyIdentity({ a: 1 }, "b".repeat(64)),
  );
});
test("parser isolates role and requires configuration except offline status", () => {
  expect(
    parseArguments([
      "journey-start",
      "--profile",
      "/profile",
      "--config",
      "/config",
      "--role",
      "bob",
    ]),
  ).toMatchObject({ role: "bob" });
  expect(
    parseArguments(["journey-status", "--profile", "/profile"]),
  ).toMatchObject({ command: "journey-status" });
  for (const args of [
    ["journey-next", "--role", "bob"],
    ["journey-start", "--role", "charlie"],
    ["journey-start"],
  ])
    expect(() =>
      parseArguments([...args, "--profile", "/profile", "--config", "/config"]),
    ).toThrow();
});
test("one invocation dispatches exactly one reviewed original command after durable intent", async () => {
  const f = fixture();
  await startJourney({ ...f, role: "bob" });
  f.execute.mockImplementation(async (options) => {
    expect(options).toEqual({ command: "funding-address" });
    expect(await f.state.get("guided-journey")).toMatchObject({
      inflight: { step: "funding", call: 1 },
    });
    return { status: "funding-address", address: funding };
  });
  expect(await nextJourney(f)).toMatchObject({
    step: "account",
    fundingAddress: funding,
    calls: 1,
  });
  expect(f.dispatch).toHaveBeenCalledTimes(1);
});
test.each(["payment", "shield", "poi-submit", "payment-submit"])(
  "interrupted %s never repeats the action",
  async (step) => {
    const f = fixture();
    await at(f, step, "alice", {
      capsule,
      storedAttempts: step === "payment-submit" ? 1 : 0,
    });
    await f.state.update("guided-journey", (s) => ({
      ...s,
      calls: 1,
      inflight: {
        step,
        call: 1,
        preparationApproved: true,
        sendApproved: true,
      },
    }));
    f.execute.mockRejectedValue(
      Object.assign(Error("transport"), { code: "TOR_REQUEST_FAILED" }),
    );
    await expect(nextJourney(f)).rejects.toThrow();
    expect(f.execute.mock.calls[0][0].command).toBe(
      {
        payment: "hold-find",
        shield: "shield-history",
        "poi-submit": "poi-recover",
        "payment-submit": "observe",
      }[step],
    );
  },
);
test("declining continuation dispatches nothing and consumes nothing", async () => {
  const f = fixture();
  await at(f, "input-scan");
  f.confirm.mockResolvedValue(false);
  expect(await nextJourney(f)).toMatchObject({ calls: 0, step: "input-scan" });
  expect(f.dispatch).not.toHaveBeenCalled();
});
test("configuration drift and call exhaustion refuse before any review", async () => {
  const f = fixture();
  await at(f, "input-scan");
  await expect(
    nextJourney({ ...f, identity: "b".repeat(64) }),
  ).rejects.toThrow();
  await f.state.update("guided-journey", (s) => ({ ...s, calls: 512 }));
  expect(await nextJourney(f)).toMatchObject({ step: "diagnosis", next: null });
  expect(f.confirm).not.toHaveBeenCalled();
});
test("paused scan remains resumable and failed scan preserves exact phase", async () => {
  const f = fixture();
  await at(f, "input-scan");
  f.execute
    .mockResolvedValueOnce({ status: "paused" })
    .mockRejectedValueOnce(
      Object.assign(Error("failed"), { code: "TOR_REQUEST_FAILED" }),
    )
    .mockResolvedValueOnce({ status: "complete" });
  expect(await nextJourney(f)).toMatchObject({ step: "input-scan" });
  await expect(nextJourney(f)).rejects.toThrow();
  expect(await journeyStatus(f.state)).toMatchObject({
    step: "input-scan",
    lastError: "TOR_REQUEST_FAILED",
  });
  expect(await nextJourney(f)).toMatchObject({ step: "input-wallet" });
});
test("wallet result loss checks active before resuming a pending generation, never new", async () => {
  const f = fixture();
  await at(f, "wallet");
  await f.state.update("guided-journey", (s) => ({
    ...s,
    calls: 1,
    inflight: {
      step: "wallet",
      call: 1,
      preparationApproved: null,
      sendApproved: null,
    },
  }));
  f.execute
    .mockRejectedValueOnce(Error("pending"))
    .mockResolvedValueOnce({ status: "wallet-ready" });
  await expect(nextJourney(f)).rejects.toThrow();
  expect(f.execute.mock.calls[0][0].command).toBe("address");
  expect(await nextJourney(f)).toMatchObject({ step: "address" });
  expect(f.execute.mock.calls[1][0].command).toBe("wallet-resume");
});
test("input selection binds origin transaction, not amount or the sole note", async () => {
  const f = fixture();
  await at(f, "input-notes");
  f.execute.mockResolvedValue({
    status: "notes",
    notes: [{ ...note, txid: paymentHash }],
  });
  expect(await nextJourney(f)).toMatchObject({ step: "input-scan" });
  await f.state.update("guided-journey", (s) => ({
    ...s,
    step: "input-notes",
  }));
  f.execute.mockResolvedValue({ status: "notes", notes: [note] });
  expect(await nextJourney(f)).toMatchObject({ step: "input-status" });
});
test("ambiguous notes refuse instead of selecting by order", async () => {
  const f = fixture();
  await at(f, "input-notes");
  f.execute.mockResolvedValue({
    status: "notes",
    notes: [note, { ...note, id: "0:2" }],
  });
  await expect(nextJourney(f)).rejects.toThrow();
});
test("retained submission is explicit, one-shot in the guide, and always followed by observation", async () => {
  const f = fixture();
  await at(f, "payment-observe", "alice", { storedAttempts: 2 });
  f.execute
    .mockResolvedValueOnce({ status: "unjournaled", holdId: hold })
    .mockResolvedValueOnce({
      status: "submission-outcome",
      outcome: { status: "recovery-required" },
    })
    .mockResolvedValueOnce({ status: "unjournaled", holdId: hold });
  expect(await nextJourney(f)).toMatchObject({ step: "payment-submit" });
  expect(
    await nextJourney({
      ...f,
      execute: async (options, hooks) => {
        await hooks.onDispatch();
        await hooks.onTransactionDecision(true, {
          from: funding,
          transaction: { chainId: 11155111, nonce: 7 },
        });
        return f.dispatch(options);
      },
    }),
  ).toMatchObject({ step: "payment-observe" });
  expect(await nextJourney(f)).toMatchObject({ step: "diagnosis", next: null });
  expect(f.execute.mock.calls.map((c) => c[0].command)).toEqual([
    "observe",
    "submit-stored",
    "observe",
  ]);
});
test("already resolved retained operation advances without resolving or submitting again", async () => {
  const f = fixture();
  await at(f, "payment-resolve");
  await f.state.update("guided-journey", (s) => ({
    ...s,
    calls: 1,
    inflight: {
      step: "payment-resolve",
      call: 1,
      preparationApproved: null,
      sendApproved: null,
    },
  }));
  f.execute.mockResolvedValue(journaled(true));
  expect(await nextJourney(f)).toMatchObject({ step: "payment-receipt" });
  expect(f.execute.mock.calls[0][0].command).toBe("observe");
});
test("POI status requires exact owned input and authenticated Valid membership", async () => {
  const f = fixture();
  await at(f, "input-status", "bob");
  const status = {
    noteId: note.id,
    inputType: "Transact",
    selectedCount: 1,
    ownershipAtSnapshot: true,
    statuses: ["Valid"],
    allValid: true,
    rootsAccepted: true,
    membershipVerified: true,
  };
  f.execute
    .mockResolvedValueOnce({ ...status, noteId: "other" })
    .mockResolvedValueOnce({
      ...status,
      statuses: ["Missing"],
      allValid: false,
    })
    .mockResolvedValueOnce(status);
  await expect(nextJourney(f)).rejects.toThrow();
  expect(await journeyStatus(f.state)).toMatchObject({ step: "diagnosis" });
  await f.state.update("guided-journey", (s) => ({
    ...s,
    step: "input-status",
  }));
  expect(await nextJourney(f)).toMatchObject({ step: "input-status" });
  expect(await nextJourney(f)).toMatchObject({ step: "input-txid" });
});
test("a HTTP-200 POI response is never enough to claim recipient validity", async () => {
  const f = fixture();
  await at(f, "poi-submit", "alice", { capsule });
  f.execute
    .mockResolvedValueOnce({
      status: "recovery-required",
      response: { httpStatus: 200 },
    })
    .mockResolvedValueOnce({
      status: "matched",
      recordState: "attempted",
      capsuleDigest: capsule,
    });
  expect(await nextJourney(f)).toMatchObject({ step: "poi-recover" });
  const result = await nextJourney(f);
  expect(result).toMatchObject({ step: "complete" });
  expect(result.instruction).toContain("Bob's owned Valid");
});
test("Bob completes only after matched amount, recipient, gas and spent-note checks", async () => {
  const f = fixture();
  await at(f, "payment-receipt", "bob", {
    output: {
      kind: "unshield",
      recipient: funding,
      amount: note.amount,
      received: "995000",
      fee: "2500",
      feeDeviation: false,
    },
  });
  f.execute
    .mockResolvedValueOnce(receipt(paymentHash))
    .mockResolvedValueOnce({ status: "complete" })
    .mockResolvedValueOnce({ status: "wallet-ready" })
    .mockResolvedValueOnce({ status: "notes", notes: [] });
  for (let i = 0; i < 3; i++)
    expect((await nextJourney(f)).step).not.toBe("complete");
  expect(await nextJourney(f)).toMatchObject({ step: "complete" });
});
test.each(["wrong-hash", "reverted", "gas", "recipient", "amount"])(
  "accounting rejects %s",
  async (fault) => {
    const f = fixture();
    await at(f, "payment-receipt", "bob", {
      output: {
        kind: "unshield",
        recipient: funding,
        amount: note.amount,
        received: "995000",
        fee: "2500",
        feeDeviation: false,
      },
    });
    const r = receipt(paymentHash);
    if (fault === "wrong-hash") r.transactionHash = hash;
    if (fault === "reverted") r.receiptStatus = "0x0";
    if (fault === "gas") r.gasFee = "2000000000000001";
    if (["recipient", "amount"].includes(fault))
      await f.state.update("guided-journey", (s) => ({
        ...s,
        data: {
          ...s.data,
          output: {
            ...s.data.output,
            [fault]: fault === "recipient" ? "0x" + "9".repeat(40) : "1",
          },
        },
      }));
    f.execute.mockResolvedValue(r);
    await expect(nextJourney(f)).rejects.toThrow();
  },
);
test("lost Shield hash is not guessed from a single journal row", async () => {
  const f = fixture();
  await at(f, "shield-find");
  await f.state.update("guided-journey", (s) => {
    delete s.data.shieldHash;
    return s;
  });
  f.execute.mockResolvedValue({
    status: "shield-history",
    records: [{ transactionHash: hash, resolved: true }],
  });
  expect(await nextJourney(f)).toMatchObject({ step: "diagnosis" });
});

test("host startup failure before dispatch leaves no mutation intent or budget use", async () => {
  const f = fixture();
  await at(f, "payment", "alice", { recipient: "Bob" });
  await expect(
    nextJourney({
      ...f,
      execute: async () => {
        throw Object.assign(Error("bootstrap"), { code: "TOR_REQUEST_FAILED" });
      },
    }),
  ).rejects.toThrow();
  expect(await journeyStatus(f.state)).toMatchObject({
    step: "payment",
    interrupted: false,
    calls: 0,
  });
});
test.each(["shield", "payment"])(
  "declined %s preparation is offered again without claiming an attempted send",
  async (step) => {
    const f = fixture();
    await at(f, step, "alice", { recipient: "Bob", amount: "1000000" });
    await expect(
      nextJourney({
        ...f,
        execute: async (_options, hooks) => {
          await hooks.onDispatch();
          await hooks.onPreparationDecision(false);
          throw Error("declined");
        },
      }),
    ).rejects.toThrow();
    expect(await journeyStatus(f.state)).toMatchObject({
      step,
      interrupted: false,
    });
  },
);
test("approved preparation failure goes to custody and never re-prepares blindly", async () => {
  const f = fixture();
  await at(f, "payment", "alice", { recipient: "Bob" });
  await expect(
    nextJourney({
      ...f,
      execute: async (_options, hooks) => {
        await hooks.onDispatch();
        await hooks.onPreparationDecision(true);
        throw Error("late failure");
      },
    }),
  ).rejects.toThrow();
  expect(await journeyStatus(f.state)).toMatchObject({ step: "hold-find" });
});

test("preparation decision cannot be downgraded after approval", async () => {
  const f = fixture();
  await at(f, "payment", "alice", { recipient: "Bob" });
  await expect(
    nextJourney({
      ...f,
      execute: async (_options, hooks) => {
        await hooks.onDispatch();
        await hooks.onPreparationDecision(true);
        await hooks.onPreparationDecision(false);
      },
    }),
  ).rejects.toThrow();
  expect(await journeyStatus(f.state)).toMatchObject({ step: "diagnosis" });
});
test("invalid amount is refused before saving an intent or invoking the owner", async () => {
  const f = fixture();
  await at(f, "shield");
  f.ask.mockResolvedValue("10000000000000001");
  await expect(nextJourney(f)).rejects.toThrow();
  expect(f.dispatch).not.toHaveBeenCalled();
  expect(await journeyStatus(f.state)).toMatchObject({ calls: 0 });
});
test("guide mutation state rejects extra fields and malformed decision markers", async () => {
  const f = fixture();
  await at(f, "account");
  await f.state.update("guided-journey", (s) => ({ ...s, extra: true }));
  await expect(journeyStatus(f.state)).rejects.toThrow();
  await f.state.update("guided-journey", (s) => {
    delete s.extra;
    s.calls = 1;
    s.inflight = {
      step: "account",
      call: 1,
      preparationApproved: "true",
      sendApproved: null,
    };
    return s;
  });
  await expect(nextJourney(f)).rejects.toThrow();
  expect(f.dispatch).not.toHaveBeenCalled();
});

test("lost Shield return finds only this call's bookkeeping hash, then rebinds to authenticated journal", async () => {
  const f = fixture();
  await at(f, "shield-find", "alice", {
    amount: "1000000",
    shieldAttempt: "a".repeat(64),
  });
  await f.state.update("guided-journey", (s) => {
    delete s.data.shieldHash;
    return s;
  });
  await f.state.update("operations", () => [
    {
      guideAttempt: "a".repeat(64),
      command: "shield",
      amount: "1000000",
      status: "reported",
      outcome: {
        hash,
        from: funding,
        chainId: 11155111,
        broadcastSource: "direct",
        value: "1000000",
      },
    },
  ]);
  f.execute.mockResolvedValue({
    status: "shield-history",
    records: [{ transactionHash: hash, resolved: false }],
  });
  expect(await nextJourney(f)).toMatchObject({ step: "shield-observe" });
  expect(f.dispatch).toHaveBeenCalledWith({ command: "shield-history" });
});

test("approved Shield binds its nonce before SEND and recovers a lost hash from its own journal", async () => {
  const f = fixture();
  await at(f, "shield", "alice", { amount: "1000000" });
  await f.state.update("guided-journey", (s) => {
    delete s.data.shieldHash;
    return s;
  });
  const summary = {
    from: funding,
    operation: "railgun-native-shield",
    transaction: { chainId: 11155111, nonce: 7, value: "1000000" },
    noteValue: 997500n,
  };
  await expect(
    nextJourney({
      ...f,
      execute: async (_options, hooks) => {
        await hooks.onDispatch();
        await hooks.onPreparationDecision(true);
        await hooks.onTransactionDecision(true, summary);
        throw Error("result lost");
      },
    }),
  ).rejects.toThrow();
  expect(await journeyStatus(f.state)).toMatchObject({ step: "shield-find" });
  f.execute.mockResolvedValue({
    status: "shield-history",
    records: [{ transactionHash: hash, nonce: 7, resolved: false }],
  });
  expect(await nextJourney(f)).toMatchObject({ step: "shield-observe" });
});
test("approved Shield with a completely read empty nonce has no recorded send and reoffers under the original owner guard", async () => {
  const f = fixture();
  await at(f, "shield-find", "alice", {
    amount: "1000000",
    shieldNonce: 7,
    shieldAttempts: 1,
  });
  await f.state.update("guided-journey", (s) => {
    delete s.data.shieldHash;
    return s;
  });
  f.execute.mockResolvedValue({ status: "shield-history", records: [] });
  expect(await nextJourney(f)).toMatchObject({ step: "shield" });
});
test("generic custody-history failure permits only a bounded exact-input recheck, never claims no hold", async () => {
  const f = fixture();
  await at(f, "hold-find", "alice", {
    recipient: "Bob",
    recipientApproved: true,
    paymentAttempts: 1,
  });
  f.execute
    .mockRejectedValueOnce(
      Object.assign(Error("history"), {
        code: "RAILGUN_PRIVATE_RECOVERY_HISTORY_REFUSED",
      }),
    )
    .mockResolvedValueOnce({ status: "notes", notes: [note] });
  await expect(nextJourney(f)).rejects.toThrow();
  expect(await journeyStatus(f.state)).toMatchObject({
    step: "payment-recheck",
  });
  expect(await nextJourney(f)).toMatchObject({ step: "payment" });
  expect((await f.state.get("guided-journey")).data).toMatchObject({
    recipient: "Bob",
    note: { id: note.id },
  });
});
test("ambiguous holds are terminal, never a same-input preparation reoffer", async () => {
  const f = fixture();
  await at(f, "hold-find");
  f.execute.mockResolvedValue({ status: "hold-ambiguous" });
  expect(await nextJourney(f)).toMatchObject({ step: "diagnosis" });
});

test.each(["shield", "payment"])(
  "four declined %s preparations consume calls but no approved offers",
  async (step) => {
    const f = fixture();
    await at(f, step, "alice", { amount: "1000000", recipient: "Bob" });
    f.ask.mockResolvedValue(step === "shield" ? "1000000" : "Bob");
    for (let i = 0; i < 4; i++)
      await expect(
        nextJourney({
          ...f,
          execute: async (_options, hooks) => {
            await hooks.onDispatch();
            await hooks.onPreparationDecision(false);
            throw Error("declined");
          },
        }),
      ).rejects.toThrow();
    expect(await journeyStatus(f.state)).toMatchObject({ step, calls: 4 });
    const d = (await f.state.get("guided-journey")).data;
    expect(d.shieldAttempts ?? 0).toBe(0);
    expect(d.paymentAttempts ?? 0).toBe(0);
  },
);
test.each([
  ["shield", "shieldAttempts"],
  ["payment", "paymentAttempts"],
  ["payment-submit", "storedAttempts"],
  ["poi-submit", "poiAttempts"],
])(
  "exhausted %s budget persists a diagnosis before dispatch",
  async (step, key) => {
    const f = fixture();
    await at(f, step, "alice", { [key]: 3 });
    expect(await nextJourney(f)).toMatchObject({
      step: "diagnosis",
      next: null,
    });
    expect(await journeyStatus(f.state)).toMatchObject({
      step: "diagnosis",
      next: null,
    });
    expect(f.dispatch).not.toHaveBeenCalled();
  },
);
test("Bob can correct an unmatched origin hash before any note has been selected", async () => {
  const f = fixture();
  await at(f, "input-scan", "bob", { expectedTransfer: hash });
  await f.state.update("guided-journey", (s) => {
    delete s.data.note;
    return s;
  });
  f.ask.mockResolvedValue(paymentHash);
  f.execute.mockResolvedValue({ status: "complete" });
  expect(await nextJourney(f)).toMatchObject({ step: "input-wallet" });
  expect((await f.state.get("guided-journey")).data.expectedTransfer).toBe(
    paymentHash,
  );
  expect(f.ask).toHaveBeenCalledTimes(1);
});
test("Bob refuses a transfer descriptor for an unshield hold", async () => {
  const f = fixture();
  await at(f, "hold-find", "bob");
  f.execute.mockResolvedValue({
    status: "hold-found",
    inputNoteId: note.id,
    holdId: hold,
    localState: "proof-present",
    transfer: { recipient: "other", amount: note.amount },
  });
  await expect(nextJourney(f)).rejects.toThrow();
  expect(await journeyStatus(f.state)).toMatchObject({ step: "diagnosis" });
});
