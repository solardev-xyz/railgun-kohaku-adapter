"use strict";
/** Explicit preparation and single handoff only. Prepared capsules remain local;
 * a response never establishes acceptance. No retry/reproof command is exposed. */
async function poiCommand({
  session,
  command,
  holdId,
  capsuleDigest,
  signal,
  reviews,
}) {
  const method = {
    "poi-prepare-shield": "prepareShield",
    "poi-prepare-transact": "prepareTransact",
    "poi-submit": "submit",
    "poi-recover": "recoverAttemptedOutput",
  }[command];
  if (!method) throw Error("Unsupported POI command");
  const lane = await session.openPoiRecovery({
    signal,
    reviewDisclosures: reviews.disclosure,
  });
  try {
    return await lane[method](
      command.startsWith("poi-prepare-") ? holdId : capsuleDigest,
    );
  } finally {
    lane.close();
    await lane.closed;
  }
}
module.exports = { poiCommand };
