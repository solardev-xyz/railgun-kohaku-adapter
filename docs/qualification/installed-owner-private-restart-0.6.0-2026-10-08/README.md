# Installed public-owner restart evidence

This append-only archive extends the [first two native outcomes](../installed-owner-private-0.6.0-2026-10-08/README.md). That archive and its two failed-attempt summaries remain unchanged. These runs exercised the installed 0.6.0 package at `133e88cce2e1a37288e4f0bb61bb6d8c726ed6ef` with host `8285fb804c82011abd4fcc38ccc00d66b27132e3`. They do not qualify later package changes.

| Case | Observed outcome | Utilities | Key replies | Storage workers | Synthetic RPC requests |
| --- | --- | ---: | ---: | ---: | ---: |
| stored-proof-cold | A fresh main reopened the original prepared hold and returned `proof-present`, with the same hold and public transaction digest. No proof regeneration or fresh C verification is claimed. | 2 | 2 | 2 | 0 |
| signed-unfinished | The original signed reply was forwarded once, then the fixture synchronously cancelled the private lane. Original work drained; this first main alone did not authenticate the resulting durable history. | 68 | 6 | 6 | 1304 |
| signed-proof-cold | A fresh main authenticated `signed-unfinished`, reused the original signature and capsule, generated and independently verified the proof, saved it, and observed final `proof-present` history. | 7 | 4 | 3 | 49 |

The signed pair's signature and capsule SHA-256 values match exactly. Its cold process used the genuine private recovery/prover and independent verifier path without a new signer. This is graceful cancellation and fresh-process recovery, not a crash-recovery qualification. There was no broadcast or live service traffic; the positive fixture used the explicitly transformed synthetic list trust domain and public disposable source. The unchanged production-list refusal remains in the earlier archive.

Each enclosing main and root-owned driver exited naturally with code zero; every POST inventory was unchanged. Utility termination follows the fixed supervisor contract and is recorded separately from those natural main/driver exits. The main CommonJS cache snapshot is not a child module-cache, ESM runtime, or complete historical execution attestation. No profiles, credentials, signature payloads, proof payloads, engine/prover binaries, or installed dependencies are archived.

## Representation and joins

The three `*-report.json` wrappers contain derived JSON, **not byte-exact original reports**. Only the absolute SQLite path in `report.cacheAfter.native[0]` was replaced by its dependency-relative path. Each wrapper records the original report byte count and SHA-256. Other report values are preserved. Result, POST, main-process, driver-observation and main-log files are byte-exact public originals. Both reviewed launcher freezes and their report validators are byte-exact source metadata.

`bindings.json` records the checked request → source freeze → PRE → POST → RESULT → original process observation joins, first-run pins, package/runtime pins, and compact source/dependency inventory digests. Full local inventories are not duplicated. The exporter checked the exact reviewed report/cache validators and all main cache rows against their declared file inventories. It read only named public metadata; it did not reopen a profile, rehash live runtime inputs, or rerun native work. Root original-handle observations are the authority for process history; these files are not self-authenticating process evidence.

Run `node docs/qualification/installed-owner-private-restart-0.6.0-2026-10-08/verify.cjs` from this repository to check archived byte pins, closed report contracts, parent-run references and signature/capsule equality. The sibling first-run archive is required. This verifier is an offline metadata check, not a reproduction of the native campaign.
