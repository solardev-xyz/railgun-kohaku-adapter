# Installed-package live journey runner

Package-owned driver for the bounded Sepolia continuation of a held private
self-transfer through the installed public owner facade and Freedom's genuine
host. One mode runs per Electron process. Every mode is chained to its
predecessor reports by hash, and every report hash is recorded in the
campaign ledger.

## Modes

| Mode | Sends | Main facade calls |
| ---- | ----- | ----------------- |
| `live-rebuild` | 0 | `openAccount({publicCache:'new'})`; advance to the finalized anchor; `openRead({wallet:'new'})`; `history`; G1 `describe` binds the held report; `resumeProof`; G1 `observe` must be `unjournaled` |
| `live-submit` | 1 (transfer) | G1 `describe` equals the rebuild binding; G1 `observe`; ledger reservation; `openRecovery().submitStored(holdId)`; journal readback; ledger finish |
| `live-observe` | 0 | Budgeted G1 `observe` until included, matched and 12 confirmations; then `resolve(12)` |
| `live-poi` | 0 | Scan continuation; transfer join (input spent by H, output created by H); `synchronizeTxid`; `prepareShield`; `recoverOutput`; one durable POI handoff `submit`; `recoverAttemptedOutput` |
| `live-poi-status` | 0 | One budgeted `observeOwnedPoi(output)` |
| `live-unshield` | 1 (unshield) | Fresh `allValid` status; ledger reservation; `openPrivate().prepareUnshield(output → enrolled EOA)`; `broadcast`; new hold by set difference; G1 readback |
| `live-summary` | 0 | Requires a matched, resolved, finalized unshield. Enforces exact value lineage (full input, full output, received plus fee), the held input spent by the transfer, residual unspent value equal to the rebuild's minus the input, successful receipts, and per-send and total fee caps |
| `live-reconcile` | 0 | Finishes an unfinished send record from the journal: G1 `observe` of the bound hold only |

Run `live-observe` after each send.

## Held transfer binding

The launcher pins the original held report to
`binding.heldTransferReportSha256`. That is the L-A `s3b` report live, or the
legacy harness report in synthetic runs. `live-rebuild` reads the report's
facts:

- owner;
- a `railgun-private-transfer` to `self` at full input value;
- `proved-unsent`, never attempted or journaled;
- the Shield transaction that created the input.

It then binds exactly one current transfer hold through the G1 lane's local
`describe`. That hold's authenticated input note must be the note the
reported Shield created (`txid`), unspent in this wallet scan at the finalized
anchor. It must be spent in full (`amount` equals the note) to the account's
own instance. Amount, position or being the only visible hold never identifies
it. The unspent fact is a wallet scan through the frozen remote RPC
(`unverified-rpc`); `submitStored` checks the nullifier on chain again before
sending. Later modes select holds only by the bound hold hash.

A send whose broadcast returned a hash finishes its ledger record at once; the
journal readback after it is best effort. If a process ends between the
reservation and the finish, only `live-reconcile` may follow. A journaled
attempt then finishes as `unknown` with its hash (observation only). Anything
else finishes as `unjournaled-after-refusal` and stops the campaign. That label
records no journaled attempt; it is not proof that nothing was sent. The
transfer's hold is bound by its hash. The unshield's new hold is found by set
difference against the hold hashes recorded in its reservation, which also
records the unshield's amount, recipient and asset.

If an unshield returns a hash but its new hold cannot be identified, the run
fails after finishing the ledger record, with no report. Only `live-reconcile`
can follow; it reissues the report once the hold is found.

A crash or lost report after the POI handoff reservation is a terminal stop
that requires diagnosis: `live-poi` refuses a pending handoff, and POI is never
submitted twice.

Synthetic runs accept `params.fault` (`exit-before-finish` or
`exit-before-report`). The process writes the synthetic chain state and then
kills itself with `SIGKILL`, leaving the profile lock to go stale after 30
seconds, as a real crash would. The launcher refuses any fault, and any
parameter other than `publicCache` (rebuild only), `maxMs` and
`poiStatusMaxAgeMs`, for a live request.

An uncertain send (`submissionStatus: 'unknown'`, or a refusal whose journal
readback shows an attempt) permits only observation. The campaign continues
only after G1 resolves that exact hold as `matched`, with 12 confirmations and
finality. A revert, an anomaly or a consumed nonce stops the campaign. So does
a refusal with no journaled attempt (`unjournaled-after-refusal`): the ledger
then refuses both POI and the unshield. An earlier resolution counts only with
`included`, `matched` and 12 confirmations. The unshield needs an owned POI
status of at most six hours; the parameter can only tighten that.

## Campaign ledger

The ledger is `PROFILE.installed-journey-ledger/installed-journey-1.jsonl`, a
new sibling of the profile. Earlier campaign directories are never read for
admission, written or moved.

The header binds:

- the profile;
- the Freedom and package commits;
- the tar sha256;
- the runner bytes;
- the campaign binding (original held report, previous ledgers, authorization
  and RPC);
- the caps.

Records are fail-closed and append-only:

- **Sends:** `send-pending` is written before any signing and `send-finished`
  exactly once. The transfer comes first and the unshield second. Nothing
  else is allowed.
- **Budgets:** each unit is reserved before its invocation. The live caps are:
  - observation: at most 40 per send, at least 90 seconds apart;
  - readbacks: at most 6 per send;
  - POI status: at most 8, at least 3 hours apart, within 24 hours;
  - scan openings: one `new` and at most two `pending`;
  - scan ranges: at most 260;
  - TXID pages: at most 90.
- **POI:** at most one `poi-pending`/`poi-finished` handoff, and only after a
  continuing transfer.
- **Reports:** one `report` digest per mode. The launcher records it only
  after a natural successful exit and its postchecks. A predecessor is
  admitted only if its digest is recorded here, so a failed invocation is never
  a predecessor. Crash recovery is the separate `live-reconcile` path, admitted
  from the ledger alone.

The header's previous-ledger hashes are historical references taken from the
final recovery outcome. This run neither re-verifies nor touches those files,
and no earlier ledger can be reset, replaced or used to start another attempt.

The launcher derives the header from the request on every check; a spec cannot
supply one. The runner hash covers every executed runner file, including the
launcher, the process owner and the synthetic copy contract. Live caps are fixed to the values above. A changed runner, binding,
profile, transport or cap refuses the whole ledger. Replay re-enforces every
budget record's maximum, spacing and window. A torn, extra or foreign record
refuses, as does any other file in the ledger directory (including `.DS_Store`). An exhausted budget stops the campaign; a new campaign
directory is not a way around it.

## The fixed Sentio continuation

The first live ledger froze `https://gateway.tenderly.co/public/sepolia`. Its
first 100,000-block scan window was refused, and the coordinator masks the
inner cause. Tenderly's documentation states a 3,000-result cap per call
(-32602) and a 1 GB daily response limit per IP. That cap cannot explain an
empty window. It states no block-span cap. A third-party report observed
spans above 1,000 blocks rejected with -32602 on Tenderly's Base gateway on
2026-10-04. This is plausible for Sepolia but unverified; the scan-window probe
observes it directly. The first ledger stopped with zero sends, no POI and no
report, after consuming one new rebuild, one pending resume and one scan
range.

Exactly one continuation exists, `installed-journey-sentio-1`. It freezes
`https://sepolia.rpc.sentio.xyz`, the endpoint the earlier L-A live scans used.
Its header binds:

- the stopped ledger's exact bytes and header hashes;
- the reason for the endpoint change.

Admission, rechecked on every read and write, requires:

- **same scope as the first ledger:** profile, transport, Freedom commit,
  package tar and held report;
- **stopped first ledger:** budget records only, of the three scan kinds; no
  send, POI or report.

Consumed budgets carry forward. There is no new rebuild (`publicCache:'new'`
refuses), one pending resume and 259 ranges remain, and send, POI and other
read budgets are untouched. Once the continuation writes, the first ledger is
closed. No other continuation name is accepted.

The continuation resumes the existing empty pending generation. A public
generation binds only the package policy, and a scan source is rebuilt per
process from the current endpoint. Only staged ranges record the provider set
(`providersSha256`), and the first ledger staged none. This is a reviewed
endpoint change, never a runtime fallback.

Synthetic runs model that reported behaviour with `synthetic.endpoint:
'limited'`, a second endpoint that answers spans above 1,000 blocks with
JSON-RPC -32602.

`scan-window-probe.cjs` is the bounded public screen for the continuation's
endpoint, run before any funded continuation. It checks the runner's aligned
100,000-block windows on the proxy address and the known public event, with at
most 12 requests, and makes one confirming Tenderly window request.

## Scan schedule, checkpoints and the fixed resume

Public scans use a conservative fixed operating schedule, the one the legacy
live qualifier used (it is not a demonstrated fix for the stopped scan): windows
of 100,000 blocks below block 5,700,000 and of 20,000 blocks from there. They
are aligned to their size from any cursor and capped at the finalized anchor.
Live runs pause one second between windows. Each window records its planned
target in its budget record. Each checkpoint the coordinator returns is
recorded durably (`scan-progress`).

The Sentio continuation's scan stopped part-way. It ran under the earlier
runner, which recorded neither targets nor checkpoints. Its k window
reservations committed k−1 windows of the 100,000-block plan from 0, and the
k-th failed: each reservation followed the previous `advancePublic` resolving,
which happens only after the coordinator's journal completes.

Exactly one further ledger exists, `installed-journey-sentio-resume-1`. It
binds the continuation, and transitively the first ledger, by bytes and header
hash, with the same scope and endpoint. It carries the chain's budgets forward
and closes both earlier ledgers. Its header carries:

- the reviewed extension: five pending openers in total instead of two, so
  three for the resume;
- the claim `resumeFrom {checkpoint, failedTarget}`, which the launcher
  verifies against the continuation's own reservations before any opener.

The public API returns a checkpoint only from a successful advance. A resume
therefore takes its candidates from the ledger: the last recorded checkpoint L
(a lower bound until production recovers it), or the claim's checkpoint, and
the last attempted window T beyond it, or the claim's failed target. Then:

1. The first attempt targets the schedule's next window after L. For adjacent
   20,000-block windows this is T itself; a wider earlier window (the old
   runner's 100,000 blocks) is never retried whole.
2. If it fails, the outcome is unknown; a refusal is never read as a recovered
   checkpoint. A second, separately budgeted attempt targets the schedule's
   next window after T.
3. If both fail, the resume stops. There is no third target for the pair.

The scan source refuses any window with more than 4,096 logs, more than 4 MiB
of log JSON, or logs in more than 512 distinct blocks. On live Sepolia,
[9,000,000, 9,099,999] holds 1,033 logs in 548 distinct blocks, so it can
never be acquired whole. Its 20,000-block parts hold at most 304. The first
resume link targeted that whole window under the earlier rule and was refused;
its transport trace shows a complete `eth_getLogs` answer and no event-header
read after it. The same bound strongly supports, but did not directly observe,
the cause of the continuation's earlier stop at that window: its inner error
was not retained. Resume safety rests on production recovery, never on
knowing which state a stopped window left.

Exactly one second link exists, `installed-journey-sentio-resume-2`. It binds
the first resume by bytes and header. That predecessor may hold scan budgets
and its `resume-attempt` record, but no checkpoint, send, POI or report. The
link carries the same claim, which the launcher also checks against the first
resume's windows. It keeps the aggregate caps (five pending openers in total)
and changes only the target rule.

The coordinator recovers its own checkpoint and chooses each window's start;
recovery may itself re-acquire, apply and write. A target beyond the
production range cap from the true checkpoint is refused at acquisition,
without any request for that window, so no block can be skipped. Only a
successful production result establishes progress.

**Opener allocation.** The resume has three openers:

- the first and second targets for the stopped window;
- one more, for a later window left ambiguous, for example by a crash between
  the coordinator's commit and the checkpoint record.

Openers are spent in order. Each window's pair still gets at most its two
targets, and once the three are used the resume stops for review.

The 260-range cap counts window invocations only. Recovery re-acquisitions and
RPC requests are not ranges.

Live failure records include a sanitized transport trace: method, HTTP status,
closed error code, elapsed time and size, never a URL, parameter or body.

Synthetic runs need a larger, synthetic-labelled range cap: the fixture's
finality jumps by about 5.9 million empty blocks at the first mined block. Live
caps are unchanged.

Synthetic-only scaffolding reproduces the stopped states:

- `legacyPlan` runs the earlier runner's plan;
- chain faults `failLogsFrom` and `failApplyRefreshTo` model a failure before
  acquisition completes, and one after the coordinator prepared and applied a
  window, leaving a pending application for recovery;
- `denseFrom`/`denseTo` mark an interval where a request wider than 20,000
  blocks answers with 600 well-formed `Nullified` logs in 600 distinct blocks.
  The real `normalizeLogs` refuses it at the 512-block bound before any further
  processing, as live Sepolia does around 9.0M. 20,000-block requests answer
  with the chain's true logs. Synthetic events that also pass projection would
  need consistent TXID and tree records, so the split windows' union identity
  is shown on public Sepolia data instead;
- `legacyResumeRule` reproduces the first link's whole-window first target;
- `exit-after-advance` models a crash before the checkpoint is recorded.

## Composition

**Live (`transport: 'live'`)** uses:

- the genuine Freedom host at the adoption commit, with the final tar
  installed exactly (no transform) and the authentic list policy;
- the existing profile in place, unlocked with its safeStorage credential under
  the user's HOME;
- `FREEDOM_WALLET_TOR_EXPERIMENT=1` (unpackaged).

These are qualification routing overrides, not ordinary production startup:

- a dedicated bundled Arti from `scripts/qualify-ppv2-live.js
  openLiveTransport`, injected as `tor-manager.getWalletSocksEndpoint`;
- a custom Sepolia registry entry for one fixed RPC, with `readOrder:
  ['direct']` (direct means no Freedom RPC proxy; requests still use the
  wallet Tor transport).

There is no clearnet path and no fallback endpoint. The entry asserts that the
transport's RPC is the request's frozen URL. Every reviewer asserts the
disclosed destinations against it: the held-submission destination with the
`tor-experimental` transport, and the retained source, protocol and transaction
RPCs of each send summary. Circuit isolation is not qualified. Each report
records the Arti version, its hash and the RPC.

**Synthetic (`transport: 'synthetic'`)** runs the identical modes against the
`../installed-journey` chain. That chain auto-mines pending sends, uses a
synthetic test list, and runs on a disposable profile created by the legacy
harness. Synthetic caps use short spacing and are labelled synthetic.

## Usage

```sh
node live-launcher.cjs make-request <spec.json> <request.json>
node live-launcher.cjs run <request.json> <request-sha256>
node public-probe.cjs <freedom-root> <fresh-output-directory>
```

Before Electron starts, the launcher verifies:

- host commit and exact status;
- installed package versus tar;
- runtime, Electron and Arti pins;
- recipe bytes;
- predecessor report hashes, which must be recorded in the ledger;
- send admission.

After exit it repeats the immutable checks (never the pre-run send
admission), records the report digest on success, and writes `RESULT.json`. Live failure
records contain only codes and source frames; synthetic ones also keep
milestones.
