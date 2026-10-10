# Owner extraction publication scope (0.6.0)

The 0.6.0 owner package extends the earlier adapter, data and execution phases. The packed NOTICE preserves their historical provenance, including the 0.4.0 opening description; it is not the current API inventory. The current API and host responsibilities are in README.md and docs/owners/INTEGRATION.md. Existing MPL and third-party provenance statements remain in force.

The repository retains source migration and review utilities under tools/. In particular, audit-owner-reuse.cjs, stage-owners.py and stage-owner-reverse.py record prerequisites from the original temporary extraction workspace. They are historical reconstruction tools, not portable consumer commands, and are excluded from the package tarball. Current consumers use the documented package exports and supply the specified host capabilities.

The current candidate artifact is E8: 281 files, source `7d75c1373a8afa3212cfe8ace1f784425e1057c5`, tar SHA-256 `eff8dc891345535bf27b1442a4157027fc976541a596e930a9adb6b525de2633`. Its scoped evidence includes the bounded [live Sepolia journey](../qualification/installed-live-sepolia-journey-0.6.0-2026-10-10/README.md), which completed with E8 after earlier steps on E4/E5b. E8's [unsigned packaged initialization](../qualification/installed-owner-packaged-e8-0.6.0-2026-10-10/README.md) is separately scoped. Documentation edits on main are not a replacement tar or a new runtime qualification.

## Historical extraction checkpoint

The earlier 279-file frozen runtime tarball was bound to source fb3add6aa411375b42ed84735d4901bbc491c68e and SHA-256 6169f7445db3306feae9a16f35d6665e9f767e59b071a41a05e5f14fef02c59c. Subsequent repository test, evidence and removal-manifest commits did not change those packed bytes. Installed native checks and their exact candidate scopes were recorded separately; synthetic evidence alone did not establish a completed live transfer/withdrawal journey. The following test record belongs to that earlier checkpoint, not E8.

The repository test configuration recycles Jest workers between suites using a 1MB idle-memory threshold (two workers maximum). This preserves discovered test cases and runtime assertions and does not cap a running test. The discovery-contract assertion now pins the new worker setting. Two reused-worker campaigns had unexplained SIGSEGVs; the affected suites passed alone. The fresh-worker approach is a test-run isolation measure, not an established root-cause fix. Exact failing and passing runs remain in COMBINED-TEST-RECORD-2026-10-08.json. This configuration is not part of the frozen runtime tarball.

The final default `npm test` at `7a6a5ec7266e69f33fcfc8d35edaf47ead358394` passed all 250 suites / 11,989 tests. The preceding run caught one stale configuration assertion; its failed result is preserved separately. None of these test-configuration changes modifies the frozen installed runtime artifact.
