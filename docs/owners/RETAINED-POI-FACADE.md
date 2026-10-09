# Retained POI facade candidate

The exclusive `session.openPoiRecovery({signal, reviewDisclosures})` lane connects
existing retained-POI owners. This candidate is source-tested, not native-qualified;
it is independent of the frozen .6 read-acceptance artifact. No package exports,
version, dependencies, production list trust or host ports change.

`prepareShield(holdId)` and `prepareTransact(holdId)` select exactly one row through
the genuine enrollment's existing-only reservations and original signing-recovery
window. Its receipt context and current row are reauthenticated. Only the selector
facts remain after that window; these are data, not authority. The chosen fixed
membership owner independently rechecks the actual creator type and full source
binding. The choice never relabels an input. There is no authoritative creator
type in the saved capsule; mismatch can require disclosed chain/source queries
before it is established. The review summary says so explicitly. A missing row,
wrong kind or failed row reattestation refuses before review/service admission.

After explicit exact-true review, the original membership owner supplies its
private receipt directly to `proveRailgunOwnPoi`; the original proved object goes
to the enrollment's genuine POI store `prepare`. Its digest/payload/revision are
read back before returning bounded prepared data, including the existing false
authority flags. Membership closes and its original closure settles before any
result is returned. There is no proof, selector, payload, receipt, key, store or
plan property on the public lane or result. The store remains enrollment-owned;
the companion does not close or substitute a borrowed cached store.

`submit(capsuleDigest)` prepares and revalidates a genuine private disclosure plan,
then calls the existing fixed submission controller. That controller receives the
unchanged owners/runtime and original staged review inventories. It keeps its
existing 790–840 second total bound and internally allocated stages; there is no
new wallet snapshot renewal. The facade caps each original review at 30 seconds,
checks actual monotonic time after original settlement, and boxes native Promise
fulfillment. Non-native thenables are never assimilated and conservatively
quarantine the lane/session. A callback must settle when cancelled; a pending
original keeps exclusion. The ordinary disclosure review still is a trusted-main
callback, not proof of a human gesture.

The submission method is terminal for its lane even on refusal. The original
controller's bounded `refused` or `recovery-required` outcome is preserved. A
matching RPC result remains a delivery diagnostic; it does not establish POI
acceptance. The genuine plan is never returned or reusable, and its original
closure is awaited. No automatic resend, rollback or compensation exists. A
new lane also remains subject to the existing durable attempted-store state;
only the explicit `retryAttempted` below can hand off the same request once more.

`recoverOutput(capsuleDigest)` invokes the existing completed output recovery
owner with the captured public destination after explicit read-disclosure review.
Only a bounded matched/refused projection leaves the lane. In particular,
`membershipAuthenticated`, `sourceAuthenticated`, `proofVerified`,
`originalInputReconstructed`, `originalRootsAccepted`, `disclosureEnabled` and
`spendingEnabled` remain false. It is not an acceptance observer or spend gate. This method accepts prepared
records only; an already attempted record is refused by that genuine owner.

`recoverAttemptedOutput(capsuleDigest)` is a separate fixed diagnostic route to
`recoverRailgunAttemptedPoiOutput`. It accepts attempted records only, preserves
the original owner's authenticated attempted-record/attempt-body binding and
shared exclusion, and passes no caller state flag or destination override. The
bounded matched projection includes `recordState: "attempted"`, the original
attempt-body digest, and false `eligibilityEstablished`, `attemptOutcomeKnown`,
`submissionAccepted`, and `retryEnabled`. It does not claim success or failure of
the prior submission and cannot resend it. Both routes have explicit read review
and original completion/close requirements.

Every lane belongs to the same private identity/enrollment/coordinator tuple and
session lifetime. Session machinery retains the companion's original methods and
closure; it cannot overlap another account lane. Separate accounts remain
independent. Closing revokes immediately and waits for original work, including
held native reviews and membership/plan drains. A failed/unknown original closure
rejects the session closure and retains same-account exclusion. Rejected work does
not free an uncertain process or turn a report boolean into authority.

## Explicit retry of an attempted submission

`retryAttempted(holdId)` is the only way to send an attempted entry's request
again. It is a separate, explicit lane action, never automatic. Its whole
allowance is one more handoff per attempted entry. The lane finds that entry from
local custody only: the hold's genuine selector, then exactly one attempted
intent with that selector. No capsule digest is supplied by the caller.

**Request.** It sends the identical stored request: the same body bytes, payload,
proof, JSON-RPC id and fixed destination. Nothing is re-proved, re-prepared or
re-serialized, and no replacement capsule can evade the limit.

**Preconditions.** The plan admits only an `attempted` entry that has exactly one
output commitment and no reserved retry. Validation runs through the same
attempted-entry handoff as a first submission. The review states that this is
the second handoff of the same proof to the same service.

**Status evidence.** The retry needs status evidence from this session's own
`observeOwnedPoi` read: the output's blinded commitment, a `Transact` type, the
required list and `Missing`. The facade keeps a candidate locally and publishes
it only after the read's cleanup and every final check succeed, immediately
before returning. Any rejected read, including a late cancellation, a deadline
crossed during cleanup or a failed drain, leaves none. Its time is taken just
before the status acquisition, so acquisition and cleanup count toward its age.
Each read clears the previous evidence first, and no caller value is accepted.

The sender binds the evidence to the payload's output commitment. It requires
the evidence to be under five minutes old both at the durable reservation and
again at send admission, which is checked before any transport exists. That is
an admission bound, not a guarantee about when bytes leave a newly established
Tor connection. A stale status never triggers another status query inside the
sender; it refuses. `Missing` is a prerequisite only. It does not establish
that the first request was never processed.

**Reservation.** Before any send, the intent store records
`retry: {reservedAt, bodySha256}` on the entry, writing a V4 document. The
reservation is consumed once written, including on refusal, crash, cancellation
or a missing response. A third handoff is refused across reopen and concurrency.
Ordinary reads of V2/V3 documents never migrate them. A V4 document refuses to
open in the pre-retry reader, so a downgrade cannot send again. Restoring a
pre-retry document behind the advanced floor refuses as before.

**Response diagnostics.** A non-200 or error response keeps its classification,
and now also carries a redacted category: envelope match, a JSON-RPC code class,
a message category from a fixed allowlist and a data category. These are
recorded within the existing 2 KiB cap. No raw message, data or body is kept.
The category grants no acceptance, retry or disclosure authority.

**Provenance.** The translated sources and the affected staged tests record
these changes as the newest reviewed phase
(`docs/owners/POI-RETRY-TRANSITIONS.json` and
`docs/owners/test-staging/POI-RETRY-ADAPTATIONS.json`), so the original bytes
still reconstruct.

## Replacement proof after a POI circuit rotation

Railgun's wallet 11.2.0 rotated the POI_3x3 circuit (bundle
`QmZ2MyM6TKxffkv6stuo2hFwmUfs3q4xgMYN164Sje8new`). Proofs from the retired
circuit fail verification at a POI service that uses the current key, however
correct their inputs. The package pins the current artifacts and keeps the
retired verification key (`src/execution/railgun-poi-retired-vkey.json`) for one
purpose only: deciding whether a stored attempted proof was made with it.

`reproveRetired(holdId)` finds the hold's attempted entry exactly as
`retryAttempted` does. It admits only an entry with a spent retry, one output
commitment and no replacement attempt. Eligibility is two completed
verifications of the exact stored original payload with node-compatible public
inputs: the retired key accepts it and the current key rejects it. A verifier
error or timeout refuses; it is never read as a rejection. The retired key
confers no validity, sends nothing and is no verifier fallback. After the read
review, it opens fresh membership, proves with the current circuit and records
the replacement on the same entry (`reproof`, a V5 document). Only the proof,
the POI and TXID roots and the checkpoint index may differ: the list, output
commitment and unshield marker must equal the original's. The original attempt
and retry bytes stay unchanged. Preparation may be revised, within the record's
revision bound, until the replacement is attempted.

`submitReproof(holdId)` hands the replacement off once. It is a new proof and a
further disclosure, not a resend: a new request with its own local-time ID and
body. It runs the same plan, review (`reproof-retained-poi`), cold validation of
the replacement payload, roots and final-account stages as a first submission,
and requires the same fresh owned `Missing` evidence as the retry, at the
durable attempt and at send admission. The attempt is written before transport
and is consumed once written, including on refusal, crash or a missing
response. A V5 document refuses to open in the V4 reader.

## One-shot owned-note observation

The existing Freedom live qualifier's `status` phase is the source model:
`qualify-railgun-private-live.js` checks the settled transfer journal, restores a
current wallet, finds that transaction's unspent Transact output, then calls
`openRailgunAccountPoi({wallet, ...owners, archive, noteIds:[output.id]})`,
`acquire()`, and `assertRailgunAccountPoi` with the exact original receipt.
Its `summarizeOwnedPoi` reports allValid only when there is exactly one `Valid`
status and both rootsAccepted and membershipVerified are true. The underlying
owner retains `ownershipAtSnapshot: true`, but explicitly leaves
`txidProvenanceVerified`, `reservationsChecked` and `spendingEnabled` false.

`session.observeOwnedPoi({noteId, signal, reviewDisclosure})` is a separate
exclusive one-shot operation. It reuses that original owner/acquire/assert/close
sequence with an existing-generation completed wallet. The caller noteId selects
data; it does not establish that a prior submitted transfer created it. Exact-true
review occurs **before** the wallet opens, so the summary truthfully identifies the
phase before authenticated note type/blind are available. It covers completed
wallet canonical source queries as well as the fixed selected POI query inventory.
There is no nullifier query, submission or transport authorization.

The 30-second original native review is part of the same 180-second total budget.
Both limits are checked using monotonic time after original settlement, regardless
of timer delivery. Callback promises must settle on cancellation. Direct thenables
are never assimilated and conservatively retain account exclusion. After wallet
opening, exactly one current unspent positive-value Shield or Transact note must
match the selector before POI contact. The original operation/receipt/wallet/owner
tuple is asserted, and original snapshot object identities are rechecked. Original
source/verification work, POI closure and wallet closure all drain before result
publication. Pending or unknown original closure keeps same-account exclusion.

The result contains the selected note id/type, one status, root/membership
booleans and the original false authority flags. `allValid` requires `Valid`,
`rootsAccepted` and `membershipVerified` together. `transferJoinEstablished`,
`txidProvenanceVerified`, `reservationsChecked` and `spendingEnabled` remain false.
No receipt, proof, owner, original observation or store is exposed. This is not an
extension of a read lane's already-observed closure. It has source/mock coverage;
no native service acceptance has been established by this successor.

An additional authenticated operation/journal join is needed before a future
method may label that selected output as the result of a particular prior
transfer. A caller transaction hash, retained output digest or `allValid` flag
cannot replace that join. No new semantic acceptance truth is invented by this
candidate. Likewise signed-unfinished original-signature proof regeneration still
requires its separate native qualification; this lane does not close that gap.

## Executable source admission checks

The focused owner-seam tests parse the actual original owner function bodies and
extract their exact option-key admission expressions. The real facade calls are
checked against those expressions before the mocked work runs: both membership
routes, proof creation, plan creation/revalidation/submission, prepared/attempted
output recovery and retained-store preparation. Conditional identity and
sourceDestination membership comes from those original expressions, not another
handwritten caller schema. Unknown expression syntax or multiple matching gates
fails the test instead of silently broadening it. Negative controls remove a
required receipt, add legacy filename/binaryKey fields and mix the two output
routes. This verifies argument-key compatibility; it does not claim execution of
real crypto, private native owners or genuine encrypted storage in these mocks.

For owned-note observation, the 45-second acquire argument bounds POI source acquisition. The unchanged membership verifier has its own default budget; the facade still applies one 180-second absolute lifetime across review, wallet restoration, acquisition, membership and cleanup. Cancellation begins wallet closure concurrently with the POI drain, and both original barriers must settle before publication. A never-settling review retains account exclusion until its original promise settles; cancellation is not evidence of settlement.
