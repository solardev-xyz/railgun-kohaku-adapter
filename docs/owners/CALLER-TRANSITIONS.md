# Fixed utility caller successor

This change is based on `8905ee2fab85c2fc5b866299cdc2021198e15b63`. It converts the 17 remaining caller modules from legacy filename/key selectors to the package-private fixed `executionJob` enum. The earlier count of 18 included identity, which was already converted in this base. Identity and the process registry are unchanged here.

`CALLER-TRANSITIONS.json` records exact before/after SHA-256 values and reversible edits. The provenance test first undoes this successor, then the existing process/credential/import layers. Historical translation records are unchanged. Every edit changes only a selector or removes its old key flag; all original handle, input, broker, deadline, storage, reply and closure expressions remain byte-identical.

The wallet runner selects its already-closed `purpose` directly. The TXID runner selects `txid-` plus the original validated mode and retains the same mode in its input. No filename, key-eligibility override, public export or new activation path is added. The installed kernel and native candidates are untouched.

`test/owner-caller-routes.test.js` checks the complete converted set, inverse byte reconstruction, fixed role/key admission and rejected role/operation/kind substitutions. It checks all 20 current process-caller modules for obsolete selectors. Existing process tests exercise genuine handle identity and closed-route admission. `test/owner-caller-quote.test.js` ports the original c6 quote-owner suite, retaining its process/broker/exit/timeout tests; only module paths and the obsolete selector expectation change, with extra original handle/context assertions. Its original source SHA is retained in `CALLER-TEST-SOURCES.json`.

Validation on this isolated base: `npm test -- --runInBand` passed 56 suites / 1,863 tests. Changed JavaScript passed the existing Freedom ESLint configuration with `--max-warnings 0`. There is no package `npm run lint` script, so its existing external lint tool was invoked directly. No dependency installation, native execution, source export or runtime activation was performed. The cached test dependency directory is an untracked symlink and is not committed.

The later 19-owner closure successor changes the translation row count independently. Preserve that successor's rows while retaining this new outer inverse layer when composing the commits. Generic process-entry deletion and policy rebinding remain separate work.
