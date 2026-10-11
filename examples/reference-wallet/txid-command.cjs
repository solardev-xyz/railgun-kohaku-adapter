"use strict";
/** Bounded public-read recovery under one command/consent/lifetime. Each call
 * opens and drains a fresh TXID owner and authenticates its own cursor. No
 * selected-note reads, proving, signing or submissions can enter this loop. */
function transportOutcome(session) {
  const value = session.readTxidReadOutcome?.();
  return value && Object.isFrozen(value) && Object.keys(value).length === 3 &&
    value.schema === "railgun-public-read-failure-v1" && value.operation === "txid-sync" &&
    ["connection", "timeout"].includes(value.category) ? value : null;
}
function waitForRecovery(signal) {
  return new Promise((resolve, reject) => {
    const done = () => { signal.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(done, 10000);
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(Error("TXID synchronization cancelled")); };
    signal.addEventListener("abort", abort, {once:true});
    if(signal.aborted) abort();
  });
}
async function synchronizeTxids({
  session,
  signal,
  review,
  deadline = Date.now() + 10 * 60000,
  progress = () => {},
  wait = waitForRecovery,
}) {
  let last = null, recoveries = 0, noProgress = 0, segmentProgress = false;
  for (let page = 0; page < 80; page++) {
    if (signal.aborted) throw Error("TXID synchronization cancelled");
    if (Date.now() >= deadline - 180000)
      return Object.freeze({ status: "paused", pages: page, last });
    let result;
    try {
      // The loop index charges failed calls as well as returned pages. The
      // original 80-call consent and deadline are never renewed by recovery.
      result = await session.synchronizeTxid({
        mode: "initialize",
        signal,
        reviewDisclosure: review,
      });
    } catch (error) {
      noProgress = segmentProgress ? 0 : noProgress + 1;
      segmentProgress = false;
      if (signal.aborted || !transportOutcome(session) || recoveries >= 2 ||
          noProgress >= 2 || page + 1 >= 80 || Date.now() + 10000 >= deadline - 180000)
        throw error;
      recoveries++;
      progress(Object.freeze({status:"txid-recovering", calls:page + 1, recovery:recoveries}));
      await wait(signal);
      continue;
    }
    if (
      !Number.isSafeInteger(result.count) ||
      result.count < 0 ||
      result.pending !== false ||
      (last && result.count < last.count)
    )
      throw Error("Invalid TXID progress");
    if (result.count > (last?.count ?? 0)) segmentProgress = true;
    // Only a completed owner result advances this lower bound. Do not print
    // roots, indexer cursors or an inferred result for a failed page.
    progress(
      Object.freeze({
        status: "txid-syncing",
        pages: page + 1,
        count: result.count,
      }),
    );
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
