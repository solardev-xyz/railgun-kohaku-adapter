# Private relay and public TXID facade successor

Basis: `8f7ed18694e4d2b9470e509f356729f177c098c3` (itself includes parent40ef9bd and first-stage a9df3c). Earlier freezes remain unchanged. This extends only the private facade and its controlled tests. There is still no package export, version, installed activation or native qualification claim.

## Fixed relay lanes

`session.openRelayLocal({wallet,signal,review,reviewDisclosure,reviewStagingDisclosure,reviewRootDisclosure})` requires genuine fenced enrollment and opens the existing wallet owner with the closed cache mode. It returns only `{prepare,signal,closed,close}`. `prepare({noteId,quote,gas,maxFee,signal})` snapshots canonical public quote/gas data, reads the genuine selected owned-note type, and is single-use. Shield goes directly to the existing relay controller. Transact invokes the existing staging controller first, retains the exact replacement account and receipt before any post-await currency check, then supplies those original objects internally to the existing proof controller. It preserves the original request signal for receipt matching. No caller may supply a receipt, owner, window, proof or permit. The four review callbacks go unchanged to the existing fixed gates; the Shield branch does not authorize or invoke the Transact staging/root callbacks.

The fresh lane closes after its original operation settles, but its independent closed promise still waits actual account cleanup. A late staged replacement after cancellation is closed and cannot reach proof. Evidence-scope closure runs only after original operation settlement and does not reassert pre-key expiry after issuance. Existing signing/custody ordering and failure results are untouched; no automatic retry, discard or transport is added.

`session.openRelayRecovery({signal})` opens exactly one genuine completed wallet using an internally obtained destination observation. The original completed account has its existing <=180-second lifetime; no facade timeout is supplied or renewed. It projects `{list(after=null),resume(operationId),discard(operationId),signal,closed,close}`. Every call uses that same account and original owners. No quote, staging, review/disclosure renewal, active scan, receipt reconstruction or signing path is introduced. Only resume receives the fixed captured proof runtime paths. Existing ready-local C-only verification remains selected by the existing controller, not a new facade flag. The completed account's own expiry aborts the facade lane.

Both lanes retain original controller work plus original account close. Unobserved staging/review/continuation errors retain facade exclusion. Local results remain the existing bounded status/operationId projections; no raw signatures/proofs/records are exposed. This is local custody, not relay sending.

## Public TXID synchronization

`session.synchronizeTxid({mode,signal,reviewDisclosure})` admits only:

- `initialize`: explicitly create-if-missing (never reset) and one bounded advance.
- `advance`: existing-only opening and one bounded advance.
- `checkpoint`: existing completed-only opening and inspection; no repair or advance.

No wallet/plugin/recovery lane may be active. Before the TXID opener, storage/phase claim or service query, the facade invokes the explicit disclosure callback with a deeply fixed public summary and native cancellation signal. It lists the pinned POI/indexer endpoints and latestTxid, validateTxidRoot and (where relevant) txidPage methods, public cursor/root sources, one-page100-row query bound, and truthful lack of exact cursor/root values before authenticated open. It explicitly grants no selected membership/nullifier query, signing or relay transport. Non-checkpoint opening may replay an authenticated pending page before its one new advance; the summary states this.

Only exact true permits opening. Native callback fulfillment is boxed without thenable assimilation. The real 30-second monotonic deadline is checked after original settlement as well as signaled by a timer. No cancellation/timeout race releases the original callback. Declined consent leaves the session reusable with zero TXID opener calls. An unobservable callback quarantines admission. The fixed opener receives only genuine enrollment/coordinator, captured engine archive, mode-derived create/checkpointOnly and the combined original signal; no caller service, rows, policy or timeout.

The result is bounded data: count, root, checkpointAvailable, capacityReached, serviceLatestIndex, pending:false, unverified:true, spendingEnabled:false. It is returned only after the original TXID owner close/worker drain; no witness, receipt, journal or authenticated authority object crosses the facade. Callers may deliberately request another page through another reviewed invocation, never an internal unbounded loop or automatic retry.

## Lifecycle refinements

- Actual identity/enrollment/public-owner revocation now closes the whole session and its public signal. Intentional public cache replacement detaches that old owner's abort listener before closing it; it does not abort the entire account accidentally.
- Idle bookkeeping runs inside callbacks registered on each original promise, before a caller's await-then-action continuation. Species-selected return objects are still ignored. This avoids requiring artificial extra microtasks between sequential cold actions or closing one lane and opening another.
- Every cleanup rejection, including undefined, is failure rather than successful drain. Original method rejection objects remain unchanged; bookkeeping reads only an own data `code` field and never invokes a rejected object's getter. Unknown observation and cleanup failure continue to retain account/profile exclusion.

## Validation and remaining acceptance

Full `npm test -- --runInBand`: 60 suites / 1,956 tests passed. Strict changed-file ESLint (cached Freedom config/tool, max warnings zero), relevant formatting and generated fixed source membership check passed. Membership remains243files; no new runtime module was added in this successor. A distinguishing control removing the monotonic TXID deadline check failed its delayed-timer test; the original source was restored exactly.

New controlled tests cover Shield/no-staging, Transact exact replacement/receipt/signal, late staged return and original drain, typed unknown exclusion, unfenced relay denial, one completed account across cold operations, immediate await-then-action semantics, each TXID mode, decline/late/thenable approvals, held review shutdown, TXID late open/worker drain, original owner revocation and undefined rejection. Existing genuine private enrollment/credential tests remain in the full suite. Facade owner algorithms are mocked in these focused compositions: actual installed package/controller/crypto/storage acceptance still must run separately under parent-owned reviewed native qualification. No live service, funded profile, native utility, crypto archive or dependency installation was used here.

The current operational surface is implemented privately, including read/private/public, retained private recovery, local/completed relay, public generation maintenance and TXID synchronization. Independent source review, final public entry/types, the exact packed-list gate and real installed-host acceptance remain outstanding. Generic qualification-only receipt/store/process helpers remain private repository tooling, not facade API.
