# Bounded default test runner

The qualified context checkpoint remains `8c55506cef7ecc69f7ac01b2acbbd4386d5ebe1c`. This separate successor sets Jest `maxWorkers: 2` and `workerIdleMemoryLimit: '256MB'`. It preserves all 154 suites, original lifecycle/drain assertions, and the exact 93 adjacent-suite list. No force-exit setting is used.

One plain `npm test` run passes 6,779 tests in 154 suites (136.018 seconds, natural exit 0), without worker-crash/retry or forced-exit warnings. This is an observed bounded-runner result, not proof that an underlying runtime defect is fixed.

Earlier combined in-band runs exited 139 without reports. A later plain two-worker run without the memory setting passed 153 suites but its worker 46360 crashed during the 27-test pure relay-proof-results suite. The exact macOS report places the fault in V8 garbage collection (`ClearStaleLeftTrimmedPointerVisitor::VisitRootPointers`, then root iteration/mark-compact). The image list contains Node and the Jest native resolver, without SQLite at crash time; prior loading cannot be inferred from that list. The unchanged suite passes alone in both Freedom c6 and the package under the same Node 24.18.1/Jest 30.5.2. Worker reuse, native environment cleanup and memory pressure remain hypotheses, not established causes.

`RUNNER-CHECKS.json` pins the public test logs, direct native-frame evidence, source comparison and successful invocation. Raw operating-system reports containing unrelated machine metadata are not copied into the repository. There are no production edits, dependency upgrades, or engine/prover/Electron acceptance claims.
