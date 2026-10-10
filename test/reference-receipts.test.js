"use strict";
const {
  createContextHost,
} = require("../examples/reference-wallet/host/context.cjs");
const {
  createReceiptReader,
} = require("../examples/reference-wallet/host/receipts.cjs");
const { Transaction, SigningKey, computeAddress } = require("ethers");
// Public deterministic test key; never a funded wallet.
const key = new SigningKey("0x" + "1".repeat(64));
const base = Transaction.from({
  type: 0,
  chainId: 11155111n,
  nonce: 0,
  to: "0x" + "c".repeat(40),
  value: 0n,
  data: "0x",
  gasLimit: 512n,
  gasPrice: 2n,
});
base.signature = key.sign(base.unsignedHash);
const hash = base.hash,
  principal = computeAddress(key).toLowerCase(),
  blockHash = "0x" + "b".repeat(64);
function fixture({
  archive = false,
  maxGasFee = 2000000000000000n,
  nonce = 0,
} = {}) {
  const signed = Transaction.from({
    type: 0,
    chainId: 11155111n,
    nonce,
    to: base.to,
    value: 0n,
    data: "0x",
    gasLimit: 512n,
    gasPrice: 2n,
  });
  signed.signature = key.sign(signed.unsignedHash);
  const hash = signed.hash;
  const context = createContextHost(),
    lifetime = new AbortController();
  const parent = context.createPrivacyScope({
    profileId: "receipt-fixture",
    signal: lifetime.signal,
  });
  const resolution = { outcome: "matched", finalizedBlockNumber: 25 };
  const observation = { status: "included", blockNumber: 20, blockHash };
  const record = {
    hash,
    nonce,
    intent: { kind: "railgun-transact" },
    observation,
    resolution: { railgun: resolution },
  };
  const snapshot = archive
    ? {
        records: [],
        archive: [
          {
            hash,
            nonce,
            intent: record.intent,
            ...observation,
            railgun: resolution,
          },
        ],
      }
    : { records: [record], archive: [] };
  const receipt = {
    transactionHash: hash,
    status: "0x1",
    blockHash,
    blockNumber: "0x14",
    gasUsed: "0x100",
    effectiveGasPrice: "0x2",
  };
  const transaction = {
    hash,
    from: principal,
    nonce: "0x" + nonce.toString(16),
    chainId: "0xaa36a7",
    type: "0x0",
    blockHash,
    blockNumber: "0x14",
    gas: "0x200",
    gasPrice: "0x2",
    to: base.to,
    value: "0x0",
    input: "0x",
    r: signed.signature.r,
    s: signed.signature.s,
    v: "0x" + (22310257n + BigInt(signed.signature.yParity)).toString(16),
  };
  const f = { snapshot, record, receipt, transaction, lifetime, hash };
  f.read = jest.fn(async (handle) => {
    context.getPrivacyContext(handle);
    return snapshot;
  });
  f.reply = ({ method }) =>
    method === "eth_chainId"
      ? "0xaa36a7"
      : method === "eth_getTransactionByHash"
        ? transaction
        : receipt;
  f.request = jest.fn(async (handle, _url, options) => {
    context.getPrivacyContext(handle);
    const input = JSON.parse(options.body);
    return {
      status: 200,
      body: Buffer.from(
        JSON.stringify({
          jsonrpc: "2.0",
          id: input.id,
          result: f.reply(input),
        }),
      ),
    };
  });
  f.close = jest.fn();
  f.closed = Promise.resolve();
  f.transport = jest.fn(() => ({
    request: f.request,
    close: f.close,
    get closed() {
      return f.closed;
    },
  }));
  f.review = jest.fn(async () => true);
  const endpoint = { signal: lifetime.signal };
  f.run = createReceiptReader({
    context,
    sessions: { openPrivacySession: () => parent },
    submissionJournal: { readExistingPrivateSubmissionSnapshot: f.read },
    submitter: { readMetadata: () => ({ address: principal }) },
    transport: { createWalletTorTransport: f.transport },
    rpcUrl: "https://synthetic.invalid/rpc",
    maxGasFee,
    tor: { getWalletSocksEndpoint: () => endpoint },
  });
  f.cleanup = () => parent.close();
  return f;
}
test.each([false, true])(
  "accounts actual gas from own authenticated %s archive selection",
  async (archive) => {
    const f = fixture({ archive });
    try {
      const result = await f.run(hash, f.review);
      expect(result).toMatchObject({
        gasFee: 512n,
        gasUsed: 256n,
        trust: "unverified-rpc",
        spendingEnabled: false,
      });
      expect(
        f.request.mock.calls.map((x) => JSON.parse(x[2].body).method),
      ).toEqual([
        "eth_chainId",
        "eth_getTransactionReceipt",
        "eth_getTransactionByHash",
      ]);
      expect(f.read).toHaveBeenCalledTimes(3);
      expect(f.close).toHaveBeenCalledTimes(1);
      expect(f.review.mock.calls[0][0]).toMatchObject({
        transactionHash: hash,
        endpoint: "https://synthetic.invalid/rpc",
      });
    } finally {
      f.cleanup();
    }
  },
);
test.each([
  "foreign",
  "unresolved",
  "reverted",
  "behind",
  "duplicate",
  "not-railgun",
])("rejects %s journal evidence before disclosure/network", async (kind) => {
  const f = fixture();
  try {
    if (kind === "foreign") f.record.hash = "0x" + "d".repeat(64);
    if (kind === "unresolved") delete f.record.resolution;
    if (kind === "reverted") f.record.observation.status = "reverted";
    if (kind === "behind")
      f.record.resolution.railgun.finalizedBlockNumber = 19;
    if (kind === "duplicate") f.snapshot.records.push({ ...f.record });
    if (kind === "not-railgun") f.record.intent.kind = "other";
    await expect(f.run(hash, f.review)).rejects.toMatchObject({
      code: "REFERENCE_RECEIPT_REFUSED",
    });
    expect(f.review).not.toHaveBeenCalled();
    expect(f.transport).not.toHaveBeenCalled();
  } finally {
    f.cleanup();
  }
});
test.each([
  ["transactionHash", "0x" + "d".repeat(64)],
  ["status", "0x0"],
  ["blockHash", "0x" + "e".repeat(64)],
  ["blockNumber", "0x15"],
  ["blockNumber", "0x014"],
  ["gasUsed", "0x0"],
  ["gasUsed", "-1"],
  ["gasUsed", 1],
  ["effectiveGasPrice", undefined],
  ["effectiveGasPrice", "0x10000000000000"],
])("refuses receipt %s=%s without gas estimation", async (key, value) => {
  const f = fixture();
  try {
    f.receipt[key] = value;
    await expect(f.run(hash, f.review)).rejects.toMatchObject({
      code: "REFERENCE_RECEIPT_REFUSED",
    });
    expect(f.request).toHaveBeenCalledTimes(
      (key === "gasUsed" && value === "0x0") ||
        (key === "effectiveGasPrice" && value === "0x10000000000000")
        ? 3
        : 2,
    );
    expect(f.close).toHaveBeenCalledTimes(1);
  } finally {
    f.cleanup();
  }
});
test("declined consent, or expired session during consent, dispatches nothing", async () => {
  for (const revoke of [false, true]) {
    const f = fixture();
    try {
      f.review.mockImplementation(async () => {
        if (revoke) f.lifetime.abort();
        return revoke;
      });
      await expect(f.run(hash, f.review)).rejects.toBeDefined();
      expect(f.transport).not.toHaveBeenCalled();
    } finally {
      f.cleanup();
    }
  }
});
test("journal change at final read refuses", async () => {
  const f = fixture();
  try {
    f.read
      .mockImplementationOnce(async () => f.snapshot)
      .mockImplementationOnce(async () => f.snapshot)
      .mockImplementationOnce(async () => {
        f.record.resolution.reviewedAt = 1;
        return f.snapshot;
      });
    await expect(f.run(hash, f.review)).rejects.toBeDefined();
  } finally {
    f.cleanup();
  }
});
test("awaits original transport drain and checks lifetime after cleanup", async () => {
  const f = fixture();
  let release;
  f.closed = new Promise((resolve) => {
    release = resolve;
  });
  try {
    let settled = false;
    const task = f.run(hash, f.review).then(
      () => {
        settled = true;
      },
      (error) => {
        settled = true;
        throw error;
      },
    );
    while (!f.close.mock.calls.length)
      await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    f.lifetime.abort();
    release();
    await expect(task).rejects.toBeDefined();
  } finally {
    release();
    f.cleanup();
  }
});
test("retains transport failure when drainage also fails", async () => {
  const f = fixture(),
    primary = Object.assign(Error("primary"), { code: "TOR_REQUEST_FAILED" });
  try {
    f.request.mockRejectedValue(primary);
    f.close.mockImplementation(() => {
      throw Error("cleanup");
    });
    await expect(f.run(hash, f.review)).rejects.toBe(primary);
  } finally {
    f.cleanup();
  }
});
test.each(["null", "wrong-chain", "bad-envelope"])(
  "refuses %s public result",
  async (mode) => {
    const f = fixture();
    try {
      if (mode === "null") f.reply = () => null;
      if (mode === "wrong-chain") f.reply = () => "0x1";
      if (mode === "bad-envelope")
        f.request.mockResolvedValue({
          status: 200,
          body: Buffer.from(
            '{"jsonrpc":"2.0","id":"other","result":"0xaa36a7"}',
          ),
        });
      await expect(f.run(hash, f.review)).rejects.toMatchObject({
        code:
          mode === "bad-envelope"
            ? "PRIVATE_RPC_INVALID"
            : "PRIVATE_CHAIN_MISMATCH",
      });
    } finally {
      f.cleanup();
    }
  },
);
test("resolved reverted transactions account gas; a lowered current ceiling is informational", async () => {
  const f = fixture({ maxGasFee: 1n });
  try {
    f.record.observation.status = "reverted";
    f.record.resolution.railgun.outcome = "reverted";
    f.receipt.status = "0x0";
    const result = await f.run(hash, f.review);
    expect(result).toMatchObject({
      receiptStatus: "0x0",
      gasFee: 512n,
      withinCurrentGasPolicy: false,
    });
  } finally {
    f.cleanup();
  }
});
test.each([
  ["nonce", "0x1"],
  ["from", "0x" + "d".repeat(40)],
  ["gas", "0xff"],
  ["gasPrice", "0x1"],
  ["chainId", "0x1"],
  ["type", "0x2"],
  ["hash", "0x" + "e".repeat(64)],
])("refuses transaction %s mismatch", async (key, value) => {
  const f = fixture();
  try {
    f.transaction[key] = value;
    await expect(f.run(hash, f.review)).rejects.toMatchObject({
      code: "REFERENCE_RECEIPT_REFUSED",
    });
  } finally {
    f.cleanup();
  }
});
test("human review time does not consume the subsequent network deadline", async () => {
  jest.useFakeTimers();
  const f = fixture();
  try {
    f.review.mockImplementation(async () => {
      await jest.advanceTimersByTimeAsync(45000);
      return true;
    });
    const result = await f.run(hash, f.review);
    expect(result.gasFee).toBe(512n);
  } finally {
    f.cleanup();
    jest.useRealTimers();
  }
});
test.each(["r", "s", "v", "to", "input", "value", "gas", "gasPrice"])(
  "rejects forged signed transaction field %s",
  async (key) => {
    const f = fixture();
    try {
      const overrides = {
        r: "0x" + "1".repeat(64),
        s: "0x" + "2".repeat(64),
        v: "0x1b",
        to: "0x" + "e".repeat(40),
        input: "0x12",
        value: "0x1",
        gas: "0x300",
        gasPrice: "0x3",
      };
      f.transaction[key] = overrides[key];
      await expect(f.run(hash, f.review)).rejects.toMatchObject({
        code: "REFERENCE_RECEIPT_REFUSED",
      });
    } finally {
      f.cleanup();
    }
  },
);
test("derives the authenticated chain from the legacy signature when RPC omits chainId", async () => {
  const f = fixture();
  try {
    delete f.transaction.chainId;
    expect((await f.run(hash, f.review)).transactionHashVerified).toBe(true);
  } finally {
    f.cleanup();
  }
});
test.each(["r", "s"])(
  "accepts genuine minimally encoded %s with leading zero bytes",
  async (field) => {
    let f;
    for (let nonce = 0; nonce < 100; nonce++) {
      const candidate = fixture({ nonce });
      if (BigInt(candidate.transaction[field]).toString(16).length < 64) {
        f = candidate;
        break;
      }
      candidate.cleanup();
    }
    expect(f).toBeDefined();
    try {
      f.transaction.r = "0x" + BigInt(f.transaction.r).toString(16);
      f.transaction.s = "0x" + BigInt(f.transaction.s).toString(16);
      expect((await f.run(f.hash, f.review)).transactionHashVerified).toBe(
        true,
      );
    } finally {
      f.cleanup();
    }
  },
);
test("non-string sender refuses with the closed code", async () => {
  const f = fixture();
  try {
    f.transaction.from = 42;
    await expect(f.run(hash, f.review)).rejects.toMatchObject({
      code: "REFERENCE_RECEIPT_REFUSED",
    });
  } finally {
    f.cleanup();
  }
});
