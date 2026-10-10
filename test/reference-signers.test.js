"use strict";
const { HDNodeWallet, Transaction } = require("ethers");
const { pbkdf2Sync } = require("node:crypto");
const {
  createSignerHost,
} = require("../examples/reference-wallet/host/signers.cjs");
const vectors = require("./conformance/credential-vectors.json");
test("fixed EOA matches the standard account-zero path and exposes no broadcaster", async () => {
  const profile = Object.freeze({
      id: "fixture",
      userDataDir: "/public-fixture",
    }),
    controller = new AbortController();
  const vault = {
    profile,
    currentSession: () => controller.signal,
    withSeed(consume) {
      const seed = pbkdf2Sync(vectors.mnemonic, "mnemonic", 2048, 64, "sha512");
      try {
        consume(seed);
      } finally {
        seed.fill(0);
      }
    },
  };
  const host = createSignerHost({
    vault,
    profiles: { getActiveProfile: () => profile },
  });
  const expected = HDNodeWallet.fromPhrase(vectors.mnemonic),
    signer = host.signers.getSigner(0);
  expect(host.submitter.readMetadata()).toEqual({
    index: 0,
    type: "mnemonic",
    address: expected.address.toLowerCase(),
  });
  expect(Object.keys(signer).sort()).toEqual(["getAddress", "signTransaction"]);
  expect(host.submitter.readMetadata().address).toMatch(/^0x[0-9a-f]{40}$/);
  expect(await signer.getAddress()).toBe(expected.address);
  expect(() => host.signers.getSigner(1)).toThrow();
  const tx = {
    chainId: 11155111,
    nonce: 0,
    type: 0,
    to: `0x${"1".repeat(40)}`,
    value: 0,
    gasLimit: 21000,
    gasPrice: 1,
  };
  const signed = await signer.signTransaction(tx),
    parsed = Transaction.from(signed);
  expect(parsed.from).toBe(expected.address);
  expect(parsed.unsignedSerialized).toBe(
    Transaction.from(tx).unsignedSerialized,
  );
  await expect(signer.signTransaction({ ...tx, chainId: 1 })).rejects.toThrow();
  controller.abort();
  await expect(signer.getAddress()).rejects.toThrow();
  await expect(signer.signTransaction(tx)).rejects.toThrow();
});
test("wrong active profile refuses before any seed borrow", () => {
  const profile = { id: "fixture", userDataDir: "/public-fixture" },
    withSeed = jest.fn();
  const host = createSignerHost({
    vault: {
      profile,
      currentSession: () => new AbortController().signal,
      withSeed,
    },
    profiles: { getActiveProfile: () => ({ ...profile, id: "other" }) },
  });
  expect(() => host.submitter.readMetadata()).toThrow();
  expect(withSeed).not.toHaveBeenCalled();
});
