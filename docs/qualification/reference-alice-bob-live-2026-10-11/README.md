# Independent Alice-to-Bob Sepolia journey — completed

The independently installed reference application completed native Shield,
Alice's private full-note payment to Bob, Alice's output-POI handoff, Bob's cold
receipt and Valid status, then Bob's finalized unshield. Three actual receipts
matched their recorded inclusion identities and passed the per-transaction and
aggregate gas caps. Shield net, transfer value, unshield received plus protocol
fee, and the available-private-note residual checks passed.

Alice and Bob used separate vaults, stores, funding EOAs, Railgun identities and
fresh Electron processes. Neither application imported Freedom source or opened
a Freedom profile. The payment used the root Kohaku adapter over a genuine owner
lane. Bob independently discovered the full output and used his own credentials
and TXID store. Alice's available-note list was empty after the transfer; Bob's
was empty after finalized unshield and wallet refresh. These are available-note
views, not a separate raw spent-row dump or EOA ETH balance reconciliation.
Charlie is a native synthetic negative control, not a live participant here.

## Retained-operation recovery

The Shield, transfer, first unshield preparation and one POI handoff used the
initial installation in INDEX.json. Bob's warm EOA review expired with a genuine
proved, unjournaled hold. Two explicit cold recoveries then expired during the
old source-workload bound, before an EOA review; no transaction was resent.
The initial preparation refusal's cause was not established.

The separately [qualified source recovery update](../reference-retained-source-recovery-2026-10-10/README.md)
was installed with a fixed new identity. Bob explicitly rebuilt derived public,
wallet and TXID state while retaining authenticated custody. Reads confirmed the
same proof-present hold, same unspent output and Valid POI. Cold submission reused
the original private spending signature and required a fresh EOA review. The
resulting single unshield was included, matched and resolved after finality.
The owner validates the stored capsule; this archive does not claim an additional
raw-proof byte comparison across installations.

Public scans and TXID synchronization needed explicit resumes. Returned progress
was durable; failed invocations and pre-signing refusals remain in local evidence.
No endpoint fallback, store reset, replacement payment or repeated POI handoff
was used. An early receipt command refused because resolution had not happened;
the final receipt read occurred only after settled journal state existed.

## POI and trust

Alice reviewed the foreign-output relationship before the single POI handoff.
Its HTTP 200 response was classified malformed. The body was not retained, so
its contents are not inferred from its byte count. Bob's later owned status
returned Valid with accepted roots and verified membership; that establishes
service status, not a generic signing permit. Unshield preparation and recovery
performed their own checks.

All chain observations retain `unverified-rpc`. Direct funding and transaction
submission create public links; this is not a relay-privacy demonstration. The
scope is Sepolia on the identified macOS arm64 installations, not mainnet,
circuit isolation, other platforms or an independent security audit. Subsequent
source changes do not inherit this exact live qualification.

INDEX.json binds the public installations and categorical outcomes. A salted
commitment binds the private accounting bundle and its verifier; the random
32-byte salt and per-run digests stay local. Unsalted hashes of predictable
wallet reports are not published because they can reveal enumerable identities. Account addresses, transaction hashes, amounts, precise times, notes,
holds, proof inputs and roots are intentionally absent. The detailed accounting
and failed-run history remain private and preserved locally.
