# Protocol behavior, compatibility and application policy

This inventory is the starting point for the adoption-roadmap policy work. It
distinguishes implemented compatibility work from further protocol and policy
changes. Qualification evidence is scoped separately; this inventory alone is
not a live or production qualification.

| Current rule | Class | Current owner | Treatment | Status |
| --- | --- | --- | --- | --- |
| Note ownership, nullifier binding, recipient and amount conservation | Protocol/security invariant | Private preparation, witness, prover and recovery | Always enforced; no caller override. | Implemented; retained invariant |
| Exactly bound signature, destination, durable attempt and uncertainty handling | Custody invariant | Submission, journal, transaction network | Always enforced. Availability retries must not create a second transaction. | Implemented; retained invariant |
| Chain 11155111, deployment addresses, ABI/code pins and event-era coverage | Qualified deployment | Public/private policy and deployment inventories | An authenticated deployment descriptor can select a supported deployment; adding another chain requires its own evidence. | Descriptor not started; Sepolia pins retained |
| Engine, transaction circuit and POI circuit hashes | Runtime compatibility | Runtime/artifact manifests | Keep immutable content verification. Detect circuit changes and give an actionable unsupported-artifact error before handoff. | Partial: maintainer drift checker; no handoff-time update discovery |
| Public/wallet/TXID cache compatibility hashes with conservative reviewed exclusions | Conservative implementation compatibility | `source-identity.js` and three policy modules | Separate complete attestation from public/wallet/TXID compatibility; default include with the exclusions documented below. No generic policy-hash override. | Implemented; further narrowing needs evidence |
| Persisted `freedom:` and credential derivation domains | Persisted format/identity | Enrollment, wallet policy, credential contract | Preserve existing bytes. Renaming is a migration, not cosmetic cleanup. | Implemented; retained invariant |
| 512 distinct log blocks, 4 MiB/4096 logs, 100k block span | Bounded acquisition implementation | `railgun-scan-source.js` | Describe as implementation resource bounds. Plan smaller windows when necessary without accepting partial data. | Implemented; retained invariant |
| 8,000 TXID rows and 32,768 observed store records | Storage implementation capacity | TXID journal/projection and whole-store observation | Expose capacity clearly. Raising it needs measured memory/storage behavior and matching validators. | Documented; capacity change not started |
| Native-only Shield; one ERC-20 input; ≤10¹⁶ wei per Shield/private input; fixed proof shapes | Historical qualification and persisted-operation bounds | Root adapters, capsules and preparation validators | Document independently of protocol limits. Broader assets/amounts require a versioned contract, migration and qualification. | Documented; generalization not started |
| Maximum gas fee (default 0.002 ETH) | Application policy | Trusted-main captured ceiling and per-lane budget | Explicit bootstrap `applicationPolicy`; actual signed-transaction fee, destination and custody checks stay invariant. See [spending policy](APPLICATION-POLICY.md). | Implemented |
| 650 ranges, 16 scan recoveries, 80 TXID pages per command | Example application budget | `examples/reference-wallet/{scan,txid-command}.cjs` | Keep in the example, report exhausted budgets clearly, and preserve authenticated progress. | Implemented in example |
| Vault unlock, explicit `PREPARE`/`SEND`/`RESOLVE` reviews | Host/user policy and custody lifecycle | Example vault and terminal | Stay host-owned; the adapter retains cancellation and genuine review binding. | Implemented; retained invariant |
| Historical campaign ledger names and per-run allowances | Qualification policy | `tools/qualification/installed-live/` | Remain evidence tooling, never the reference application's architecture. | Separated from example |

The compatibility controls demonstrate both directions: changing a
terminal message or POI response classification leaves an authenticated public
scan usable; changing event projection or its stored representation invalidates
that scan. A wallet-key/storage interpretation change must still refuse old
state unless a specific migration authenticates and converts it. Public, wallet
and TXID dependencies must be explicit and checked; excluding a file merely to
avoid a rebuild would weaken the existing guarantee.

Availability is separate from delivery authority. A bounded retry of an
idempotent public read may be appropriate, with a fresh destination/lifetime
check and an aggregate deadline. A proof submission, signing operation or
transaction broadcast cannot inherit that retry rule. The CLI currently makes
no automatic retry after either a read failure or an uncertain send.

## First compatibility boundary

The `sources-v2` attestation still hashes every enrolled package file and the
complete host inventory exactly once before owners load. Derived public, wallet
and TXID policies now use distinct `*-policy-v2` domains and a conservative
`cache-sources-v1` snapshot. All package files are included by default, including
new files and the inventory itself. The only current exclusion is
`src/data/railgun-poi-submit-data.js`, which serializes and classifies POI
handoffs; it does not interpret or persist any of these three derived caches.
Its bytes remain in full attestation. Exact retained submission-body digest
checks still refuse a serializer change that would alter an attempted request.

Hosts may supply `sourceIdentity.readCacheDigests()` alongside `readDigest()`.
Both must describe the same immutable snapshot; a host must not substitute a
mutable version label or omit storage, key derivation, projection or runtime
selection from compatibility. Existing hosts can omit the new port and keep
full-host invalidation. The reference host excludes only terminal presentation
(`review.cjs`, `terminal.cjs`) and manifest bytes from its cache digest. Main
startup, command logic, transport, storage and the source reader remain bound.
Its scan budget uses the public compatibility identity rather than the full
attestation, so changing a terminal message does not strand an otherwise valid
scan. Source filenames are still checked against the exact complete inventory.

Adopting the v2 domains invalidates previous derived generations once. This
change performs no silent cache conversion, custody migration, generation
reset, signing retry or change to disclosure authority. Circuit updates and
other source changes still conservatively require a rebuild. Narrowing further
dependencies needs its own review and compatibility evidence.

This exclusion protects derived cache compatibility, not arbitrary POI custody
compatibility. A serializer edit that changes `build()` bytes (including field
order or request identifiers) makes retained attempts fail normalization against
their stored body and digest. Existing attempted POI entries then refuse to
load until compatible code is restored or a separately reviewed migration exists.
Response classification and diagnostic-only changes avoid that custody conflict.
The complete source snapshot is retained internally for attestation and source
validation; after this split it does not gate cache reuse or mint any execution
authority. It is not a new public attestation API.
