"use strict";
// Unit seam only: real owner-authority admission is exercised by the native
// installed-account lineage, not inferred from these service lifecycle tests.
jest.mock("@freedom/railgun-kohaku-adapter/host/owner-authority", () => ({
  assertRailgunPrivateSubmission: jest.fn(),
  assertRailgunShieldSubmission: jest.fn(),
}));
const authority = require("@freedom/railgun-kohaku-adapter/host/owner-authority");
const { Wallet, Transaction } = require("ethers");
const {
  createTransactionHost,
} = require("../examples/reference-wallet/host/transactions.cjs");
const {
  createTransactionNetworkHost,
} = require("../examples/reference-wallet/host/transaction-network.cjs");
const {
  transactionIntent,
} = require("../examples/reference-wallet/host/intent.cjs");
const { fixture } = require("./fixtures/railgun-journal-transact-data");
function setup() {
  const controller = new AbortController(),
    wallet = new Wallet(`0x${"1".repeat(64)}`);
  const tx = fixture(false).transaction();
  const params = {
    ...tx,
    from: wallet.address,
    gasLimit: "1500000",
    gasPrice: "1000000",
  };
  const intent = transactionIntent("railgun-transact", params);
  const network = {
    signal: controller.signal,
    assertActive() {
      if (controller.signal.aborted)
        throw Object.assign(Error("locked"), {
          code: "PRIVACY_REQUEST_ABORTED",
        });
    },
    assertSigner: jest.fn(),
    initialize: jest.fn(async () => {}),
    assertCanSubmit: jest.fn(async () => {}),
    request: jest.fn(async () => ({ result: "0x3" })),
    selectNonce: jest.fn(async (value) => value),
    getFeeQuote: jest.fn(async () => ({ gasPrice: "1000000" })),
    broadcastRawTransaction: jest.fn(async (_chain, raw) => ({
      result: Transaction.from(raw).hash,
      source: "direct",
    })),
  };
  const lease = {
    assertActive: () => network.assertActive(),
    release: jest.fn(),
  };
  const host = createTransactionHost({
    transactionNetwork: {
      getPrivateTransactionNetwork: () => network,
      assertSignedIntent: createTransactionNetworkHost({
        context: {},
        rpc: {},
        submissionJournal: {},
      }).assertSignedIntent,
    },
    leases: { acquireSubmissionLease: () => lease },
  });
  const signer = {
    getAddress: jest.fn(async () => wallet.address),
    signTransaction: jest.fn((value) => wallet.signTransaction(value)),
  };
  const review = jest.fn(async () => true),
    options = { privacyContext: {}, intent, review };
  return { host, network, lease, params, options, signer, wallet, controller };
}
beforeEach(() => jest.clearAllMocks());
test("review binds populated nonce/fee transaction and send uses that exact signed transaction", async () => {
  const f = setup();
  const result = await f.host.signAndSendTransaction(
    f.params,
    f.signer,
    f.options,
  );
  const review = f.options.review.mock.calls[0][0];
  expect(Object.isFrozen(review.transaction)).toBe(true);
  expect(review.transaction.nonce).toBe(3);
  const raw = f.network.broadcastRawTransaction.mock.calls[0][1];
  expect(Transaction.from(raw).unsignedSerialized).toBe(
    review.unsignedSerialized,
  );
  expect(result.hash).toBe(Transaction.from(raw).hash);
  expect(Object.keys(result).sort()).toEqual(
    [
      "hash",
      "nonce",
      "from",
      "to",
      "value",
      "chainId",
      "broadcastSource",
      "explorerUrl",
    ].sort(),
  );
  expect(result.explorerUrl).toBeNull();
  expect(authority.assertRailgunPrivateSubmission).toHaveBeenCalledTimes(2);
  expect(f.lease.release).toHaveBeenCalledTimes(1);
});
test("denied owner authority fails before journal initialization or signer access", async () => {
  const f = setup();
  authority.assertRailgunPrivateSubmission.mockImplementationOnce(() => {
    throw Error("not admitted");
  });
  await expect(
    f.host.signAndSendTransaction(f.params, f.signer, f.options),
  ).rejects.toThrow();
  expect(f.signer.getAddress).not.toHaveBeenCalled();
  expect(f.network.initialize).not.toHaveBeenCalled();
});
test("rejected review and remote-broadcast signer cannot sign or send", async () => {
  const f = setup();
  f.options.review.mockResolvedValue(false);
  await expect(
    f.host.signAndSendTransaction(f.params, f.signer, f.options),
  ).rejects.toMatchObject({ code: "PRIVATE_REVIEW_REJECTED" });
  expect(f.signer.signTransaction).not.toHaveBeenCalled();
  expect(f.network.broadcastRawTransaction).not.toHaveBeenCalled();
  f.signer.sendTransaction = jest.fn();
  await expect(
    f.host.signAndSendTransaction(f.params, f.signer, f.options),
  ).rejects.toThrow();
  expect(f.signer.sendTransaction).not.toHaveBeenCalled();
});
test("late review after vault lock is observed but can never sign", async () => {
  const f = setup();
  let release, started;
  const admitted = new Promise((resolve) => {
    started = resolve;
  });
  f.options.review.mockImplementation(() => {
    started();
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const work = f.host.signAndSendTransaction(f.params, f.signer, f.options);
  const assertion = expect(work).rejects.toMatchObject({
    code: "PRIVACY_REQUEST_ABORTED",
  });
  await admitted;
  f.controller.abort();
  await assertion;
  release(true);
  await new Promise((resolve) => setImmediate(resolve));
  expect(f.signer.signTransaction).not.toHaveBeenCalled();
  expect(f.network.broadcastRawTransaction).not.toHaveBeenCalled();
  expect(f.lease.release).toHaveBeenCalledTimes(1);
});
test("signer substitution is refused and original uncertain send error is preserved", async () => {
  const f = setup();
  f.signer.signTransaction.mockImplementation((value) =>
    f.wallet.signTransaction({ ...value, nonce: 4 }),
  );
  await expect(
    f.host.signAndSendTransaction(f.params, f.signer, f.options),
  ).rejects.toMatchObject({ code: "PRIVATE_SIGNED_INTENT_MISMATCH" });
  expect(f.network.broadcastRawTransaction).not.toHaveBeenCalled();
  f.signer.signTransaction.mockImplementation((value) =>
    f.wallet.signTransaction(value),
  );
  const uncertain = Object.assign(Error("unknown"), {
    code: "PRIVATE_BROADCAST_UNCERTAIN",
    transactionHash: `0x${"a".repeat(64)}`,
  });
  f.network.broadcastRawTransaction.mockRejectedValue(uncertain);
  await expect(
    f.host.signAndSendTransaction(f.params, f.signer, f.options),
  ).rejects.toBe(uncertain);
  expect(f.network.broadcastRawTransaction).toHaveBeenCalledTimes(1);
});
test("authority revoked during review refuses before signing", async () => {
  const f = setup();
  f.options.review.mockImplementation(async () => {
    authority.assertRailgunPrivateSubmission.mockImplementationOnce(() => {
      throw Error("revoked");
    });
    return true;
  });
  await expect(
    f.host.signAndSendTransaction(f.params, f.signer, f.options),
  ).rejects.toThrow();
  expect(f.signer.signTransaction).not.toHaveBeenCalled();
  expect(f.network.broadcastRawTransaction).not.toHaveBeenCalled();
});
test("a signature arriving after review expiry is observed and never broadcast", async () => {
  const f = setup();
  let finish, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  f.options.reviewTimeoutMs = 30;
  f.signer.signTransaction.mockImplementation((value) => {
    entered();
    return new Promise((resolve) => {
      finish = async () => resolve(await f.wallet.signTransaction(value));
    });
  });
  const work = f.host.signAndSendTransaction(f.params, f.signer, f.options);
  const refusal = expect(work).rejects.toMatchObject({
    code: "PRIVACY_REQUEST_ABORTED",
  });
  await started;
  await refusal;
  await finish();
  await new Promise((resolve) => setImmediate(resolve));
  expect(f.network.broadcastRawTransaction).not.toHaveBeenCalled();
  expect(f.lease.release).toHaveBeenCalledTimes(1);
});
