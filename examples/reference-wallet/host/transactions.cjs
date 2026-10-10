"use strict";
const { Transaction } = require("ethers");
const { validIntent } = require("./intent.cjs");
const { privacyError } = require("./errors.cjs");
// The original callback remains observed after cancellation. A later result
// cannot resume signing/broadcast or replace the cancelled caller's outcome.
function step(callback, network, signal = network.signal) {
  network.assertActive();
  return new Promise((resolve, reject) => {
    let done = false;
    function finish(ok, value) {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", abort);
      if (ok) resolve(value);
      else reject(value);
    }
    const abort = () =>
      finish(
        false,
        privacyError(
          "PRIVACY_REQUEST_ABORTED",
          "Private transaction cancelled",
        ),
      );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    Promise.resolve()
      .then(() => {
        network.assertActive();
        if (signal.aborted)
          throw privacyError(
            "PRIVACY_REQUEST_ABORTED",
            "Private transaction cancelled",
          );
        return callback();
      })
      .then((value) => {
        network.assertActive();
        finish(true, value);
      })
      .catch((error) => finish(false, error));
  });
}
/** Railgun-only transaction service. Fee/value consent belongs to the owner's
 * review of the exact populated transaction; journal admission belongs to the
 * transaction network. This service supplies no alternative broadcast route. */
function createTransactionHost({ transactionNetwork, leases }) {
  async function signAndSendTransaction(params, signer, options = {}) {
    params = { ...params };
    options = { ...options, intent: Object.freeze({ ...options.intent }) };
    const { privacyContext, intent, review } = options;
    if (
      !privacyContext ||
      !validIntent(intent) ||
      typeof review !== "function" ||
      typeof signer?.signTransaction !== "function" ||
      typeof signer?.getAddress !== "function" ||
      typeof signer.sendTransaction === "function"
    )
      throw privacyError(
        "PRIVATE_REVIEW_REQUIRED",
        "A local signer and classified owner review are required",
      );
    const authority = require("@freedom/railgun-kohaku-adapter/host/owner-authority");
    const assertAdmitted = () =>
      (intent.kind === "railgun-transact"
        ? authority.assertRailgunPrivateSubmission
        : authority.assertRailgunShieldSubmission)(privacyContext, intent);
    assertAdmitted();
    const network =
      transactionNetwork.getPrivateTransactionNetwork(privacyContext);
    let lease;
    try {
      const from = await step(() => signer.getAddress(), network);
      network.assertSigner(from);
      await network.initialize();
      lease = leases.acquireSubmissionLease({
        chainId: params.chainId,
        from,
        privacyContext,
      });
      await network.assertCanSubmit();
      let fees;
      if (params.maxFeePerGas != null || params.maxPriorityFeePerGas != null) {
        if (
          params.maxFeePerGas == null ||
          params.maxPriorityFeePerGas == null ||
          params.gasPrice != null ||
          BigInt(params.maxFeePerGas) <= 0n ||
          BigInt(params.maxPriorityFeePerGas) < 0n ||
          BigInt(params.maxPriorityFeePerGas) > BigInt(params.maxFeePerGas)
        )
          throw privacyError("PRIVATE_FEE_INVALID", "Invalid fee selection");
        fees = {
          type: 2,
          maxFeePerGas: params.maxFeePerGas,
          maxPriorityFeePerGas: params.maxPriorityFeePerGas,
        };
      } else {
        const gasPrice =
          params.gasPrice ??
          (await network.getFeeQuote(params.chainId)).gasPrice;
        if (BigInt(gasPrice) <= 0n)
          throw privacyError("PRIVATE_FEE_INVALID", "Invalid fee selection");
        fees = { type: 0, gasPrice };
      }
      lease.assertActive();
      const pending = await network.request(
        params.chainId,
        "eth_getTransactionCount",
        [from, "pending"],
      );
      const nonce = await network.selectNonce(Number(BigInt(pending.result)));
      const tx = Object.freeze({
        to: params.to,
        value: params.value ?? "0",
        data: params.data ?? "0x",
        gasLimit: params.gasLimit,
        chainId: params.chainId,
        nonce,
        ...fees,
      });
      // Normalize now; malformed quantities must never reach the review callback.
      const unsignedSerialized = Transaction.from(tx).unsignedSerialized;
      let reviewMs = options.reviewTimeoutMs ?? 120000;
      if (
        !Number.isSafeInteger(reviewMs) ||
        reviewMs < 1 ||
        reviewMs > 120000 ||
        (options.reviewExpiresAt !== undefined &&
          !Number.isSafeInteger(options.reviewExpiresAt))
      )
        throw privacyError("PRIVATE_REVIEW_INVALID", "Invalid review lifetime");
      if (options.reviewExpiresAt !== undefined)
        reviewMs = Math.min(reviewMs, options.reviewExpiresAt - Date.now());
      if (reviewMs <= 0)
        throw privacyError("PRIVATE_REVIEW_EXPIRED", "Review expired");
      const expiresAt = Date.now() + reviewMs,
        deadline = new AbortController(),
        timer = setTimeout(() => deadline.abort(), reviewMs);
      timer.unref();
      const signal = AbortSignal.any([network.signal, deadline.signal]);
      let signed;
      try {
        if (
          (await step(
            () =>
              review(
                Object.freeze({
                  transaction: tx,
                  from,
                  expiresAt,
                  unsignedSerialized,
                }),
              ),
            network,
            signal,
          )) !== true
        )
          throw privacyError(
            "PRIVATE_REVIEW_REJECTED",
            "Transaction was not approved",
          );
        assertAdmitted();
        signed = await step(() => signer.signTransaction(tx), network, signal);
        if (signal.aborted || Date.now() >= expiresAt)
          throw privacyError("PRIVATE_REVIEW_EXPIRED", "Review expired");
        transactionNetwork.assertSignedIntent(signed, tx);
      } finally {
        clearTimeout(timer);
      }
      lease.assertActive();
      const parsed = Transaction.from(signed);
      const response = await network.broadcastRawTransaction(
        params.chainId,
        signed,
        { expiresAt, intent },
      );
      return Object.freeze({
        hash: response.result,
        nonce: parsed.nonce,
        from: parsed.from,
        to: parsed.to,
        value: parsed.value.toString(),
        chainId: params.chainId,
        broadcastSource: response.source,
        explorerUrl: null,
      });
    } catch (error) {
      if (/^(PRIVATE_|PRIVACY_|TOR_)/.test(error?.code)) throw error;
      throw privacyError(
        "PRIVATE_TRANSACTION_FAILED",
        "Private transaction failed",
      );
    } finally {
      lease?.release();
    }
  }
  return Object.freeze({ signAndSendTransaction });
}
module.exports = { createTransactionHost };
