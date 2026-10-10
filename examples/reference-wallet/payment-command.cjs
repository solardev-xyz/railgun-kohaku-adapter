"use strict";
const { randomUUID } = require("node:crypto");
const {
  createRailgunKohakuPrivateAdapter,
  createRailgunKohakuPrivateAdapterBroadcaster,
  createRailgunKohakuPublicAdapter,
  createRailgunKohakuPublicAdapterSubmitter,
} = require("@freedom/railgun-kohaku-adapter");
// Application defaults for this Sepolia example, not reusable protocol limits.
const GAS = Object.freeze({ gasLimit: 1500000n, maxGasFee: 2000000000000000n });
async function paymentCommand({
  session,
  command,
  noteId,
  recipient,
  amount,
  signal,
  reviews,
  state,
}) {
  if (!["shield", "pay-note", "unshield-note"].includes(command))
    throw Error("Unsupported payment command");
  const next = Object.freeze({
    authority:
      "The package journal and custody decide; operations is application bookkeeping only.",
    instruction:
      "Do not repeat a payment after an uncertain result. Inspect custody and resolve the original transaction first.",
    commands: Object.freeze(
      command === "shield"
        ? [
            "shield-history",
            "shield-observe --transaction <hash>",
            "shield-resolve --transaction <hash>",
          ]
        : ["holds", "observe --hold <holdId>", "resolve --hold <holdId>"],
    ),
  });
  const id = randomUUID(),
    startedAt = Date.now();
  async function record(status, outcome = null) {
    await state.update("operations", (old) => {
      const rows = old ?? [];
      if (!Array.isArray(rows) || rows.length > 128)
        throw Error("Invalid operation history");
      const index = rows.findIndex((row) => row.id === id);
      const row = {
        id,
        command,
        noteId: noteId ?? null,
        recipient: recipient ?? null,
        amount: amount ?? null,
        startedAt,
        status,
        outcome,
      };
      if (index < 0) {
        if (rows.length === 128) throw Error("Operation history full");
        return [...rows, row];
      }
      return rows.map((previous, i) => (i === index ? row : previous));
    });
  }
  await record("preparing");
  let adapter;
  try {
    const options = {
      wallet: "active",
      signal,
      ...GAS,
      reviewPreparation: reviews.preparation,
      reviewTransaction: reviews.transaction,
    };
    if (command === "shield") {
      const lane = await session.openPublic(options);
      try {
        adapter = createRailgunKohakuPublicAdapter({ host: lane, signal });
      } catch (error) {
        await lane.close();
        await lane.closed;
        throw error;
      }
      const operation = await adapter.prepareShield({
        asset: { __type: "native" },
        amount: BigInt(amount),
      });
      await record("prepared");
      const outcome =
        await createRailgunKohakuPublicAdapterSubmitter(adapter).submit(
          operation,
        );
      await record("reported", outcome);
      return Object.freeze({
        status: "submission-outcome",
        operationId: id,
        outcome,
        next,
      });
    }
    const lane = await session.openPrivate(options);
    try {
      adapter = createRailgunKohakuPrivateAdapter({ host: lane, signal });
    } catch (error) {
      await lane.close();
      await lane.closed;
      throw error;
    }
    const notes = await adapter.notes();
    const matches = notes.filter(
      (note) => note.id === noteId && note.spentTxid === false,
    );
    if (matches.length !== 1 || matches[0].asset.__type !== "erc20")
      throw Error("Exact unspent note required");
    const note = matches[0],
      input = { noteId: note.id, asset: note.asset, amount: note.amount };
    const operation =
      command === "pay-note"
        ? await adapter.prepareTransfer(input, recipient)
        : await adapter.prepareUnshield(input, recipient);
    await record("prepared");
    const outcome =
      await createRailgunKohakuPrivateAdapterBroadcaster(adapter).broadcast(
        operation,
      );
    await record("reported", outcome);
    return Object.freeze({
      status: "submission-outcome",
      operationId: id,
      outcome,
      next,
    });
  } finally {
    if (adapter) {
      adapter.close();
      await adapter.closed;
    }
  }
}
module.exports = { paymentCommand };
