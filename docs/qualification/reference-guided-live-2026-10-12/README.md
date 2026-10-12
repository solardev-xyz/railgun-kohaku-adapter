# Guided Alice-to-Bob Sepolia lifecycle on one frozen installation

The installed reference application completed the guided native Shield, Alice's
full-note private payment to Bob, one output-POI handoff, Bob's independently
observed Valid status, and Bob's finalized full-note unshield. All three actual
receipts matched the recorded inclusion identities and passed the configured
gas ceilings. Shield net, transfer value, unshield received plus Railgun fee,
and available private-note residual checks passed.

The source, packed package, host, configuration, Electron and protocol runtime
remained fixed throughout. The run used separate Alice and Bob vaults, stores,
funding EOAs, Railgun identities and fresh processes. Bob discovered the exact
payment through his own scan and synchronized his own TXID store. Alice's
available-note list was empty after payment; Bob's was empty after finalized
unshield and wallet refresh. This checks available notes rather than a raw spent
row dump or full EOA ETH balance reconciliation. A live third-account ownership
control was not part of this run.

## Interruptions and retained custody

Public scans and TXID synchronization required explicit continuations. Returned
progress was retained. Some sanitized refusals did not establish their underlying
cause, so they are not all attributed to transport failures. Owner reviews also
expired during operation; expired replies were not reused as consent.

Bob's initial preparation produced a genuine retained proof. Its warm EOA review
expired before the answer was accepted. The guide found the exact proof-present
hold and the owner observed it as unjournaled. A first cold disclosure review
also expired, followed by a second unjournaled observation. The supported cold
submission reused that hold and original private spending signature, required a
fresh EOA review, and produced the single unshield transaction. No package,
derived-state generation or retained custody was replaced for this recovery.
The owner authenticates the capsule; this record does not claim a separate raw
proof-byte comparison.

All invocation results were closed before accounting. Two original offline
plan creations predate admission files; two offline funding-address records have
explicitly marked admission backfills. Later network/private steps retain their
original admissions. The verifier binds every
selected result to its actor, original guided step, installation and causal
order. Hashless expired-review outcomes are accounted through subsequent owner
observations of the original hold, not through an assumption that no reported
hash means no transaction. Separate per-actor finalized and pending nonce reads
provide an additional RPC cross-check of the three receipt-verified transactions.
Those reads use separate processes and actor contexts; circuit isolation remains
unqualified.

## POI and operation of the guide

Two POI offers ended at the final review before any attempt. The third offer
made the one actual handoff. Its HTTP 200 response was classified malformed;
the response body was not retained and is not inferred from its byte count.
Alice recovered the attempted output locally. Bob subsequently observed Valid,
with accepted roots and verified membership for his exact Transact note. That
owned Valid status provides the acceptance evidence. Preparation and signing
still perform their own owner checks.

An AI agent operated the original prompts under the user's concrete disclosure,
transaction and fee authorization. Bounded operator helpers checked already
inspected review bytes or the exact agreed transaction fields and answered
within the original callback. They did not edit application bookkeeping, create
authority receipts or extend review/evidence lifetimes. The guide's state
machine and genuine owners chose the steps. The independent human walkthrough
remains open.

Operator wrappers and helpers were introduced or revised during the run outside
the frozen installation. Their per-invocation source versions were not recorded;
the original review/results metadata and final accounting verifier are sealed
in the private evidence bundle. These changes did not alter installed bytes or
edit the guide's saved state.

## Evidence and scope

INDEX.json identifies the frozen installation and categorical outcomes. A
domain-separated salted commitment binds the private accounting, verifier,
nonce reports and per-invocation metadata. The random salt and detailed evidence
remain local. Transaction hashes, addresses, amounts, precise times, notes,
holds, proofs and roots are omitted from this public record, as are unsalted
hashes of predictable wallet reports.

Observations and finality retain `unverified-rpc`. Direct funding and EOA
submission create public links. The qualified scope is this installed guided
direct-Sepolia run on macOS arm64. Mainnet, relay privacy, circuit isolation,
additional native platforms and external security review remain separate goals.
Later source changes do not inherit the frozen installation's live result.
