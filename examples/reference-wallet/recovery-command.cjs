"use strict";
/** Explicit recovery actions. Only submit-stored may sign/broadcast, through
 * the owner's retained-operation checks and separate reviews. No automatic retry. */
async function recoveryCommand({
  session,
  command,
  holdId,
  transactionHash,
  noteId,
  signal,
  reviews,
}) {
  if (
    ["shield-history", "shield-observe", "shield-resolve"].includes(command)
  ) {
    const lane = await session.openShieldRecovery({
      signal,
      reviewDisclosures: reviews.disclosure,
      reviewResolution: reviews.resolution,
    });
    try {
      if (command === "shield-history")
        return Object.freeze({
          status: "shield-history",
          records: await lane.list(),
        });
      return command === "shield-observe"
        ? await lane.observe(transactionHash)
        : await lane.resolve(transactionHash, { minimumConfirmations: 12 });
    } finally {
      lane.close();
      await lane.closed;
    }
  }
  if (command === "submit-stored") {
    const lane = await session.openRecovery({
      signal,
      gasLimit: 1500000n,
      maxGasFee: 2000000000000000n,
      reviewDisclosures: (summary, operationSignal) =>
        reviews.disclosure(summary, { signal: operationSignal }),
      reviewTransaction: (summary) =>
        reviews.transaction(summary, { signal: lane.signal }),
    });
    try {
      const outcome = await lane.submitStored(holdId);
      return Object.freeze({
        status: "submission-outcome",
        holdId,
        outcome,
        next: "Observe and resolve this hold. An uncertain outcome never permits repeating a payment.",
      });
    } finally {
      lane.close();
      await lane.closed;
    }
  }
  if (command === "poi-status")
    return session.observeOwnedPoi({
      noteId,
      signal,
      reviewDisclosure: reviews.disclosure,
    });
  if (command === "holds") {
    const lane = await session.openRecovery({
      signal,
      gasLimit: 1500000n,
      maxGasFee: 2000000000000000n,
      reviewDisclosures: () => false,
      reviewTransaction: () => false,
    });
    try {
      const records = [];
      let after = null;
      for (let page = 0; page < 64; page++) {
        const result = await lane.history(after);
        records.push(...result.records);
        if (result.nextAfter === null)
          return Object.freeze({ status: "holds", records });
        if (result.nextAfter === after)
          throw Error("Custody cursor did not advance");
        after = result.nextAfter;
      }
      throw Error("Custody page limit reached");
    } finally {
      lane.close();
      await lane.closed;
    }
  }
  if (!["observe", "resolve"].includes(command))
    throw Error("Unsupported recovery command");
  const lane = await session.openSubmissionRecovery({
    signal,
    reviewDisclosures: reviews.disclosure,
  });
  try {
    return command === "observe"
      ? await lane.observe(holdId)
      : await lane.resolve(holdId, { minimumConfirmations: 12 });
  } finally {
    lane.close();
    await lane.closed;
  }
}
module.exports = { recoveryCommand };
