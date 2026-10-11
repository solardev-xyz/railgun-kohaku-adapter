"use strict";
const { createHash } = require("node:crypto");
/** Render only the declared review projection. Never print raw transaction
 * bytes, proofs, capsules or arbitrary errors. Consent remains with the original
 * owner callback and its cancellation/deadline; the app issues no receipts. */
function createReviews(terminal) {
  const render = (value) =>
    JSON.stringify(
      value,
      (_key, item) => (typeof item === "bigint" ? item.toString() : item),
      2,
    );
  function preparation(summary, { signal }) {
    return terminal.confirm(
      render({
        action: summary.operation,
        chainId: summary.chainId,
        asset: summary.asset,
        amount: summary.amount,
        recipient: summary.recipient,
        funding: summary.funding?.address ?? summary.submitter,
        inputType: summary.inputType,
        noteId: summary.selection?.noteId,
        noteValue: summary.noteValue,
        protocolFee: summary.protocolFee,
        destinations: summary.destinations,
        exposures: summary.exposures,
        recipientRelationship: summary.recipientRelationship,
        foreignOutputPoiDisclosure: summary.foreignOutputPoiDisclosure,
        chainStateVerified: summary.chainStateVerified,
        consequence:
          "Preparation may persist an unsent operation. Broadcast needs a separate review.",
      }),
      "PREPARE",
      signal,
    );
  }
  async function transaction(summary, { signal }) {
    const remaining = summary.expiresAt - Date.now();
    if (
      !Number.isSafeInteger(summary.expiresAt) ||
      remaining <= 0 ||
      remaining > 2147483647 ||
      signal.aborted
    )
      return false;
    const expiry = new AbortController();
    const timer = setTimeout(() => expiry.abort(), remaining);
    try {
      const tx = summary.transaction;
      return await terminal.confirm(
        render({
          action: summary.operation,
          from: summary.from,
          to: tx.to,
          chainId: tx.chainId,
          value: tx.value,
          nonce: tx.nonce,
          gasLimit: tx.gasLimit,
          maxFeePerGas: tx.maxFeePerGas,
          gasPrice: tx.gasPrice,
          maximumGasFee: summary.maxGasFee,
          recipient: summary.recipient,
          amount: summary.amount,
          protocolFee: summary.protocolFee,
          noteValue: summary.noteValue,
          expiresAt: summary.expiresAt,
          unsignedTransactionSha256: createHash("sha256")
            .update(summary.unsignedSerialized)
            .digest("hex"),
          chainStateVerified: summary.chainStateVerified,
          consequence:
            "Sign and broadcast this Sepolia transaction once. An uncertain result requires recovery.",
        }),
        "SEND",
        AbortSignal.any([signal, expiry.signal]),
      );
    } finally {
      clearTimeout(timer);
    }
  }
  function resolution(summary, { signal }) {
    if (
      ![
        "railgun-shield-resolution-v1",
        "railgun-held-submission-resolution-v1",
      ].includes(summary.purpose)
    )
      return false;
    return terminal.confirm(
      render({
        purpose: summary.purpose,
        transactionHash: summary.transactionHash,
        holdId: summary.holdId,
        observation: summary.observation,
        shield: summary.shield,
        transact: summary.transact,
        finalizedBlockNumber: summary.finalizedBlockNumber,
        minimumConfirmations: summary.minimumConfirmations,
        allowsNextTransaction: summary.allowsNextTransaction,
        consequence:
          "Marks this transaction settled in the local journal and permits the next transaction from this address. It does not credit a note; scanning does that.",
      }),
      "RESOLVE",
      signal,
    );
  }
  function disclosure(summary, { signal }) {
    if (
      [
        "railgun-shield-resolution-v1",
        "railgun-held-submission-resolution-v1",
      ].includes(summary.purpose)
    )
      return resolution(summary, { signal });
    return terminal.confirm(
      render({
        purpose: summary.purpose,
        handoff: summary.handoff,
        recipient: summary.recipient,
        submitter: summary.submitter,
        selection: summary.selection,
        requiredList: summary.requiredList,
        originalSpendingSignatureReused:
          summary.originalSpendingSignatureReused,
        newSpendingSignature: summary.newSpendingSignature,
        eoaSigningAndBroadcast: summary.eoaSigningAndBroadcast,
        automaticRetry: summary.automaticRetry,
        disclosureExplanation: summary.disclosureExplanation,
        retryExplanation: summary.retryExplanation,
        listKey: summary.listKey,
        requestIdAllocation: summary.requestIdAllocation,
        uncertaintyCategories: summary.uncertaintyCategories,
        observation: summary.observation,
        shield: summary.shield,
        transact: summary.transact,
        operation: summary.operation,
        holdId: summary.holdId,
        noteId: summary.noteId,
        transactionHash: summary.transactionHash,
        destination: summary.destination,
        endpoint: summary.endpoint,
        endpoints: summary.endpoints,
        destinations: summary.destinations,
        requests: summary.requests,
        exposures: summary.exposures,
        disclosures: summary.disclosures,
        disclosureCategories: summary.disclosureCategories,
        requestInventory: summary.requestInventory,
        finalizedBlockNumber: summary.finalizedBlockNumber,
        minimumConfirmations: summary.minimumConfirmations,
        allowsNextTransaction: summary.allowsNextTransaction,
        consequence:
          "Permit only this disclosed operation. An observation is not proof of delivery or RPC correctness.",
      }),
      "ALLOW",
      signal,
    );
  }
  // Called once by the command before any TXID owner call; the subsequent
  // callback still validates every per-page projection within this consent.
  async function txidConsent(signal) {
    if (
      !(await terminal.confirm(
        "Synchronize using at most 80 public TXID owner calls in this command (up to 10 minutes; failed calls count; up to two transport recoveries, 10 seconds apart). This queries the pinned Sepolia POI node and indexer for public index/root/page data, never a selected note, proof handoff or transaction.",
        "SYNC",
        signal,
      ))
    )
      throw Error("TXID synchronization declined");
    const expires = Date.now() + 10 * 60000;
    let calls = 0;
    return (summary, { signal: reviewSignal }) => {
      if (
        signal.aborted ||
        reviewSignal.aborted ||
        Date.now() >= expires ||
        ++calls > 80 ||
        summary.purpose !==
          "railgun-public-txid-synchronization-disclosure-v1" ||
        summary.chainId !== 11155111 ||
        summary.mode !== "initialize" ||
        summary.maximumAdvancePages !== 1 ||
        summary.selectedMembershipPermitted !== false ||
        summary.selectedNullifierQueryPermitted !== false ||
        summary.signingEnabled !== false ||
        summary.relaySendPermitted !== false
      )
        return false;
      const permitted = {
        latestTxid: "https://ppoi.fdi.network",
        validateTxidRoot: "https://ppoi.fdi.network",
        txidPage:
          "https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql",
      };
      return (
        Array.isArray(summary.queries) &&
        summary.queries.length === 3 &&
        new Set(summary.queries.map((q) => q.method)).size === 3 &&
        summary.queries.every(
          (q) =>
            Object.hasOwn(permitted, q.method) &&
            q.endpoint === permitted[q.method],
        )
      );
    };
  }
  return Object.freeze({
    preparation,
    transaction,
    disclosure,
    resolution,
    txidConsent,
  });
}
module.exports = { createReviews };
