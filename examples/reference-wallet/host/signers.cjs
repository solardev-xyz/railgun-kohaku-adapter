"use strict";
const { HDNodeWallet, Transaction } = require("ethers");
const { profileId } = require("./inventory.cjs");
const { privacyError } = require("./errors.cjs");
/** One mnemonic EOA at the standard Ethereum account-zero path. No provider,
 * sendTransaction, arbitrary path or private-key export is exposed to owners. */
function createSignerHost({ vault, profiles }) {
  let retained;
  function active(signal) {
    if (
      vault.currentSession() !== signal ||
      signal.aborted ||
      profileId(profiles.getActiveProfile()) !== profileId(vault.profile)
    )
      throw privacyError(
        "PRIVATE_SIGNER_UNAVAILABLE",
        "Reference signer is locked or changed",
      );
  }
  function withWallet(signal, consume) {
    active(signal);
    let result;
    vault.withSeed((seed) => {
      const wallet = HDNodeWallet.fromSeed(seed).derivePath("m/44'/60'/0'/0/0");
      // ethers represents keys as immutable JS strings. This host does not claim
      // complete heap erasure; the wallet has no provider and is never retained.
      result = consume(wallet);
      active(signal);
    });
    return result;
  }
  function getSigner(index) {
    if (index !== 0)
      throw privacyError(
        "PRIVATE_SIGNER_UNAVAILABLE",
        "Unsupported signer index",
      );
    const signal = vault.currentSession();
    active(signal);
    if (retained?.signal === signal) return retained.signer;
    const address = withWallet(signal, (wallet) => wallet.address);
    const signer = Object.freeze({
      async getAddress() {
        active(signal);
        return address;
      },
      async signTransaction(value) {
        active(signal);
        const tx = Transaction.from(value);
        if (tx.chainId !== 11155111n || tx.isSigned())
          throw privacyError(
            "PRIVATE_SIGNED_TX_INVALID",
            "Unsupported signing request",
          );
        const signed = withWallet(signal, (wallet) => {
          tx.signature = wallet.signingKey.sign(tx.unsignedHash);
          return tx.serialized;
        });
        active(signal);
        return signed;
      },
    });
    retained = { signal, signer, address };
    return signer;
  }
  function readMetadata() {
    getSigner(0);
    return Object.freeze({
      index: 0,
      type: "mnemonic",
      // Custody records and retained-operation recovery use canonical lowercase
      // public metadata. The signer may still return ethers' checksum address.
      address: retained.address.toLowerCase(),
    });
  }
  return Object.freeze({
    signers: Object.freeze({ getSigner }),
    submitter: Object.freeze({ readMetadata }),
  });
}
module.exports = { createSignerHost };
