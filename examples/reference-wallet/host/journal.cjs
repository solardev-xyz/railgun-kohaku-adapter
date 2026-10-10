/** Main-owned write-ahead journal. No signed bytes or keys are persisted.
 * Every durable attempt is possibly submitted, including after a crash before
 * transport handoff. Observations never authorize retries or erase attempts.
 */
const { createHmac } = require("node:crypto");
const path = require("path");
// Adapted under MPL-2.0 from Freedom eba426b2. Railgun-only journal scope.
const { createInventoryGuard, profileId } = require("./inventory.cjs");
const { privacyError } = require("./errors.cjs");
const { validIntent } = require("./intent.cjs");
function createJournalHost({
  context,
  storage: storageHost,
  profiles,
  vault,
  leases,
}) {
  const { getPrivacyContext } = context;
  const { createPrivacyStorage, getPrivacyStoragePath } = storageHost;
  const journals = new WeakMap();
  const HASH = /^0x[0-9a-f]{64}$/;
  const KEY = "submissions-v1";
  const retention = require("./retention.cjs");
  const {
    validRailgunShieldResolution,
    freezeRailgunShieldResolution,
  } = require("@freedom/railgun-kohaku-adapter/host/journal-data");
  const {
    validRailgunTransactResolution,
    freezeRailgunTransactResolution,
  } = require("@freedom/railgun-kohaku-adapter/host/journal-data");
  const unresolved = (records) => records.some((record) => !record.resolution);
  function snapshot(record) {
    if (record.intent) Object.freeze(record.intent);
    if (record.observation) Object.freeze(record.observation);
    if (record.resolution?.railgun)
      (record.intent?.kind === "railgun-transact"
        ? freezeRailgunTransactResolution
        : freezeRailgunShieldResolution)(record.resolution.railgun);
    if (record.resolution) Object.freeze(record.resolution);
    return Object.freeze(record);
  }
  function freezeSnapshot(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freezeSnapshot);
      Object.freeze(value);
    }
    return value;
  }
  function validObservation(value) {
    return (
      value &&
      [
        "unknown",
        "pending",
        "included",
        "reverted",
        "reorged",
        "nonce-consumed",
      ].includes(value.status) &&
      value.trust === "unverified" &&
      Number.isSafeInteger(value.observedAt) &&
      value.observedAt >= 0 &&
      Number.isSafeInteger(value.confirmations) &&
      value.confirmations >= 0 &&
      (value.status !== "nonce-consumed" ||
        (Number.isSafeInteger(value.finalizedNonce) &&
          value.finalizedNonce > 0)) &&
      (["included", "reverted", "nonce-consumed"].includes(value.status)
        ? typeof value.blockHash === "string" &&
          HASH.test(value.blockHash) &&
          Number.isSafeInteger(value.blockNumber) &&
          value.blockNumber >= 0 &&
          value.confirmations > 0
        : value.blockHash === null &&
          value.blockNumber === null &&
          value.confirmations === 0)
    );
  }

  const invalid = () =>
    privacyError(
      "PRIVATE_JOURNAL_INVALID",
      "Submission state could not be validated",
    );
  function decode(value) {
    if (value === null) return { records: [], archive: [] };
    try {
      const data = JSON.parse(value);
      if (
        ![1, 2, 3, 4].includes(data.version) ||
        !Array.isArray(data.records) ||
        data.records.length > 64
      )
        throw invalid();
      const hashes = new Set();
      for (const record of data.records) {
        if (
          !HASH.test(record.hash) ||
          Object.keys(record).some(
            (name) =>
              ![
                "hash",
                "nonce",
                "state",
                "attemptedAt",
                "revision",
                "intent",
                "observation",
                "resolution",
              ].includes(name),
          ) ||
          hashes.has(record.hash) ||
          !Number.isSafeInteger(record.nonce) ||
          record.nonce < 0 ||
          !["attempted", "submitted"].includes(record.state) ||
          !Number.isSafeInteger(record.attemptedAt) ||
          record.attemptedAt < 0
        )
          throw invalid();
        if (
          record.revision !== undefined &&
          (!Number.isSafeInteger(record.revision) || record.revision < 0)
        )
          throw invalid();
        if (!validIntent(record.intent)) throw invalid();
        if (
          record.observation !== undefined &&
          !validObservation(record.observation)
        )
          throw invalid();
        if (
          record.observation?.status === "nonce-consumed" &&
          record.observation.finalizedNonce <= record.nonce
        )
          throw invalid();
        if (
          record.resolution &&
          (!record.observation ||
            record.resolution.blockHash !== record.observation.blockHash ||
            !Number.isSafeInteger(record.resolution.minimumConfirmations) ||
            record.resolution.minimumConfirmations < 1 ||
            record.observation.confirmations <
              record.resolution.minimumConfirmations ||
            !Number.isSafeInteger(record.resolution.reviewedAt) ||
            record.resolution.reviewedAt < 0)
        )
          throw invalid();
        if (
          record.resolution &&
          (record.intent?.kind === "railgun-transact"
            ? !validRailgunTransactResolution(record.resolution.railgun, record)
            : record.intent?.kind === "railgun-native-shield"
              ? !validRailgunShieldResolution(record.resolution.railgun, record)
              : record.resolution.railgun !== undefined)
        )
          throw invalid();
        hashes.add(record.hash);
      }
      const archive = data.version === 1 ? [] : data.archive;
      if (
        !retention.validArchive(archive, "public") ||
        (data.version < 4 && archive.some((r) => r.route !== undefined)) ||
        new Set([...data.records, ...archive].map((r) => r.hash)).size !==
          data.records.length + archive.length ||
        archive.some((r, i) => i > 0 && r.nonce <= archive[i - 1].nonce) ||
        data.records.some(
          (r) => archive.length && r.nonce <= archive.at(-1).nonce,
        )
      )
        throw invalid();
      return { records: data.records, archive };
    } catch {
      throw invalid();
    }
  }

  function assertJournalScope(handle) {
    const context = getPrivacyContext(handle);
    const { subject } = context;
    if (
      subject.kind !== "public-address" ||
      subject.role !== "transaction-rpc" ||
      subject.chainId !== 11155111 ||
      subject.operation !== null ||
      subject.protocol !== null ||
      subject.deployment !== null
    ) {
      throw privacyError(
        "PRIVATE_JOURNAL_SCOPE",
        "Unsupported submission journal scope",
      );
    }
    return context;
  }

  function createSubmissionJournal({ handle, store, current }) {
    const { subject } = assertJournalScope(handle);
    const storage = Object.freeze({
      async get(key) {
        current();
        const result = await store.get(key);
        current();
        return result;
      },
      async update(key, change) {
        current();
        let candidate = false;
        try {
          const result = await store.update(key, (value) => {
            current();
            const next = change(value);
            candidate = true;
            return next;
          });
          current();
          return result;
        } catch (error) {
          if (!candidate) throw error;
          throw Object.assign(
            privacyError(
              /^(PRIVATE_|PRIVACY_)/.test(error?.code)
                ? error.code
                : "PRIVATE_STORAGE_WRITE_FAILED",
              "Journal update may have committed; read its recorded state",
            ),
            { storageCommitted: true },
          );
        }
      },
    });
    async function list() {
      getPrivacyContext(handle);
      const value = await storage.get(KEY);
      getPrivacyContext(handle);
      return decode(value).records.map(snapshot);
    }
    function modify(change) {
      return storage.update(KEY, (value) => {
        const state = decode(value);
        return JSON.stringify({
          version: 4,
          records: change(state.records, state.archive),
          archive: state.archive,
        });
      });
    }
    async function assertCanSubmit() {
      if (unresolved(await list()))
        throw privacyError(
          "PRIVATE_SUBMISSION_UNRESOLVED",
          "Reconcile the recorded submission before creating another transaction",
        );
    }
    return Object.freeze({
      list,
      // One authenticated read prevents an archival transition from splitting
      // active/archive observations. This is detached data, not a write lease or
      // continuing authority; callers must reattest at their eventual use boundary.
      async readSnapshot() {
        getPrivacyContext(handle);
        const value = await storage.get(KEY);
        getPrivacyContext(handle);
        return freezeSnapshot(decode(value));
      },
      assertCanSubmit,
      // Explicit private initialization enrolls the account before its first
      // submission. Ordinary sends must never create a new enrollment.
      async initialize() {
        const current = await storage.get(KEY);
        decode(current);
        if (current === null) {
          const lease = leases.acquireSubmissionLease({
            chainId: subject.chainId,
            from: subject.principal,
            privacyContext: handle,
          });
          try {
            await storage.update(KEY, (value) => {
              decode(value);
              return value === null
                ? JSON.stringify({ version: 4, records: [], archive: [] })
                : value;
            });
          } finally {
            lease.release();
          }
        }
        getPrivacyContext(handle);
      },
      async selectNonce(pending) {
        if (!Number.isSafeInteger(pending) || pending < 0) throw invalid();
        const state = decode(await storage.get(KEY));
        getPrivacyContext(handle);
        if (unresolved(state.records))
          throw privacyError(
            "PRIVATE_SUBMISSION_UNRESOLVED",
            "Reconcile the recorded submission before creating another transaction",
          );
        const highest = Math.max(
          -1,
          ...state.records.map((r) => r.nonce),
          ...state.archive.map((r) => r.nonce),
        );
        if (!Number.isSafeInteger(highest + 1)) throw invalid();
        return Math.max(pending, highest + 1);
      },
      async listArchive() {
        const state = decode(await storage.get(KEY));
        getPrivacyContext(handle);
        return structuredClone(state.archive);
      },
      async archiveResolved(expected, anchors) {
        await storage.update(KEY, (value) => {
          const state = decode(value);
          return JSON.stringify({
            version: 4,
            ...retention.archivePrefix(
              state.records,
              state.archive,
              expected,
              anchors,
              "public",
            ),
          });
        });
        getPrivacyContext(handle);
      },
      async has(hash) {
        const state = decode(await storage.get(KEY));
        getPrivacyContext(handle);
        return [...state.records, ...state.archive].some(
          (r) => r.hash === hash?.toLowerCase(),
        );
      },
      async begin(hash, nonce, intent) {
        if (
          !HASH.test(hash) ||
          !Number.isSafeInteger(nonce) ||
          nonce < 0 ||
          !validIntent(intent)
        )
          throw invalid();
        const metadata = { intent: { ...intent } };
        let commitCandidate = false;
        try {
          await modify((records, archive) => {
            if (
              [...records, ...archive].some((record) => record.hash === hash)
            ) {
              throw Object.assign(
                privacyError(
                  "PRIVATE_BROADCAST_ALREADY_ATTEMPTED",
                  "Query the existing submission before any further action",
                ),
                { transactionHash: hash },
              );
            }
            // This journal is Sepolia-only and validated Railgun transact intents
            // target the pinned proxy. Its spent-input namespace is tree/nullifier,
            // independent of operation, proof, outputs, nonce or transaction hash.
            // Resolution (including revert) and archival never authorize replay.
            if (
              metadata.intent?.kind === "railgun-transact" &&
              [...records, ...archive].some(
                (record) =>
                  record.intent?.kind === "railgun-transact" &&
                  record.intent.tree === metadata.intent.tree &&
                  record.intent.nullifier === metadata.intent.nullifier,
              )
            ) {
              throw privacyError(
                "PRIVATE_RAILGUN_NULLIFIER_RESERVED",
                "Selected input has a recorded transaction attempt",
              );
            }
            // Conservatively serialize all sends for this account. Unverified RPC
            // receipts alone cannot clear the gate; an explicit review must.
            if (unresolved(records))
              throw privacyError(
                "PRIVATE_SUBMISSION_UNRESOLVED",
                "Reconcile the recorded submission before creating another transaction",
              );
            if (records.length >= 64)
              throw privacyError(
                "PRIVATE_TRANSACTION_LIMIT",
                "Submission history capacity reached",
              );
            if (
              [...records, ...archive].some((record) => record.nonce >= nonce)
            )
              throw privacyError(
                "PRIVATE_NONCE_REUSE_REFUSED",
                "Nonce must advance beyond recorded submissions",
              );
            commitCandidate = true;
            return [
              ...records,
              {
                hash,
                nonce,
                state: "attempted",
                attemptedAt: Date.now(),
                ...metadata,
              },
            ];
          });
        } catch (error) {
          if (commitCandidate || error.storageCommitted)
            throw Object.assign(
              privacyError(
                "PRIVATE_BROADCAST_UNCERTAIN",
                "Submission record may have been saved; reconcile the recorded attempt",
              ),
              { transactionHash: hash, submissionStatus: "unknown" },
            );
          throw error;
        }
      },
      async observe(hash, observation, revision) {
        if (!validObservation(observation)) throw invalid();
        let updated;
        await modify((records) => {
          const record = records.find((entry) => entry.hash === hash);
          if (!record || (record.revision || 0) !== revision)
            throw privacyError(
              "PRIVATE_RECONCILIATION_STALE",
              "Submission observation was superseded",
            );
          if (
            observation.status === "nonce-consumed" &&
            observation.finalizedNonce <= record.nonce
          )
            throw invalid();
          if (!Number.isSafeInteger(revision + 1)) throw invalid();
          const previous = record.observation;
          record.observation = { ...observation };
          record.revision = revision + 1;
          if (
            record.resolution &&
            (record.resolution.blockHash !== observation.blockHash ||
              previous?.status !== observation.status ||
              previous?.blockNumber !== observation.blockNumber ||
              previous?.finalizedNonce !== observation.finalizedNonce ||
              observation.confirmations <
                record.resolution.minimumConfirmations)
          )
            record.resolution = null;
          updated = record;
          return records;
        });
        getPrivacyContext(handle);
        return snapshot(updated);
      },
      async resolve(hash, revision, minimumConfirmations, railgunPermit) {
        let updated;
        await modify((records) => {
          const record = records.find((entry) => entry.hash === hash);
          if (!record || record.revision !== revision)
            throw privacyError(
              "PRIVATE_RECONCILIATION_STALE",
              "Submission observation was superseded",
            );
          if (
            !Number.isSafeInteger(minimumConfirmations) ||
            minimumConfirmations < 1 ||
            !Number.isSafeInteger(revision + 1) ||
            !["included", "reverted", "nonce-consumed"].includes(
              record.observation?.status,
            ) ||
            record.observation.confirmations < minimumConfirmations
          )
            throw invalid();
          const railgun =
            record.intent?.kind === "railgun-transact"
              ? require("@freedom/railgun-kohaku-adapter/host/owner-authority").assertRailgunTransactResolution(
                  railgunPermit,
                  record,
                )
              : record.intent?.kind === "railgun-native-shield"
                ? require("@freedom/railgun-kohaku-adapter/host/owner-authority").assertRailgunShieldResolution(
                    railgunPermit,
                    record,
                  )
                : undefined;
          record.resolution = {
            ...(railgun ? { railgun: structuredClone(railgun) } : {}),
            blockHash: record.observation.blockHash,
            minimumConfirmations,
            reviewedAt: Date.now(),
          };
          record.revision += 1;
          updated = record;
          return records;
        });
        getPrivacyContext(handle);
        return snapshot(updated);
      },
      async markSubmitted(hash) {
        await modify((records) => {
          const record = records.find((entry) => entry.hash === hash);
          if (!record) throw invalid();
          record.state = "submitted";
          return records;
        });
      },
    });
  }

  // Fixed seed access is host-private. The adapter receives only the journal.
  function material(handle, readonly) {
    const owner = assertJournalScope(handle),
      profile = profiles.getActiveProfile();
    if (
      !profile ||
      profileId(profile) !== owner.profileId ||
      profileId(vault.profile) !== owner.profileId
    )
      throw privacyError("PRIVATE_JOURNAL_SCOPE", "Submission profile changed");
    const unlock = vault.currentSession();
    if (unlock.aborted)
      throw privacyError("PRIVATE_JOURNAL_UNAVAILABLE", "Vault is locked");
    let store;
    vault.withSeed((seed) => {
      const key = Buffer.alloc(32);
      try {
        const derived = createHmac("sha256", seed)
          .update("Freedom wallet submission journal v1\0")
          .update(JSON.stringify([owner.profileId, owner.subject]))
          .digest();
        try {
          derived.copy(key);
        } finally {
          derived.fill(0);
        }
        const guard = createInventoryGuard({ context, handle, profile, seed });
        const directory = path.join(
          profile.userDataDir,
          "wallet-private-submissions",
        );
        if (readonly)
          guard.assertRegistered(getPrivacyStoragePath(handle, directory));
        store = createPrivacyStorage({
          handle,
          directory,
          key,
          profileGuard: readonly
            ? Object.freeze({
                assert: (file) => guard.assertRegistered(file),
                remember: (file) => guard.assertRegistered(file),
              })
            : guard,
        });
      } finally {
        key.fill(0);
      }
    });
    function current() {
      getPrivacyContext(handle);
      if (
        vault.currentSession() !== unlock ||
        unlock.aborted ||
        profileId(profiles.getActiveProfile()) !== owner.profileId
      )
        throw privacyError(
          "PRIVATE_JOURNAL_UNAVAILABLE",
          "Submission lifetime ended",
        );
    }
    return { store, current };
  }
  function getPrivateSubmissionJournal(handle) {
    assertJournalScope(handle);
    if (journals.has(handle)) return journals.get(handle);
    const { store, current } = material(handle, false);
    const journal = createSubmissionJournal({ handle, store, current });
    journals.set(handle, journal);
    return journal;
  }
  async function readExistingPrivateSubmissionSnapshot(handle) {
    const owner = assertJournalScope(handle);
    const scope = context.createPrivacyScope({
      profileId: owner.profileId,
      signal: owner.signal,
      isCurrent: () => {
        getPrivacyContext(handle);
        return true;
      },
    });
    try {
      const child = scope.getContext(
        Object.fromEntries(
          Object.entries(owner.subject).filter(([, value]) => value !== null),
        ),
        owner.requirements,
      );
      const { store, current } = material(child, true);
      const value = await store.get(KEY);
      current();
      getPrivacyContext(handle);
      if (value === null)
        throw privacyError(
          "PRIVATE_JOURNAL_UNAVAILABLE",
          "Existing submission state is required",
        );
      return freezeSnapshot(decode(value));
    } finally {
      // This read's storage and inventory key copies end here, not at the
      // caller's possibly long-lived scope. Existing-only guard cannot adopt.
      scope.close();
    }
  }
  return Object.freeze({
    getPrivateSubmissionJournal,
    readExistingPrivateSubmissionSnapshot,
  });
}
module.exports = { createJournalHost };
