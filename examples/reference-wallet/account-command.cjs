"use strict";
const { createHash } = require("node:crypto");
const { scanAccount } = require("./scan.cjs");
/** Commands own one real account session. Scanning is explicit; reads never
 * trigger a rebuild or retry. Every lane is drained before the session closes. */
async function accountCommand({
  owner,
  maxOperationAmount = 10000000000000000n,
  command,
  cache,
  signal,
  onSession,
  state,
  chain,
  scanCacheDigest,
  deadline,
  confirm,
  reviews,
  noteId,
  holdId,
  transactionHash,
  capsuleDigest,
  recipient,
  amount,
  progress = () => {},
}) {
  if (
    ["scan", "scan-new"].includes(command) &&
    (typeof scanCacheDigest !== "string" ||
      !/^[0-9a-f]{64}$/.test(scanCacheDigest))
  )
    throw new Error("Reference scan compatibility unavailable");
  if (["wallet-rebuild", "scan-new"].includes(command) && !(await confirm()))
    return Object.freeze({ status: "cancelled" });
  const session = await owner[
    command === "account-create" ? "createAccount" : "openAccount"
  ]({
    accountIndex: 0,
    signal,
    ...(command === "scan-new"
      ? { publicCache: "new" }
      : command === "scan" || command.startsWith("shield-")
        ? { publicCache: "recover" }
        : command === "account-info" && cache === "pending"
          ? { publicCache: "pending" }
          : {}),
  });
  onSession(session);
  if (["account-create", "account-info"].includes(command))
    return Object.freeze({ status: "account-opened", ...session.describe() });
  if (["scan", "scan-new"].includes(command)) {
    const identity = createHash("sha256")
      .update(JSON.stringify([scanCacheDigest, session.describe().instanceId]))
      .digest("hex");
    return scanAccount({
      session,
      state,
      anchor: await chain.finalized(),
      identity,
      fresh: command === "scan-new",
      signal,
      deadline,
      progress,
    });
  }
  if (["shield", "pay-note", "unshield-note"].includes(command))
    return require("./payment-command.cjs").paymentCommand({
      maxOperationAmount,
      session,
      command,
      noteId,
      holdId,
      recipient,
      amount,
      signal,
      reviews,
      state,
    });
  if (
    [
      "holds",
      "submit-stored",
      "observe",
      "resolve",
      "poi-status",
      "shield-history",
      "shield-observe",
      "shield-resolve",
    ].includes(command)
  )
    return require("./recovery-command.cjs").recoveryCommand({
      session,
      command,
      holdId,
      transactionHash,
      noteId,
      signal,
      reviews,
    });
  if (
    [
      "poi-prepare-shield",
      "poi-prepare-transact",
      "poi-submit",
      "poi-recover",
    ].includes(command)
  )
    return require("./poi-command.cjs").poiCommand({
      session,
      command,
      holdId,
      capsuleDigest,
      signal,
      reviews,
    });
  if (command === "txid-sync") {
    const review = await reviews.txidConsent(signal);
    return require("./txid-command.cjs").synchronizeTxids({
      session,
      signal,
      review,
      progress,
      deadline: Math.min(deadline, Date.now() + 10 * 60000),
    });
  }
  const wallet = {
    "wallet-rebuild": "new",
    "wallet-resume": "pending",
    "wallet-sync": "advance",
    notes: "active",
    balance: "active",
    address: "active",
  }[command];
  if (!wallet) throw Error("Unsupported account command");
  const lane = await session.openRead({ wallet, signal });
  try {
    if (command === "address")
      return Object.freeze({
        status: "address",
        address: await lane.instanceId(),
      });
    if (command === "notes")
      return Object.freeze({ status: "notes", notes: await lane.notes() });
    if (command === "balance")
      return Object.freeze({
        status: "balance",
        balance: await lane.balance(),
      });
    return Object.freeze({ status: "wallet-ready", mode: wallet });
  } finally {
    await lane.close();
    await lane.closed;
  }
}
module.exports = { accountCommand };
