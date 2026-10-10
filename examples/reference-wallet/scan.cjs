"use strict";
const { randomUUID } = require("node:crypto");
// Conservative application schedule, not a Railgun protocol limit. The owner
// still chooses the start and enforces continuity and all acquisition bounds.
function windowEnd(from, anchor) {
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(anchor) ||
    from < 0 ||
    anchor < from
  )
    throw Error("Invalid scan interval");
  const size = from < 5700000 ? 100000 : 20000;
  return Math.min(anchor, (Math.floor(from / size) + 1) * size - 1);
}
function valid(state) {
  if (
    !state ||
    state.version !== 1 ||
    typeof state.phase !== "string" ||
    typeof state.identity !== "string" ||
    !Number.isSafeInteger(state.ranges) ||
    state.ranges < 0 ||
    state.ranges > 650 ||
    !Number.isSafeInteger(state.checkpoint) ||
    state.checkpoint < -1 ||
    !["pending", "complete"].includes(state.status) ||
    (state.attempt !== null &&
      (!Number.isSafeInteger(state.attempt.to) ||
        state.attempt.to <= state.checkpoint ||
        ![0, 1, 2].includes(state.attempt.number)))
  )
    throw Error("Invalid saved scan progress");
  return state;
}
/** The saved checkpoint is a lower bound only. An unacknowledged commit can be
 * ahead of it. Each such interval has two fixed targets; refusal never implies
 * that a commit did/didn't happen, and the third attempt is refused. */
async function scanAccount({
  session,
  state,
  anchor,
  identity,
  fresh = false,
  signal,
  deadline,
  progress = () => {},
}) {
  if (
    !Number.isSafeInteger(deadline) ||
    deadline <= Date.now() ||
    typeof identity !== "string" ||
    !/^[0-9a-f]{64}$/.test(identity) ||
    !Number.isSafeInteger(anchor?.number) ||
    anchor.number < 0 ||
    !/^0x[0-9a-f]{64}$/i.test(anchor.hash)
  )
    throw Error("Invalid scan lifetime or anchor");
  if (fresh)
    await state.update("scan", () => ({
      version: 1,
      phase: randomUUID(),
      identity,
      checkpoint: -1,
      checkpointHash: null,
      ranges: 0,
      attempt: null,
      status: "pending",
    }));
  let saved = valid(await state.get("scan"));
  if (saved.identity !== identity || saved.checkpoint > anchor.number)
    throw Error("Scan identity or finality changed");
  while (saved.checkpoint < anchor.number) {
    if (signal.aborted)
      throw Object.assign(Error("Scan cancelled"), {
        code: "REFERENCE_CANCELLED",
      });
    if (Date.now() >= deadline - 5 * 60000)
      return Object.freeze({
        status: "paused",
        checkpoint: saved.checkpoint,
        ranges: saved.ranges,
      });
    if (saved.ranges >= 650)
      throw Object.assign(Error("Scan range limit reached"), {
        code: "REFERENCE_SCAN_LIMIT",
      });
    let to,
      attempt = 0;
    if (saved.attempt) {
      if (saved.attempt.number === 2)
        throw Object.assign(Error("Scan needs checkpoint diagnosis"), {
          code: "REFERENCE_SCAN_RECOVERY_REQUIRED",
        });
      if (saved.attempt.number === 0) {
        to = saved.attempt.to;
        attempt = 1;
      } else {
        if (saved.attempt.to >= anchor.number)
          throw Object.assign(Error("Final checkpoint needs diagnosis"), {
            code: "REFERENCE_SCAN_RECOVERY_REQUIRED",
          });
        to = windowEnd(saved.attempt.to + 1, anchor.number);
        attempt = 2;
      }
    } else to = windowEnd(saved.checkpoint + 1, anchor.number);
    saved = {
      ...saved,
      ranges: saved.ranges + 1,
      attempt: { to, number: attempt },
      status: "pending",
    };
    await state.update("scan", () => saved);
    // Reservation precedes the owner call. If it throws or the process dies,
    // nothing asserts that this target was or wasn't committed.
    const result = await session.advancePublic({ to, anchor });
    if (
      result.status !== "applied-unverified" ||
      result.to?.number !== to ||
      !/^0x[0-9a-f]{64}$/i.test(result.to.hash)
    )
      throw Error("Unexpected scan checkpoint");
    saved = {
      ...saved,
      checkpoint: to,
      checkpointHash: result.to.hash,
      attempt: null,
    };
    await state.update("scan", () => saved);
    progress(
      Object.freeze({
        checkpoint: to,
        anchor: anchor.number,
        ranges: saved.ranges,
      }),
    );
  }
  saved = { ...saved, status: "complete" };
  await state.update("scan", () => saved);
  return Object.freeze({ status: "complete", anchor, ranges: saved.ranges });
}
module.exports = { windowEnd, scanAccount };
