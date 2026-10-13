# Kohaku Rust backend assessment

The preferred next backend candidate is the Railgun work in
[ethereum/kohaku-rs PR 49](https://github.com/ethereum/kohaku-rs/pull/49).
Contribute shared protocol tests and small correctness fixes there, then close
the host-control gaps before a Freedom integration. Keep this adapter and its
reference wallet as the qualified comparison implementation. Existing funded
stores and retained operations are not migration fixtures.

This assessment is pinned to upstream
`da0b0b1f57f1351d5223a741583c0f3f46595531` on October 13, 2026. It does not
transfer this repository's live evidence to Rust. The Rust branch is still a
draft and its APIs may change.

## Checks completed

The upstream native library baseline passes 51 tests on macOS arm64 with the
existing lockfile and Rust 1.99. The
[engine interoperability contribution](https://github.com/ethereum/kohaku-rs/pull/56)
adds four tests: three engine-derived key pairs, nine addresses, fifteen
deterministic signatures and four TXID shapes. Native library and release tests
pass 55 tests; all-target/all-feature checking also passes. Five existing live
tests remain ignored. Clippy succeeds with upstream warnings; no new warning
points at the added module. A second reviewer reproduced the fixture exactly.
WASM and a Rust live journey are not qualified by these results.

The expected values come from the published Railgun engine 9.6.0, including its
actual derivation, address, signature and TXID functions. Account 0 also agrees
with the engine maintainers' hand-written expectations. Rust starts from those
derived private keys; mnemonic derivation is not tested. An external signer
uses public spending key material, a viewing key and public fixture signatures,
with no spending key stored in that signer. This establishes interface and
mathematical compatibility, not hardware approval or transaction custody.

The [bounded native harness](../../tools/kohaku-rs-evaluation/README.md) separately
reopens a disk-backed checkpoint and public dummy note, registers two distinct
accounts and injects a sync outage. It checks restoration, account separation
and retention of the saved checkpoint when that outage occurs before writes. The fixture directly
seeds local state: it does not prove authentic note discovery, chain inclusion,
encrypted storage, process-crash durability or spending authority.

The [loopback POI response contribution](https://github.com/ethereum/kohaku-rs/pull/57)
found that a different request id and a declared
`jsonrpc` other than `2.0` were accepted. The focused response fix binds both before interpreting
the result or error. The address tests found a panic on checksum-valid truncated
payloads and acceptance of a legacy checksum. The
[decoder contribution](https://github.com/ethereum/kohaku-rs/pull/58) requires
the Railgun Bech32m checksum, canonical zero padding and exactly 73 decoded bytes. Both contributions
use public synthetic inputs only and change no dependencies.

The [explicit POI-control draft](https://github.com/ethereum/kohaku-rs/pull/59)
adds submission-free sync and a separate
processing action while preserving automatic convenience sync. Its public
provider test checks the persisted queue and exact loopback requests, and a
mutation that restores automatic processing is caught. It remains a draft API:
owned reads still occur, processing covers the entire queue, and no per-proof
review or durable submission journal is added. A provider-level manual policy
would further prevent an accidental automatic-sync call.

All four contributions together pass 66 native library tests in the
all-target/all-feature release run, with the existing live tests left ignored;
the combined WASM library check also passes. The upstream workflow targets
`master` pull requests, so these feature-branch PRs do not run that Rust CI.
Manual validation is recorded in [the evaluation results](../../tools/kohaku-rs-evaluation/RESULTS.json);
GitGuardian checks are separate from Rust test coverage.

## Requirements before Freedom adoption

| Requirement | Upstream at the pinned revision | Next action |
| --- | --- | --- |
| License and approved dependency sources | No repository LICENSE or crate license metadata is present. Core's cargo-deny source policy does not allow this repository or its ark-circom git fork. | Resolve upstream licensing and approve immutable dependency sources; pass core's cargo-deny check before adoption. |
| Secret lifecycle | Spending, viewing, nullifying and shared key types are `Copy`, serializable and printable, with no zeroization. | Harden secret types and their internal copies/lifetimes; stop and drain the provider/account/proving runtime on lock. A wrapper alone cannot wipe copies made internally. |
| External spending signer | `RailgunSigner::sign` is async and fallible; spending private key does not cross the trait. Viewing key does. | Implement inside the core trust domain and bind signing to an approved operation, not an arbitrary scalar from JS. |
| Control every network path | Chain provider, UTXO syncer and store are injectable. POI, TXID Subsquid and artifact clients are constructed internally. | Inject those remaining clients; coordinate with the existing Tor PR 50 instead of building a second Tor stack. |
| Explicit POI disclosure | `sync_to` can recover, prove and submit pending POIs. Notes/balance listing and sync recovery also query owned commitments. | Separate proof processing from sync, and gate owned status/membership reads independently. Automatic convenience behavior can remain for callers that choose it. |
| Distinguish absence from outage | POI client errors propagate, but the provider's note listing maps a status error to `Missing`. | Preserve unavailable/unknown separately. Only a completed owned `Missing` observation can authorize retry. |
| Retained transaction custody | Building returns proved transaction data; the provider persists notes, trees and pending POI work. No equivalent of this adapter's durable held-operation/send journal is exposed. | Design the journal at the application boundary; prove restart and uncertain-send behavior before using real funds. |
| Artifact compatibility | Artifacts are pinned to a Git commit, including regenerated POI circuits. The loader downloads and decompresses them internally. | Inject acquisition, enforce content identity and size bounds, and test current/retired-key and bad-artifact controls. |
| Core-compatible runtime | The crate includes async I/O, HTTP, plain note storage and native JIT witness generation; some untrusted-input paths can panic. | Integrate at the daemon runtime layer, encrypt note storage and verify typed failures or isolation. Test signed/hardened macOS packaging without assuming the key-holding core can acquire JIT entitlements. |

The viewing key is sensitive: it decrypts notes and derives nullifiers used to
observe spending. It is not an incoming-only public credential. The signer
seam solves spending-key custody, not every privacy or approval requirement.

POI queue pruning is separate from release of a signed transaction. Dropping a
local pending proof after a grace period does not establish that a retained
transaction cannot later land. A spend journal must preserve uncertainty until
authenticated chain observation resolves it.

## Upstream work to coordinate

PR 49 already includes the TXID/root fixes, larger note values, external signer,
current POI artifacts and pending-POI pruning. Related open work includes
[Tor transport PR 50](https://github.com/ethereum/kohaku-rs/pull/50),
[native unshield PR 52](https://github.com/ethereum/kohaku-rs/pull/52) and
[experiment checklist issue 25](https://github.com/ethereum/kohaku-rs/issues/25).
That checklist includes a local POI proof/submission test, the right place for a service that actually verifies SNARKs,
including a retired-circuit rejection and a current-circuit success. A fixture
that accepts the JSON shape alone repeats the gap that our first live POI
qualification exposed.

The first contributions are offline interoperability and two independently
reviewed boundary fixes. The next API contributions should be small: explicit
POI submission, distinct unavailable status, then client injection compatible
with the Tor work, followed by secret-type/lifetime hardening. Host-specific approval budgets, Electron process machinery
and this qualification campaign's ledger chain do not belong in upstream
protocol code.

## Replacement decision

Move reusable cryptography, note processing and proving toward upstream when
the following evidence exists:

1. Upstream licensing, source approvals and the complete dependency graph pass
   freedom-core's cargo-deny policy.
2. Secret types cannot be casually copied, printed or serialized; lock revokes
   and drains all key-bearing work and wipes derived-key caches. Note storage is
   encrypted under the vault lifetime.
3. Public fixtures agree for the supported operation shapes and current circuits.
4. A test fails on any unexpected direct connection from RPC, indexer, POI or
   artifact acquisition; cancellation drains all in-flight work.
5. Listing, balance and scan perform no owned POI reads or proof posts unless a
   scoped disclosure is explicitly approved. An outage never becomes
   authenticated `Missing`.
6. A retained operation survives restart; a dropped broadcast response permits
   observation of that same operation without signing a replacement payment.
7. Untrusted inputs fail with typed errors or bounded isolation, and native
   witness generation passes the actual signed/hardened packaging checks.
8. An independently funded Rust Alice-to-Bob lifecycle completes with authentic
   owned POI, finality, conservation and actual receipt fees.

Until then, freeze expansion of the JS protocol backend and retain its qualified
reference implementation. Passing the gates can make this repository a thin
compatibility layer, a conformance/example project, or a historical archive.
No continuing product need is assumed merely because the implementation exists.

Source anchors at the pinned revision:
[builder](https://github.com/ethereum/kohaku-rs/blob/da0b0b1f57f1351d5223a741583c0f3f46595531/crates/railgun/src/builder.rs),
[signer](https://github.com/ethereum/kohaku-rs/blob/da0b0b1f57f1351d5223a741583c0f3f46595531/crates/railgun/src/account/signer.rs),
[key types](https://github.com/ethereum/kohaku-rs/blob/da0b0b1f57f1351d5223a741583c0f3f46595531/crates/railgun/src/crypto/keys.rs),
[provider](https://github.com/ethereum/kohaku-rs/blob/da0b0b1f57f1351d5223a741583c0f3f46595531/crates/railgun/src/provider.rs),
[POI provider](https://github.com/ethereum/kohaku-rs/blob/da0b0b1f57f1351d5223a741583c0f3f46595531/crates/railgun/src/poi/provider.rs),
[POI client](https://github.com/ethereum/kohaku-rs/blob/da0b0b1f57f1351d5223a741583c0f3f46595531/crates/railgun/src/poi/client.rs),
[artifact loader](https://github.com/ethereum/kohaku-rs/blob/da0b0b1f57f1351d5223a741583c0f3f46595531/crates/railgun/src/circuit/remote_artifact_loader.rs).
