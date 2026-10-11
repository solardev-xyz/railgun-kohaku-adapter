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

async function shieldNetworkFixture() {
  const wallet = new Wallet(`0x${'2'.repeat(64)}`);
  const prepared = require('./fixtures/railgun-journal-shield-prepared.json');
  const tx = { chainId: 11155111, from: wallet.address, to: prepared.to, value: prepared.value,
    data: prepared.data, gasLimit: '1500000', gasPrice: '1000000', nonce: 0, type: 0 };
  const signed = await wallet.signTransaction(tx);
  const controller = new AbortController();
  const journal = { initialize: jest.fn(async () => {}), assertCanSubmit: jest.fn(async () => {}),
    list: jest.fn(async () => []), has: jest.fn(async () => false), begin: jest.fn(async () => {}),
    markSubmitted: jest.fn(async () => {}) };
  const rpc = { signal: controller.signal, assertActive() {}, ready: jest.fn(async () => {}),
    request: jest.fn(async (_method, _params, _validate, _signal, admission) => {
      expect(admission).toEqual({ admissionDeadline: 50000 });
      return { result: Transaction.from(signed).hash };
    }) };
  const handle = {};
  const host = createTransactionNetworkHost({
    context: { getPrivacyContext: () => ({ subject: { principal: wallet.address.toLowerCase(), chainId: 11155111 } }) },
    rpc: { createPrivateRpc: () => rpc }, submissionJournal: { getPrivateSubmissionJournal: () => journal },
  });
  const network = host.getPrivateTransactionNetwork(handle);
  return { network, rpc, journal, signed, intent: transactionIntent('railgun-native-shield', tx) };
}
test.each(['before-journal', 'after-journal', 'current'])(
  'Shield authority is rechecked at each send boundary: %s', async phase => {
    let now = 0;
    authority.assertRailgunShieldSubmission.mockImplementation(() => {
      if (now >= 50000) throw Error('expired owner authority');
      return { admissionDeadline: 50000 };
    });
    const f = await shieldNetworkFixture();
    if (phase === 'before-journal') f.rpc.ready.mockImplementation(async () => { now = 50000; });
    if (phase === 'after-journal') f.journal.begin.mockImplementation(async () => { now = 50000; });
    const work = f.network.broadcastRawTransaction(11155111, f.signed, { intent: f.intent });
    if (phase === 'current') {
      await expect(work).resolves.toHaveProperty('result');
      expect(f.rpc.request).toHaveBeenCalledTimes(1);
      expect(authority.assertRailgunShieldSubmission).toHaveBeenCalledTimes(3);
    } else {
      if (phase === 'after-journal') await expect(work).rejects.toMatchObject({ code: 'PRIVATE_BROADCAST_UNCERTAIN' });
      else await expect(work).rejects.toThrow('expired owner authority');
      expect(f.journal.begin).toHaveBeenCalledTimes(phase === 'after-journal' ? 1 : 0);
      expect(f.rpc.request).not.toHaveBeenCalled();
    }
    authority.assertRailgunShieldSubmission.mockReset();
  }
);

test("fee and pending nonce overlap but nonce selection, review and signing wait for both", async () => {
  const f = setup();
  delete f.params.gasPrice;
  let quote, nonce;
  f.network.getFeeQuote.mockImplementation(() => new Promise(resolve => { quote = resolve; }));
  f.network.request.mockImplementation(() => new Promise(resolve => { nonce = resolve; }));
  const work = f.host.signAndSendTransaction(f.params, f.signer, f.options);
  await new Promise(resolve => setImmediate(resolve));
  expect(typeof quote).toBe("function"); expect(typeof nonce).toBe("function");
  nonce({ result: "0x3" }); await new Promise(resolve => setImmediate(resolve));
  expect(f.network.selectNonce).not.toHaveBeenCalled(); expect(f.options.review).not.toHaveBeenCalled();
  quote({ gasPrice: "1000000" }); await work;
  expect(f.network.selectNonce).toHaveBeenCalledTimes(1);
  expect(f.signer.signTransaction).toHaveBeenCalledTimes(1);
});
test("fee failure drains pending nonce before releasing lease and never selects or signs", async () => {
  const f = setup(); delete f.params.gasPrice;
  let nonce, settled = false;
  f.network.getFeeQuote.mockRejectedValue(Error("fee unavailable"));
  f.network.request.mockImplementation(() => new Promise(resolve => { nonce = resolve; }));
  const work = f.host.signAndSendTransaction(f.params, f.signer, f.options);
  work.catch(() => { settled = true; });
  const checked = expect(work).rejects.toThrow();
  await new Promise(resolve => setImmediate(resolve));
  expect(settled).toBe(false); expect(f.lease.release).not.toHaveBeenCalled();
  nonce({ result: "0x3" }); await checked;
  expect(f.lease.release).toHaveBeenCalledTimes(1);
  expect(f.network.selectNonce).not.toHaveBeenCalled(); expect(f.signer.signTransaction).not.toHaveBeenCalled();
  expect(f.network.broadcastRawTransaction).not.toHaveBeenCalled();
});
test("nonce failure drains the quote and cannot select, sign or send", async () => {
  const f = setup(); delete f.params.gasPrice;
  let quote;
  f.network.getFeeQuote.mockImplementation(() => new Promise(resolve => { quote = resolve; }));
  f.network.request.mockRejectedValue(Error("nonce unavailable"));
  const work = f.host.signAndSendTransaction(f.params, f.signer, f.options);
  const checked = expect(work).rejects.toThrow();
  await new Promise(resolve => setImmediate(resolve));
  expect(f.lease.release).not.toHaveBeenCalled();
  quote({ gasPrice: "1000000" }); await checked;
  expect(f.network.selectNonce).not.toHaveBeenCalled();
  expect(f.signer.signTransaction).not.toHaveBeenCalled();
  expect(f.network.broadcastRawTransaction).not.toHaveBeenCalled();
});
test.each(["0", "-1"])("supplied gas price %s refuses before fee/nonce reads", async gasPrice => {
  const f = setup(); f.params.gasPrice = gasPrice;
  await expect(f.host.signAndSendTransaction(f.params, f.signer, f.options)).rejects.toThrow();
  expect(f.network.request).not.toHaveBeenCalled();
  expect(f.network.getFeeQuote).not.toHaveBeenCalled();
  expect(f.network.selectNonce).not.toHaveBeenCalled();
});
