# Capsule data 0.2.0: synthetic native and packaged acceptance

On 2026-10-07, the recorded launcher completed two Electron cases with natural exit code 0 using Freedom source `668e97ed19d37ce10f596cf19b1cdbd492a6226b` and adapter package source `22d9265e8d7acf6b9234eb544c6df341b6501fc9`. This archive preserves the exact public reports and a clearly labeled, path-free metadata projection. It is intended for the adapter repository's qualification documentation.

| Exact report | Recorded coverage |
| --- | --- |
| [transfer-unshield-report.json](transfer-unshield-report.json) | Transfer and full-unshield signing/proving; four encrypted-capsule recovery cases, covering stored-signature reuse and deterministic re-signing. |
| [partial-report.json](partial-report.json) | Partial-unshield signing/proving and one stored-signature recovery case. |
| [PACKAGED.json](PACKAGED.json) | Unsigned macOS arm64 build, shipped-file inventory and packaged runtime acceptance. |
| [packaged-load.json](packaged-load.json) | Four synthetic golden vectors and five shared host-function identities loaded from the packaged application. |

The native runs use real signing, proof generation and independent proof verification with **synthetic notes, scan and ownership**. They report zero accounts opened, network requests, POI requests and submissions. Transfer/full-unshield report `productionWitnessUsed: false`; partial reports `true`. The two parent processes exited naturally with code 0. Nested utility records also contain intentional close code 15 and negative-control failure code 1; they are not all successful code-0 processes.

This does not qualify live or Tor operation, funded accounts, deployed-verifier equality, production ownership/reservations, change ingestion, change-spend eligibility or a two-spend lifecycle. Capsule recovery here is a fixture reconstruction flow, not a funded wallet restart or rollback-resistance guarantee. Native proving ran separately from packaged acceptance. The packaged build is unsigned, unnotarized and unpublished; no packaged end-to-end wallet/proof run is claimed.

[PROVENANCE.json](PROVENANCE.json) joins the original report hashes, process rows, source/package revisions and recorded inputs. The saved BEFORE and RESULT input maps agree on 66 files: four runtime binaries/archives, 25 artifact-directory files, 35 installed adapter files and two lockfiles. Inspection of the pinned launcher shows fixed-input hash comparisons after each case and validation of each report's 44 selected source hashes. No separate POST inventory was saved. This is not a complete source-tree pre/post inventory, does not detect newly added input files, and does not pin every selected application source individually before execution. The archive author did not rerun native work, rehash runtime targets or independently observe the original processes.

A parent-reported developer inventory assertion initially expected all 35 npm files in the packaged application and failed on missing `README.md`. Inspection found 26 shipped files and nine deliberate packaging omissions: README and eight `.d.ts` files. The exact lists are in PACKAGED.json. No standalone failure log is retained, no artifact mutation was reported, and this was not a failed native qualification attempt.

The two native reports, PACKAGED.json and packaged-load.json were copied byte-for-byte after checking for absolute local paths and raw credential/witness payload fields. Original launcher metadata, argv records and build logs contain local paths and are omitted; their hashes are retained in the derived provenance. No omitted original was rewritten or represented as an exact archived report. [SHA256SUMS.json](SHA256SUMS.json) binds every other file in this folder. No engine, proof artifacts, packaged application or third-party source bundle is included.
