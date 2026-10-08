# Earlier runtime test migration

These five suites were outside the original 151-suite adjacent inventory. They now test the current package modules, with all original assertions retained. The reversible OUTSIDE-ADJACENT-MIGRATIONS.json records exact c6 source hashes and only literal import moves plus the existing fixed context-host setup for proof recovery. This does not claim that the remaining earlier test gaps are covered.

On package runtime c925fa8 (merged through d274d415), the five suites passed 166 tests; their source provenance check passed one test. Strict external ESLint and git diff --check passed. No engine, native qualification, live service, or funded profile was exercised. The tests retain their original explicit mocks.

The exact original .5 Freedom adapter-package acceptance test is separately preserved under historical-tests with its 860c origin. Its obsolete local wrapper/source-path checks are not current .6 acceptance. The retained Freedom host acceptance is being replaced separately with installed .6 tar/lock/file/export checks.

A second eight-suite group (operation dispatch, recovery, creator capture, capsule, policy, selection, spending job and wallet records) passed 272 tests. EARLIER-SECOND-MIGRATIONS.json preserves each exact original; only fixed literal imports and context-host setup changed. The spending-job suite retains its mocked engine verifier and does not execute the engine. No production file changed.
