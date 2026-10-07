# Journal data entry candidate

`host-journal-data.cjs` and `host-journal-data.mjs` expose exactly nine original
functions: `railgunTransactJournalIntent`, `validRailgunTransactIntent`,
`validRailgunTransactResolution`, `freezeRailgunTransactResolution`,
`shieldIntentBinding`, `validShieldIntent`, `isRailgunTarget`,
`validRailgunShieldResolution`, and `freezeRailgunShieldResolution`.

These trusted-host helpers classify public calldata and validate retained journal
shapes. They neither initialize the owner domain nor authorize signing, validate
live resolution receipts, verify proofs, or release reservations. Ordinary EOA
journal classification can import them without a vault, context, profile, fence,
engine, prover, or artifact setup. The separate owner-authority bridge retains
those authority checks and its lazy admission boundary.

Both entries directly expose the canonical moved functions. There is no new
normalization or error wrapper. The freeze helpers freeze the supplied object in
place; they do not validate it first. `validShieldIntent` retains its historical
falsy return values (including `null`), rather than acquiring a new boolean or
type-guard contract. The provisional declarations therefore use `unknown` for historical truthiness
results and expose no validation type predicates. They promise only top-level
readonly values from the in-place freeze helpers; the Shield binding remains
mutable, as in the implementation.
Package exports, shipped-file declarations, and version are unchanged here.

`test/host-journal-data.test.js` covers original legacy journal and resolution
hashes, partial v2 structure/freezing, and a retained public Shield calldata
projection. Fixture source hashes and transformation details are recorded in
`test/fixtures/journal-data-provenance.json`. The separate Node consumer checks
CJS/ESM function identity and rejects imports outside the explicit pure package
closure before any bootstrap can run. It is an ordinary source consumer test,
not native execution or a complete OS-level confinement claim.
