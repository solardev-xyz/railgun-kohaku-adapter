# Eight earlier relay data suites

These eight original Freedom suites were outside the adjacent-owner test migration and had no dedicated current renamed equivalent: relay capsule, intent, POI history, pre-POI data, quote data, recovery data, transaction, and wallet data. They are now active under `test/earlier-relay-*.test.js`, using the package's current internal data/execution modules. Related controller tests already present were not treated as equivalent coverage.

Every edit to the copied suites is a literal `require` specifier replacement. No assertion, test body, mock, input or refusal expectation changed. The two structural relay fixtures are reused from the existing owner-test staging; no fixture is duplicated. `EARLIER-RELAY-DATA-MIGRATIONS.json` records the immutable c6afd043 source blobs and hashes, exact replacements, candidate hashes and reused fixture pins. The separate provenance suite reverses those imports and verifies every original byte/Git blob, independently of the other agent's migration manifest.

The original eight suites pass **308 tests**. Together with ten provenance checks: **318 tests / 9 suites**, 4.486 seconds, exit zero. Strict lint passed. The copied suites retain original formatting so that the transformation stays import-only; the new provenance test was formatted with the active conventions. This is a targeted run, not a whole-package regression.

```sh
npm test -- --runInBand --runTestsByPath test/earlier-relay-capsule.test.js test/earlier-relay-intent.test.js test/earlier-relay-poi-history.test.js test/earlier-relay-pre-poi-data.test.js test/earlier-relay-quote-data.test.js test/earlier-relay-recovery-data.test.js test/earlier-relay-transaction.test.js test/earlier-relay-wallet-data.test.js test/earlier-relay-data-provenance.test.js
```

The existing default package test discovery includes these files. No runtime source, export, public API or dependency changed. Tests call real current normalizers/ABI matchers with public structural data; they do not initialize owners or execute engine/prover jobs, native applications, profiles or network services. Existing lock-matching development dependencies were physically copied for this isolated checkout, with no installation or upgrade. Freedom originals remain untouched pending separate cleanup approval.
