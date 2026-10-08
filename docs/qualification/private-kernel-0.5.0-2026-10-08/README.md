# Installed private utility kernel 0.5.0 qualification

Four disposable native cases passed on Freedom `c6afd0432918d1258c1aafe11117f133cdd21ef4`, adapter source `3d52223b6c4fdd4d7ed9c78933d2ffe1a4d6ca4a` (99 installed package files), and Electron 44.6.0 on macOS arm64. External chain responses, private services and list trust were synthetic. Real installed signing/proving/recovery jobs and independent proof checks ran within the existing bounded host composition. This is not live/funded, real-Tor, transport/submission or power-loss qualification.

| Exact original report | Case and outcome | Original main |
| --- | --- | --- |
| [controller-report.json](controller-report.json) | Shield partial controller; durable signing before key delivery, real proof and independent verification, existing receive-mismatch and duplicate-input refusals | PID 53865, natural exit 0 |
| [warm-report.json](warm-report.json) | Transact foreign transfer, same-process original-signature recovery under the same root | PID 54220, natural exit 0 |
| [restart-handoff.json](restart-handoff.json) | Transact foreign setup, intentional interruption after durable signature; clean drainage and profile release | PID 55097, natural exit 0 |
| [resume-report.json](resume-report.json) | Separate main, setup-owned disposable profile, advanced root, preserved original signature/capsule/ciphertext and independently verified recovered proof | PID 55340, natural exit 0 |

The reports are exact original bytes. Recovery reports retain `submissionEnabled: false`; their recovery phase produced no new signature or private-service call. Clean restart is distinct from an unexpected process crash or power failure. Utility exit conventions remain in the raw child records; the natural-zero claims above concern the four enclosing original mains, not every utility.

`kernelEvidence` records main-observed installed job targets, pinned bootstrap/guard inputs, joins to original child records, and the main package-cache subset. **`utilityModuleCacheObserved: false` and `historicalExecutionCoverage: false` remain explicit.** This does not observe utility-internal module caches, full ESM/loader history or every executed module. Installed targets and successful real cryptographic work support the bounded kernel claim without turning main observations into utility traces.

[PROVENANCE.json](PROVENANCE.json) binds original report/process/result/POST hashes and driver freeze `b95e0094ed25a4b8e93cb36078d4141797ad5badb1f32786f5e7c7f83211fedf`. Process rows come from the driver's original handles. Root separately reported its owning execution session 2381 completed with exit 0; that statement is attributed, not an independent OS attestation. All four driver POST checks recorded unchanged source/runtime inputs. [native-inputs.json](native-inputs.json) is the exact pre-run inventory: 1,507 source/package files including all 99 package files, plus 29 runtime/artifact inputs. Publication checks matched every source/package pin to its committed Git blob and replayed the frozen report-only validator for all four cases. No native run was repeated for publication.

## Earlier failure remains a failure

Campaign a at `470fd92619c49d7eb96f2a3ea24c192b400e5f05` passed controller, warm and setup but failed resume with main exit 1. Its strict handoff reader omitted the already emitted `kernelEvidence` key and refused before profile/account opening. [prior-campaign-outcome.json](prior-campaign-outcome.json) is the original retained outcome; original process and failure-log hashes are in provenance. This established a fixture-reader mismatch, not a production recovery failure. The prior root execution-session identity is unavailable here and is not invented.

The c6 fix accepted that exact field while keeping unknown-field refusal. Its Jest command requested two patterns, but only the existing observer suite ran: **39 tests / one suite**, not two. A separate [actual handoff-preamble control](handoff-control.json) checked valid evidence, missing evidence, unknown fields and the original omission mutation without opening a wallet. Campaign b used fresh directories; no failed campaign profile was silently retried or relabeled.

## Packaged-load and source checks

[PACKAGED.json](PACKAGED.json), [packaged-load.json](packaged-load.json) and [CLEAN-INVENTORY.json](CLEAN-INVENTORY.json) preserve exact path-free check records from the clean unsigned macOS arm64 build at `475bdf17fdd597ce866e458df05abdd1035b6ba0`. Production `src`, package declarations, lockfile and vendor bytes are unchanged between that build and c6; the five subsequent changes were fixture/qualification files, enumerated in provenance. This does not claim the packaged artifact was rebuilt at c6.

The packaged app contained **87 of 99 npm files**, each once, with byte comparison except the explicitly handled package-script metadata. The remaining 12 are listed as omitted. Four public vectors, 32 POI references and 21 other shared references passed the packaged-load checks. That check resolved all nine execution enums without initializing the kernel or launching utility jobs. The clean inventory contains 28,853 entries, no listed forbidden roots, and **1,355 known extra public repository paths** (docs/tests and related source paths, not an assertion that the archive contains nothing beyond production code). The full path-list and checker/build-log hashes are retained externally in provenance; no app artifact contents or profiles were read for this publication.

The full 475 source run passed **684 suites / 21,896 tests**, with six suites and 36 tests skipped. Focused qualification checks at 470 passed **338 tests / four suites**. The c6 handoff correction has the 39-test check and separate preamble control above. These are distinct runs on stated source revisions, not one combined all-green run on c6. Exact original log hashes, including lint and build, are retained.

## Preservation and reproduction

[SHA256SUMS.json](SHA256SUMS.json) indexes all other public files. Reports, handoff, pre-run inputs and safe check records are unchanged; only invocation/process provenance uses explicit `<source-root>`, `<driver-r2>`, `<driver-r3>`, `<campaign-a>` and `<campaign-b>` tokens instead of absolute machine prefixes. Original hashes remain available to join the retained local originals. Normalized invocation rows are an explanatory recipe, not byte-exact executable commands.

An independent rerun must use the stated source/package/runtime pins, the retained public source and bytecode inputs, fresh campaign directories and the reviewed driver contract. Controller takes Shield; recovery takes Transact/foreign with warm/same-root, then setup/advanced-root and resume/advanced-root. Only the new setup directory may be passed to resume. Preserve original process closure, all pre/post checks and failure output. The old driver files contain machine paths and are deliberately not published here; their exact hashes are evidence, not a portable launcher claim.

The public reports include only synthetic fixture identities and bounded metadata/hashes. No database, credential bytes, profile directory contents or runtime archive payloads are included. The original-source sensitive-string/path scan is bounded, not a universal secret-detection guarantee. Existing qualification archives, runtime exports, version and dependencies are unchanged by this documentation addition.
