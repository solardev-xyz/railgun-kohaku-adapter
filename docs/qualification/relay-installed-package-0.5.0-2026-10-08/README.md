# Installed-package relay local completion, 0.5.0

Two fresh native cases passed with Freedom `c6afd0432918d1258c1aafe11117f133cdd21ef4`, adapter source `3d52223b6c4fdd4d7ed9c78933d2ffe1a4d6ca4a`, and Electron 44.6.0 on macOS arm64. The fixture used synthetic chain responses and a separate synthetic POI-list trust domain. It exercised real signing, proof production and independent cryptographic checks through the installed 0.5.0 composition. **No live relay submission or production POI-list qualification is claimed.**

| Exact original report | Outcome | Original driver / main |
| --- | --- | --- |
| [positive-report.json](positive-report.json) | Shield input 2,000; fee 100 and self output 1,900; authenticated `ready-local` readback | 97553 / 6611, both natural exit 0 |
| [cold-report.json](cold-report.json) | Separate main reopens only the first case's disposable profile and independently rechecks its stored signature and two proofs | 11085 / 12280, both natural exit 0 |

The first case ran 79 utility jobs, nine credential replies and 1,322 synthetic RPC requests. Its four audits accepted the unmodified record and rejected signature, transaction-proof and pre-POI-proof mutations through the corresponding real primitive and production verifier. The source-bound outer validator also checked the forward custody sequence, collapsing only adjacent repeats. Report generation alone is not qualification.

The cold case ran six utility jobs, three credential replies and 49 synthetic RPC requests. The authenticated record/ledger pair was unchanged; recovery sequence remained 4 → 4. It performed no new relay signing, proof production, quote or POI requests. Lease/floor writes were permitted, so this is not a claim that every profile byte remained unchanged. Three original storage workers closed with exit 0. The utility jobs' intentional exit-15 convention is recorded in the reports; the natural-zero claims above concern enclosing mains and drivers.

## Isolation, source joins and limits

The builder physically copied application and dependency files. Only the exact `REQUIRED_LIST` literal in the isolated package's `src/data/railgun-poi-records.js` changed. All 99 original package files matched their committed Git blobs; the recorded original/copy package files were single-link and had distinct device/inode identities. This preserved the authentic installed package while providing the explicit test-list trust domain. The original and isolated source/dependency/runtime inventories were checked unchanged after each run.

Both reports carry the same 734 selected hashes: 664 Freedom files and 70 installed package files. Publication checked every selected hash against the stated commits, accounting for only the declared literal replacement. The full 99-file original package inventory was also checked against its commit. The selected map is not a trace of every executed module.

The main CommonJS cache observation joins to prepared source/dependency declarations and the fixed Electron bootstrap member. **Utility-internal module caches, full ESM/loader history and complete execution coverage were not observed.** JavaScript guard observations do not establish OS-level network confinement. `transportAttempted: false` concerns relay/live transport; the genuine RPC owner did call the synthetic lower transport. These cases do not qualify funded accounts, live services, real Tor, broadcasting, crashes/power loss, or other platforms.

## Earlier attempts remain failed

Attempt a aborted in macOS application startup: main PID 80641 exited with signal-derived code -6 before a fixture output directory was created; driver exit was 1. The retained outcome attributes the abort to the observed startup path, without establishing an application cause.

Attempt b produced a report and main PID 86176 exited 0, but driver PID 84828 exited 1. Its outer validator rejected the main cache because the platform SQLite addon was absent from the literal static-import closure. This was still a failed qualification, not a successful run relabeled later.

The reviewed successor admits only the already predeclared `better-sqlite3/prebuilds/darwin-arm64.node`, joined to the complete 17-file SQLite basis and package inventory. Wrong paths/hashes, missing pins, unrelated native addons and ordinary JavaScript outside the closure remain refused. BUILD and PREPARATION bytes were unchanged; campaign c used fresh output/evidence directories and the successor validator. Both failed attempts retained unchanged POST checks. Their exact outcome/process/error/log hashes and derived outcome records are in provenance; their logs are not copied here.

## Preservation and checking

[PROVENANCE.json](PROVENANCE.json) contains path-free derived process/result/POST records, original hashes, source/build/preparation/launcher pins, runtime/artifact pins and the scoped publication checks. Root's original process observations are separately attributed and agree with the outer RESULT records; this is not an independent OS attestation. Root specifically observed the cold outer tool session 98827 finish with exit 0.

The two reports are byte-exact originals. Publication replayed the frozen report-only validators and checked source, request, runner, process, first-outcome and cold-configuration joins. No native job, cryptography, runtime payload or profile read was repeated. [SHA256SUMS.json](SHA256SUMS.json) indexes the four other public files. The large external inventories, BUILD, launcher sources, machine paths, logs and all profile/database/credential payloads are deliberately excluded; their original hashes remain available for external evidence joins.

A fresh qualification requires the exact declared source/package/runtime and public fixture inputs, the reviewed physical-copy transformation and validators, new directories, original-handle process closure and unchanged pre/post inventories. Cold admission must bind that newly qualified first outcome and derive its profile solely from the first directory. This archive is evidence, not a standalone launcher. Existing archives and package runtime exports/version are unchanged by this addition.
