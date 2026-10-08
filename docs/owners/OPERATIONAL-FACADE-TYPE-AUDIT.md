# Facade declaration shape audit

Audited the actual `6dc37714` owner algorithms and the `04ed6d0e` facade cleanup/gas delta, with type corrections in `7b61d091`, `6e58ca38` and this successor. No runtime algorithms, host interfaces, exports or manifest change in these correction commits. All method bodies remain the original reviewed methods; exceptions are not converted into successful return values by these declarations.

| Public methods | Actual implementation/result boundary | Declaration disposition |
| --- | --- | --- |
| initialize / createAccount / openAccount | operational-facade fixed initial capture and original opening promise | Closed host/runtime and `{accountIndex,signal}`; no owner handle returned |
| describe / advancePublic / rebuildPublic / resumePublic | facade literals; scan-coordinator diagnostic | Public descriptor, unverified checkpoint diagnostic or fixed cache-open status |
| synchronizeTxid | facade fixed three modes, original TXID drain | Exact bounded diagnostic, no receipt or witness |
| openRead / openPrivate / openPublic | original plugin adoption | Exact mode-specific options and closed lane projections |
| instanceId / balance / notes | plugin read dispatch and canonical read projection | Existing read-contract value types; original promises/errors |
| prepareTransfer / prepareUnshield / prepareShield | original preparation, then facade WeakMap wrapping | Empty runtime token, nominal type-only lane-specific handle |
| broadcast | plugin private submit / private-submission / prepared dispatch | Existing PrivateSubmissionOutcome; original cancellation and rejection behavior |
| submit | plugin submitPublic / Shield controller | PublicShieldAcknowledgement; uncertainty rejects, no fabricated refusal arm |
| openRecovery / history | genuine recovery companion / private-recovery-history | No active wallet required; exact records/nextAfter/totalSigning page |
| resumeProof | private-proof-recovery branches | `proof-stored`, `proof-present`, or bounded refusal; proof-present is an existing-slot data check, not reproving or fresh verification |
| submitStored | recovered private submission final outcome/refusalResult | EOA acknowledgement/unknown acknowledgement or string-stage recovery-required with optional source diagnostic |
| openRelayLocal / prepare | selected Shield controller or genuine Transact staging + controller | Ready-local, bounded recovery-required, or refusal/staging refusal; unknown original work rejects |
| openRelayRecovery / list | coldOperation list branch and catch | **RelayHistory only**, or rejected promise; no returned RelayRefusal branch |
| resume / discard | coldOperation respective fixed branches | Ready-local or terminal local-discard status; ordinary refusal is a value, unknown work rejects |
| all close / closed / signal | exact facade/plugin/companion ownership barriers | Session.close returns original facade closed promise; lane.close returns void; closure promises are retained, never interpreted as authority |

Review inputs were checked separately against their construction sites:

- Private preparation (`railgun-kohaku-plugin`): `submitter` is a lowercase address **string**. Its selection contains noteId/tree/position and three generation/checkpoint bindings; foreign and partial fields are optional conditional additions. Read-only destinations/exposure arrays are data. Private transaction review forwards the EOA request plus intent, operation, bigint maxGasFee, false chainStateVerified and true fundingAddressPublic; optional foreign fields originate from the saved capsule.
- Public Shield preparation: `funding` is exactly `{index:0,type:'mnemonic',address}` from fundingRecord. This remains distinct from the private address string. Shield transaction review adds bigint amount/protocolFee/noteValue, commitment and recipient.
- Recovery disclosure (`railgun-private-submission`): `submitter` is the saved signing submitter **string**; callback's second argument is the AbortSignal itself. Recovery transaction review has only its summary argument. Original signature reuse and no new spending signature flags remain data claims supplied by this controller.
- Relay exact review (`railgun-relay-review-summary`): self/peer are address/masterPublicKey/viewingPublicKey strings, canonical decimal amount/gas fields and existing exact false authority flags. Membership, staging and selected-root callback summaries match the literal builders in relay-operation / relay-transact-staging; they receive `{signal}`.
- Public TXID disclosure: exact fixed method inventory and unknown-before-open root/cursor labels match the facade literal; the callback receives `{signal}`.

CJS and ESM share preparation-brand identity. Consumer controls specifically exercise private/recovered submitter strings, both proof success branches, direct list.records access and rejection of list.status, and reject treating proof-present as proof-stored. These are declaration checks against the traced source contract, not captured native summaries or a claim that structural TypeScript values authenticate runtime authority. Native Promise identity, exact data-property admission, bounds and same-realm registries remain runtime checks.
