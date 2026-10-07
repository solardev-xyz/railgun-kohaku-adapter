# Adjacent owner tests: destination-only staging

Basis: Freedom `c6afd0432918d1258c1aafe11117f133cdd21ef4`, package owner candidate `f7da14e8d864a416444380cc99f2fa6c85102ff9`. No Freedom original has been removed or changed. No package export, runtime source, dependency, installed artifact or authority mock was added.

The reverse audit identified 180 test consumers of the private owner closure. This copy stages **151 owner-adjacent suites** (150 wallet, one network) and **17 directly required test fixtures** under `tools/owner-test-staging/`. It leaves 27 qualification/tooling suites, the shared `private-submission-journal` browser-host suite and the installed-package identity suite in Freedom. Some tooling suites use pure mocks; their exclusion is an ownership decision, not a claim they all launch native code.

MANIFEST.json records every original Git blob, SHA-256, byte count, destination digest and reversible literal edit. Only static require/resolve and Jest mock/unmock module identifiers targeting existing canonical package modules or copied test fixtures were translated. The context module maps to the existing private context binding; no new host/context implementation was copied. Dynamic loaders, hand-written VM resolvers, source-text assertions and unknown host paths were not rewritten speculatively. Unresolved sites retain their original bytes and are listed explicitly. The parity test reconstructs every original byte sequence from its translated copy and validates its c6 hash. None of the test assertions, mock implementations, fixtures' data or protocol semantics was edited. Scoped -text attributes preserve these source bytes across line-ending configurations.

## Observed runnable subset

These twelve unchanged-assertion suites pass with the existing cached package dependencies and without initializing an owner host: account-phase, event-projector, private-creator, recovery-finality, relay-review-summary, relay-witness, reservation-ledger, txid-coverage, wallet-coverage, wallet-read, wallet-state and wallet-storage. **292 tests pass**, plus two staging/parity tests. The first attempt exposed an omitted `jest.dontMock` identifier; adding that mechanical translation made the original witness assertion pass. No assertion was removed or altered.

Run from the package root:

```sh
npm test -- --runInBand --config tools/owner-test-staging/jest.config.cjs
npm test -- --runInBand test/owner-adjacent-staging.test.js
```

The explicit config selects only the twelve qualified staged suites. The remaining suites are source staging, outside the ordinary `test/**/*.test.js` default discovery; they are not disabled with skip/only wrappers. Each remains available in full for composition and later selection. No claim is made that all 151 suites currently run or that their Freedom copies can already be deleted.

## Remaining gaps

Before execution, 58 suites have closed direct translated imports (12 now pass; 46 remain untested), 35 additionally import the private context binding and need their genuine host initialization or existing mock composition checked, and 58 retain at least one unresolved host/adjacent-module/tool import. STATUS.json records the exact per-file classification and unresolved/computed sites. Direct closure is not proof of a transitive runtime closure.

The dominant unresolved families are privacy-storage (32 sites including the old-reader fixture), private-rpc (26), private-transaction-network (18), wallet-tor-transport/private-submission-journal (16 each), settings/tor (14 each), network-registry (10), signer/transaction-intent (7 each), and identity-manager/transaction-service (6 each). They require the genuine fixed host bootstrap or a faithful port-level adaptation of each test's existing composition. Merely restoring legacy host imports, exposing private methods, or introducing a permissive mock would defeat the extraction and is not done here. Credential tests must be adapted to the reviewed private loan boundary, not resurrect raw key exports.

Tests of the reverse-audit additions (Kohaku front doors, Shield origin/recovery, Transact recovery, etc.) also await the corresponding source relocation. Some existing assertions bind old process filename routes or source/policy inventories; they need explicit successor expectations after those runtime changes are independently reviewed. Source-derived inventories and hand-written VM resolvers require a separate closed import audit; this copy does not silently change those assertions.

The test-only fixture closure consists of canonical capsule/transaction/relay constructors, Kohaku oracle/conformance helpers, one preserved old-reader fixture and committed public JSON vectors. No installed dependency tree, runtime ASAR, prover/artifact bytes, profile, untracked account data or vault material was copied. These tools/tests/docs remain outside the existing npm files whitelist; no widening was performed. No Electron, proof runtime, service or real profile campaign was executed for this staging.

## Removal sequence

1. Review exact source/fixture parity and the twelve passing package suites.
2. Compose the remaining owner/credential/worker changes and genuine host initialization; run each pending suite without weakening assertions.
3. Retain browser-facing host, installed-package and qualification integration suites in Freedom and rebind their fixed public entry points.
4. Only after source parity and corresponding package tests pass, remove the verified moved Freedom test copies under the user's extraction authorization. Shared fixtures still required by retained Freedom callers must remain or gain a pinned dedicated-repository source reference. This commit performs destination-only staging.
