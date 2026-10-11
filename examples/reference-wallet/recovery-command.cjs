"use strict";
/** Explicit recovery actions. Only submit-stored may sign/broadcast, through
 * the owner's retained-operation checks and separate reviews. No automatic retry. */
async function recoveryCommand({
  session,
  command,
  holdId,
  transactionHash,
  noteId,
  kind,
  expectedPayment,
  signal,
  reviews,
  onDiagnostic,
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
  if (["submit-stored", "resume-proof"].includes(command)) {
    const lane = await session.openRecovery({
      signal,
      gasLimit: 1500000n,
      maxGasFee: 2000000000000000n,
      reviewDisclosures: (summary, operationSignal) => {
        if (
          expectedPayment &&
          (summary.purpose !== "railgun-recovered-private-submission" ||
            summary.selection?.noteId !== expectedPayment.noteId ||
            summary.operation !== expectedPayment.kind ||
            (expectedPayment.kind === "railgun-token-unshield"
              ? summary.recipient?.toLowerCase() !==
                expectedPayment.recipient.toLowerCase()
              : summary.recipient !== expectedPayment.recipient))
        )
          return false;
        return reviews.disclosure(summary, { signal: operationSignal });
      },
      reviewTransaction: (summary) =>
        reviews.transaction(summary, { signal: lane.signal }),
    });
    try {
      if (command === "resume-proof") return await lane.resumeProof(holdId);
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
      if (command === "submit-stored" && typeof onDiagnostic === "function") {
        try {
          const outcome = lane.readSubmissionOutcome();
          if (outcome) onDiagnostic(outcome, "submission");
        } catch { /* A diagnostic cannot change the operation's result. */ }
      }
    }
  }
  if (command === "poi-status")
    return session.observeOwnedPoi({
      noteId,
      signal,
      reviewDisclosure: reviews.disclosure,
    });
  if (command === "hold-find") {
    if (
      !["railgun-private-transfer", "railgun-token-unshield"].includes(kind) ||
      typeof noteId !== "string"
    )
      throw Error("Invalid guided hold selection");
    const history = await recoveryCommand({
      session,
      command: "holds",
      signal,
      reviews,
    });
    const lane = await session.openSubmissionRecovery({
      signal,
      reviewDisclosures: () => false,
    });
    try {
      const matches = [];
      for (const record of history.records) {
        if (record.kind !== kind) continue;
        const description = await lane.describe(record.holdId);
        if (
          description.status !== "held" ||
          description.holdId !== record.holdId
        )
          throw Error("Invalid held descriptor");
        if (description.input.noteId === noteId)
          matches.push({ record, description });
      }
      if (matches.length !== 1)
        return Object.freeze({
          status: matches.length === 0 ? "hold-absent" : "hold-ambiguous",
          inputNoteId: noteId,
          kind,
        });
      return Object.freeze({
        status: "hold-found",
        holdId: matches[0].record.holdId,
        inputNoteId: noteId,
        kind,
        localState: matches[0].record.localState,
        transfer: matches[0].description.transfer,
      });
    } finally {
      lane.close();
      await lane.closed;
    }
  }
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
