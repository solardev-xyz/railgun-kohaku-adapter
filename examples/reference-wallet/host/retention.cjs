/** Lossy history compaction is a separate, reviewed trust decision. Exact reuse
 * guards survive forever; archived remote evidence is no longer revalidated.
 */
// Adapted under MPL-2.0 from Freedom eba426b2; Railgun public journals only.
const { privacyError } = require("./errors.cjs");
const { validIntent } = require("./intent.cjs");
const {
  validRailgunShieldResolution,
} = require("@freedom/railgun-kohaku-adapter/host/journal-data");
const {
  validRailgunTransactResolution,
} = require("@freedom/railgun-kohaku-adapter/host/journal-data");
const ARCHIVE_MAX = 1024;
const MINIMUM_AGE_MS = 24 * 60 * 60 * 1000;
const HASH = /^0x[0-9a-f]{64}$/;
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const fail = () =>
  privacyError(
    "PRIVATE_HISTORY_ARCHIVE_REFUSED",
    "Submission history is not eligible for archival",
  );
const full = () =>
  privacyError(
    "PRIVATE_HISTORY_ARCHIVE_FULL",
    "Permanent submission history capacity reached",
  );
const exact = (v, keys) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
function validAnchor(v) {
  return (
    exact(v, ["blockNumber", "blockHash"]) &&
    integer(v.blockNumber) &&
    HASH.test(v.blockHash)
  );
}
// Classification facts survive compaction and are reevaluated against current
// deployment pins. Unknown legacy records are never inferred to be ordinary.
function canArchivePublic(record) {
  return validIntent(record.intent) && record.route === undefined;
}
function validArchive(archive, kind) {
  if (kind !== "public") return false;
  const identifiers = ["hash", "nonce"];
  return (
    Array.isArray(archive) &&
    archive.length <= ARCHIVE_MAX &&
    archive.every(
      (r) =>
        exact(r, [
          ...identifiers,
          "status",
          "blockNumber",
          "blockHash",
          "archivedAt",
          "finalized",
          ...(kind === "public" && Object.hasOwn(r, "intent")
            ? ["intent"]
            : []),
          ...(kind === "public" && Object.hasOwn(r, "railgun")
            ? ["railgun"]
            : []),
        ]) &&
        (["railgun-native-shield", "railgun-transact"].includes(r.intent?.kind)
          ? (r.intent.kind === "railgun-transact"
              ? validRailgunTransactResolution
              : validRailgunShieldResolution)(r.railgun, {
              ...r,
              observation: {
                status: r.status,
                blockNumber: r.blockNumber,
                blockHash: r.blockHash,
              },
            })
          : r.railgun === undefined) &&
        validIntent(r.intent) &&
        identifiers.every((k) =>
          k === "nonce"
            ? integer(r[k])
            : typeof r[k] === "string" && HASH.test(r[k]),
        ) &&
        (kind === "public"
          ? ["included", "reverted", "nonce-consumed"]
          : ["included", "exited"]
        ).includes(r.status) &&
        integer(r.blockNumber) &&
        HASH.test(r.blockHash) &&
        integer(r.archivedAt) &&
        validAnchor(r.finalized) &&
        r.blockNumber <= r.finalized.blockNumber,
    )
  );
}
function archivePrefix(records, archive, expected, anchors, kind) {
  const id = kind === "public" ? "hash" : "id";
  if (
    !Array.isArray(expected) ||
    !expected.length ||
    expected.length > 16 ||
    expected.length > records.length ||
    !Array.isArray(anchors) ||
    anchors.length !== expected.length
  )
    throw fail();
  if (archive.length + expected.length > ARCHIVE_MAX) throw full();
  const now = Date.now();
  const moved = records.slice(0, expected.length).map((r, i) => {
    const e = expected[i],
      finalized = anchors[i];
    if (kind === "public" && !canArchivePublic(r)) throw fail();
    if (
      !exact(e, [id, "revision"]) ||
      r[id] !== e[id] ||
      r.revision !== e.revision ||
      !r.resolution ||
      now - r.resolution.reviewedAt < MINIMUM_AGE_MS ||
      !validAnchor(finalized) ||
      r.observation.blockNumber > finalized.blockNumber ||
      (kind === "relay" && !r.settlement)
    )
      throw fail();
    return {
      ...(kind === "public"
        ? {
            hash: r.hash,
            nonce: r.nonce,
            ...(r.intent ? { intent: { ...r.intent } } : {}),
          }
        : { id: r.id, nullifier: r.nullifier, commitment: r.commitment }),
      ...(r.resolution.railgun
        ? { railgun: structuredClone(r.resolution.railgun) }
        : {}),
      status: r.observation.status,
      blockNumber: r.observation.blockNumber,
      blockHash: r.observation.blockHash,
      archivedAt: now,
      finalized: { ...finalized },
    };
  });
  if (!validArchive([...archive, ...moved], kind)) throw fail();
  return {
    records: records.slice(expected.length),
    archive: [...archive, ...moved],
  };
}
module.exports = {
  ARCHIVE_MAX,
  MINIMUM_AGE_MS,
  validArchive,
  canArchivePublic,
  archivePrefix,
  fail,
};
