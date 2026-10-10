"use strict";
/** A bounded user-requested synchronization, not automatic failure retry. Each
 * owner call authenticates its own cursor and permits at most one public page. */
async function synchronizeTxids({
  session,
  signal,
  review,
  deadline = Date.now() + 10 * 60000,
}) {
  let last = null;
  for (let page = 0; page < 80; page++) {
    if (signal.aborted) throw Error("TXID synchronization cancelled");
    if (Date.now() >= deadline - 180000)
      return Object.freeze({ status: "paused", pages: page, last });
    const result = await session.synchronizeTxid({
      mode: "initialize",
      signal,
      reviewDisclosure: review,
    });
    if (
      !Number.isSafeInteger(result.count) ||
      result.count < 0 ||
      result.pending !== false ||
      (last && result.count < last.count)
    )
      throw Error("Invalid TXID progress");
    if (
      result.serviceLatestIndex !== null &&
      result.count > result.serviceLatestIndex
    )
      return Object.freeze({
        status: "complete",
        pages: page + 1,
        last: result,
      });
    if (result.capacityReached || (last && result.count === last.count))
      return Object.freeze({
        status: "stopped",
        pages: page + 1,
        last: result,
      });
    last = result;
  }
  return Object.freeze({ status: "paused", pages: 80, last });
}
module.exports = { synchronizeTxids };
