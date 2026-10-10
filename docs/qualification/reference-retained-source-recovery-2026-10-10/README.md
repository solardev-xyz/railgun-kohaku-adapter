# Cold retained-source recovery qualification

The installed reference host recovered a genuine Transact-input unshield hold
created by the earlier package and host. The old 45-second recovery source
window expired without reaching the EOA review or broadcasting. After an
explicit public-cache and wallet rebuild plus TXID synchronization, the
candidate submitted that same authenticated hold and completed finality,
receipt accounting and conservation. The two-actor synthetic journey used
exactly three chain transactions: Shield, private transfer and unshield.

The candidate allocates up to 120 seconds to cold source authentication inside
a 260-second recovery phase. Earlier work reserves that phase. The actual
source evidence remains valid for 60 seconds, conservatively measured before
the final canonical pass; proof, POI, review and signing limits are unchanged.
This is additional workload time, not permission to use stale evidence.

## Evidence and limits

- `INDEX.json` binds the exact old and new package/host identities and local
  evidence digests. Fresh installation I produced the same candidate tar bytes.
- The old host and tar are measured before use. Each step uses a fresh Electron
  process and independently generated disposable vaults. No funded profile is
  accepted by the harness.
- Eight-second delays target the recovery source after the completed-wallet
  restore. Recorded method sequences match two complete snapshot patterns,
  separated only by the expected TXID validation calls. The candidate's delayed
  source interval was 49,170 ms: longer than 45 seconds, shorter than 120 seconds.
- The wire start of the final canonical pass preceded EOA review by 14,991 ms.
  This is a wire/review measurement, not an internal owner timestamp. Subsequent
  services use loopback latency; this does not guarantee Tor availability.
- The old timeout revokes admission but drains original work before returning.
  Server-side completion after expiry is not evidence of client admission.
- The fixture creates the held proof by crashing after preparation. The live
  case instead expired at its warm EOA review. Recorded authenticated hold and
  unjournaled-observation shapes agree except for actor-specific identifiers.
  Application operation rows are not inputs to `submit-stored`. The fixture
  includes one expired old recovery; the live case had two.
- The owner validates the original stored capsule before sending; this archive
  does not contain a separate raw-proof/calldata digest comparison. Synthetic
  root history preserves the old root. Live preflight must recheck acceptance.
- The POI service verifies current-circuit SNARKs, but the chain does not execute
  the EVM. Charlie and unrelated cache controls remain in the other reference
  journey variants. This case is specifically the two-actor upgrade path.

Run `tools/conformance/reference-journey/run.cjs` with a public runtime-input
file, `variant: "retained-upgrade"`, and `previousTar`/`previousHost` pointing to
the pinned prior standalone installation. It creates a fresh disposable root.
The package's normal test and typecheck commands cover deadline, expiry/drain,
source-age and provenance controls. Three guard-removal mutations failed their
expected tests. All 310 active suites passed with the repository's configured
fresh workers (12,948 tests); a preceding single-process run exited with code
139 before reporting results. Its crash cause was not established.

An initial fixture run was stopped before retained recovery because its delay
would have targeted wallet restoration. It is preserved locally and is not
qualification evidence. Funded identifiers, private payloads and local profile
paths are omitted from this archive. Live completion remains a separate gate.
