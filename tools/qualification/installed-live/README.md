# Installed-package live journey runner

Package-owned driver for the bounded Sepolia continuation of a held private
self-transfer through the installed public owner facade and Freedom's genuine
host. One mode runs per Electron process. Every mode is chained to its
predecessor reports by hash, and every report hash is recorded in the
campaign ledger.

## Modes

| Mode | Sends | Main facade calls |
| ---- | ----- | ----------------- |
| `live-rebuild` | 0 | `openAccount({publicCache:'new'})`; advance to the finalized anchor; `openRead({wallet:'new'})`; `history`; `resumeProof`; G1 `observe` must be `unjournaled` |
| `live-submit` | 1 (transfer) | G1 `observe`; ledger reservation; `openRecovery().submitStored(holdId)`; journal readback; ledger finish |
| `live-observe` | 0 | Budgeted G1 `observe` until included, matched and 12 confirmations; then `resolve(12)` |
| `live-poi` | 0 | Scan continuation; transfer join (input spent by H, output created by H); `synchronizeTxid`; `prepareShield`; `recoverOutput`; one durable POI handoff `submit`; `recoverAttemptedOutput` |
| `live-poi-status` | 0 | One budgeted `observeOwnedPoi(output)` |
| `live-unshield` | 1 (unshield) | Fresh `allValid` status; ledger reservation; `openPrivate().prepareUnshield(output → enrolled EOA)`; `broadcast`; new hold by set difference; G1 readback |
| `live-summary` | 0 | Scan through the unshield; residual notes; public receipts of the two hashes; conservation checks |
| `live-reconcile` | 0 | Finishes an unfinished send record from the journal: G1 `observe` of the bound hold only |

Run `live-observe` after each send.

A send whose broadcast returned a hash finishes its ledger record at once; the
journal readback after it is best effort. If a process ends between the
reservation and the finish, only `live-reconcile` may follow. A journaled
attempt then finishes as `unknown` with its hash (observation only). Anything
else finishes as `unjournaled-after-refusal` and stops the campaign. That label
records no journaled attempt; it is not proof that nothing was sent. The
transfer's hold is bound by its hash. The unshield's new hold is found by set
difference against the hold hashes recorded in its reservation.

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
- **Reports:** one `report` digest per mode. The launcher accepts a
  predecessor only if its digest is recorded here.

The launcher derives the header from the request on every check; a spec cannot
supply one. Live caps are fixed to the values above. A changed runner, binding,
profile, transport or cap refuses the whole ledger. Replay re-enforces every
budget record's maximum, spacing and window. A torn, extra or foreign record
refuses, as does any other file in the ledger directory (including `.DS_Store`). An exhausted budget stops the campaign; a new campaign
directory is not a way around it.

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

It repeats the checks after exit and writes `RESULT.json`. Live failure
records contain only codes and source frames; synthetic ones also keep
milestones.
