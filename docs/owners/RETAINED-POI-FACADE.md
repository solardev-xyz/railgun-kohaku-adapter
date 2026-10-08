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
new lane also remains subject to the existing durable attempted-store state.

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

## Separate owned-note observation proposal

The existing Freedom live qualifier's `status` phase is the source model:
`qualify-railgun-private-live.js` checks the settled transfer journal, restores a
current wallet, finds that transaction's unspent Transact output, then calls
`openRailgunAccountPoi({wallet, ...owners, archive, noteIds:[output.id]})`,
`acquire()`, and `assertRailgunAccountPoi` with the exact original receipt.
Its `summarizeOwnedPoi` reports allValid only when there is exactly one `Valid`
status and both rootsAccepted and membershipVerified are true. The underlying
owner retains `ownershipAtSnapshot: true`, but explicitly leaves
`txidProvenanceVerified`, `reservationsChecked` and `spendingEnabled` false.

A separate proposed read-lane `observePoi(noteId, {reviewDisclosure})` should reuse
that exact owned-note owner/acquire/assert/close sequence and fixed current wallet.
A caller noteId selects data; it does not establish that a prior submitted transfer
created it. Review must precede the selected commitment/list/root query, and the
original source/verification job plus POI closure must drain before release.
Return the precise diagnostic flags and bounded status/root observations, with no
receipt and no spending-eligibility upgrade. This method is not implemented here.

An additional authenticated operation/journal join is needed before a future
method may label that selected output as the result of a particular prior
transfer. A caller transaction hash, retained output digest or `allValid` flag
cannot replace that join. No new semantic acceptance truth is invented by this
candidate. Likewise signed-unfinished original-signature proof regeneration still
requires its separate native qualification; this lane does not close that gap.
