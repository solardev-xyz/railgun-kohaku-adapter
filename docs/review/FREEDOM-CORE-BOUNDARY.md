# Proposed Railgun boundary for freedom core

Keep the wallet's authority in freedom-core and use an upstream Rust Railgun
backend for protocol work once its adoption gates pass. Electron should request
operations and display reviews, while the core owns keys, revocation, approved
intent and durable submission custody. This is a design proposal; the ongoing
core migration is unchanged.

The proposal follows freedom-core's existing
[daemon design](https://github.com/solardev-xyz/freedom-core/blob/62e21172aa7cabc8c615ae5a9d6246822191ba47/docs/design/0001-freedom-cored.md)
and [contributor constraints](https://github.com/solardev-xyz/freedom-core/blob/62e21172aa7cabc8c615ae5a9d6246822191ba47/AGENTS.md)
at `62e21172aa7cabc8c615ae5a9d6246822191ba47`. Its current key crate covers
secp256k1 and Ed25519, not Railgun's EdDSA-Poseidon spending operation. That
operation and its derivation need their own reference vectors and review.

## Ownership

| Component | Responsibility |
| --- | --- |
| Core logic | Purpose-bound derivation/signing, approved-intent binding, revocation and custody state transitions. No I/O or proving runtime. |
| Daemon runtime | Serializes profile operations, persists encrypted journals, supplies time/randomness/network capabilities and supervises expensive jobs. |
| Upstream Railgun backend | Address/key math, notes, Merkle/TXID processing, witnesses, proofs and protocol encoding. Its clients use injected capabilities. |
| Electron shell | User interface, review presentation and existing caller-context bridge; opaque operation references and public results. No new raw-secret export; any exception needs a core design change. |

The upstream `RailgunSigner` implementation should live inside the core trust
domain. Its viewing-key accessor must not create a new JS key-export API. If a
separate scanner process needs a viewing key, that is an explicit core design
exception requiring scoped lifetime, revocation and a privacy review. A viewing
key exposes notes and nullifiers even without spending authority.

The backend is a trusted protocol dependency, not a sandbox. Its async HTTP,
database and Wasmer dependencies belong in a runtime integration layer. They do
not make the I/O-free core logic crates suitable places for the entire provider.
Process isolation and mobile support remain separately tested requirements.

The pinned upstream repository has no license metadata, and its git sources
are outside core's current cargo-deny allowlist. Resolve licensing and source
approvals before linking it. Its secret key types also permit copying,
serialization and hex printing without zeroization. Those lifetimes must be
hardened before key-bearing use; placing the provider inside the daemon alone
does not satisfy the core's secret rules. At lock, tear down and drain account,
provider and proving work, including every derived-key copy and note cache.

Provide encrypted note/tree storage as well as encrypted operation journals.
Native witness generation currently uses Wasmer/Cranelift JIT: verify its fit
with the hardened daemon's entitlements. A non-JIT path or separate proving
helper may be necessary; giving a helper nullifying-key-bearing inputs needs
an explicit core design and disclosure review. Network-derived parser failures
must return typed errors or stay behind a bounded isolation boundary.

Long scans and proofs need job handles, progress events and their own bounded
concurrency. Do not occupy the core's short request deadlines/admission slots
for the lifetime of a multi-minute job. Every job remains tied to its vault
epoch and commit/reconciliation state.

## Operation contract

The following actions describe the proposed semantics, not an implemented wire
API. Final names should follow the core's existing protocol conventions.

| Action | Required behavior |
| --- | --- |
| Open account | Resolve an account reference under a profile and vault epoch. Return capabilities and public identity, never a seed or spending key. |
| Scan and list | Bound public acquisition and return notes with explicit trust/currentness. No POI submission. Cancellation preserves the last committed checkpoint. |
| Prepare transfer or unshield | Bind the selected owned input, amount, asset, recipient, deployment, circuit identity and approval. Reserve input custody before authorizing a retained signed operation. |
| Submit retained operation | Accept an opaque operation reference. Persist the send transition before network delivery and submit those same transaction bytes. |
| Observe and resolve | Use retained custody and authenticated lineage. Distinguish unsent, possibly sent, included, resolved and conflicting states. A timeout never authorizes a replacement payment. |
| Prepare and submit POI | Keep local proving separate from disclosure. Review the list, output linkage and destination; reserve the attempt before POST. Unavailable status is not `Missing`. |

An approval binds more than the scalar passed to `RailgunSigner::sign`: account,
vault epoch, input/nullifiers, recipient, value, asset, chain/deployment,
bound-parameter hash, circuit and fee policy must agree with the reviewed intent.
The core must derive or verify that association; accepting any hash supplied by
JS would expose a blind signing service.

The existing daemon design trusts Electron main to present approvals. Binding
the reviewed structured intent prevents accidental mismatches and blind scalar
signing; it does not defend against a compromised main approving a malicious
intent. Page-specific approval binding belongs to the core's Phase 2 contract.

The unshield's public EOA signature has its own key reference, nonce journal,
destination and fee checks. Railgun spending signatures and Ethereum signing
are distinct authorization paths. A UI command cannot replace either one.

## Persistence and recovery

An operation record needs a format version, backend/circuit identity, authenticated
input binding, approved intent, the retained transaction/proof and append-only
submission history. Its transitions are serialized under the profile lock and
durably written before external effects. A successful storage write followed by
a lost reply returns a recovery obligation, not permission to start over.

Derived scan/TXID caches should identify schema, deployment, circuit and relevant
semantic compatibility. Avoid hashing every source file into every cache policy.
Retained authority still needs strict compatibility: a cache rebuild cannot
discard a signed operation, consumed submission or historical proof. No JS store
is reused or rewritten until an explicit migration reader and downgrade tests
establish its meaning.

Vault lock revokes new preparation/signing. Work before its commit point drains
and is discarded; a committed retained operation keeps its custody history and
can be observed after restart. Lock must not turn a possibly delivered send into
an unsent state. Keyless observation after lock is a separately specified
capability, not an implicit reopening of signing access.

## First integration scope

After the core migration settles, add a native-only prototype behind the core's
normal feature/capability boundary. Use public fixtures and an isolated local
SNARK-verifying POI service first. Require the
[Rust adoption gates](KOHAKU-RS-ASSESSMENT.md#replacement-decision), then a new
independent Alice-to-Bob live campaign. Existing funded custody remains on its
original backend until a separately reviewed migration is available.

Do not port all Electron host families into Rust or duplicate upstream protocol
code. Bring across the durable intent, custody, revocation and disclosure
semantics that the live tests established, and let upstream own reusable
protocol behavior. The existing JS example remains the comparison harness until
the replacement passes equivalent checks.
