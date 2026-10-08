# Held submission facade candidate

The exclusive `session.openSubmissionRecovery({signal, reviewDisclosures})` lane
connects one existing signed private hold to the existing EOA transact recovery.
It observes and resolves the journaled public submission of that hold; it never
proves, signs, sends, retries, rewrites the journal or releases the hold. This
candidate is source-tested, not native-qualified.

## Binding

`observe(holdId)` and `resolve(holdId, options)` first select exactly one
`signing` row through the genuine enrollment's existing-only reservations and
original signing-recovery window, and reauthenticate its receipt context and
current row. Only its kind, tree, nullifier, zero-proof signing digest
(`facts.intentDigest`) and signing submitter leave that window.

Before any review, the lane requires:

- the hold's signing submitter to equal the fixed wallet-0 submitter metadata
  (index 0, mnemonic); a caller never names the journal address;
- the engine context and a transaction-RPC context for that submitter to name the
  same current profile, both on Sepolia.

The Freedom journal is itself keyed by profile, chain and submitter.

After exact-true review, the lane opens `openRailgunTransactRecovery(submitter)`
and reads the complete journal. The only accepted join is a `railgun-transact`
journal intent whose `intentDigest`, `nullifier`, `tree` and `operation` equal
the hold's. `intentDigest` is the zero-proof signing digest bound into both the
reservation and the journal; it is distinct from the journal's outer `digest`
over chain, sender, target, value and calldata. Never the last row is chosen.

- Exactly one match: that record's hash is observed.
- No match after a complete successful read: `unjournaled`, with no hash. This is
  not evidence that nothing was submitted, never proves the input unspent and
  never enables a submission.
- More than one match, or any open/list/read failure: refused.

This is also how a cold caller recovers the exact attempt after `submitStored`
returned `recovery-required` without a hash: only the hold id is needed.

## Disclosure

The single observation review names the hold, operation, public submitter, the
transaction-RPC destination role and the exact request inventory the original
endpoint readiness check, nonce reconciliation, receipt match and finality checks
may issue: `eth_blockNumber`, `eth_chainId`, `eth_getBlockByNumber`,
`eth_getTransactionByHash`, `eth_getTransactionCount`, `eth_getTransactionReceipt`.
It keeps `signingEnabled`, `sendEnabled`, `retryEnabled` and
`holdReleaseEnabled` false. Review rules equal the retained POI lane: exact
`true` within 30 seconds, native Promise fulfillment boxed, thenables never
assimilated and conservatively quarantining the lane.

## Observation

The projection carries the hold id, kind, transaction hash, the journal
observation (`status`, block number/hash, confirmations), the receipt match
status and block, a public output, `resolved`, `trust: "unverified-rpc"` and
false `submissionEnabled`/`retryEnabled`. No nullifier, commitment, calldata,
proof, ciphertext or raw receipt leaves the lane. An output is projected only for
a `matched` Transact receipt:

- private transfer: `{kind: "shielded", noteId: "<tree>:<position>"}`;
- token unshield: recipient, amount, received, fee, fee deviation;
- partial unshield: change note id plus the unshield fields.

The output location is receipt-derived RPC data. It is not proof of ownership,
POI eligibility or verified chain correctness.

## Resolution

`resolve(holdId, {minimumConfirmations})` accepts 3–64 confirmations; the live
journey caller keeps 12. It refuses an unjournaled or already resolved hold
before calling the original `recovery.resolve`, whose double inspection,
finality reads and private resolution permit are unchanged. The second review
receives only a sanitized resolution summary (the observation projection,
finalized block number, `allowsNextTransaction: true`, `releasesHold: false`);
only then does the lane return the fixed reconciler decision
`{allowNextTransaction: true, acceptedEvidence: "unverified-rpc"}`.

The returned outcome is the journal's permit-checked `resolution.railgun.outcome`
(`matched` or `reverted`), cross-checked against the reviewed receipt match.
Pending, anomaly, nonce-consumed or mismatched observations cannot resolve as
success: the original recovery refuses them. A reverted resolution unblocks the
journal but carries no output and ends that journey. Resolution never releases
the private hold or permits replay.

## Lifetime

The lane has the companion lifetime of the other retained lanes: exclusive under
the session, one operation at a time. Closing the lane, the session, or any owner
signal synchronously closes the independently created transact-recovery scope.
`closed` settles only after the pending original operation has settled.
