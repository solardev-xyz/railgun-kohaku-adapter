# Completed successor status

The concrete repository-only host-conformance successor below is now implemented and passes all three original cases. See `HOST-HELD-QUALIFICATION.md` for exact invocation, reviewed8285 host pins and limits. The remaining text preserves the gap and chosen migration rationale at26deb565; references to outstanding wiring describe that prior checkpoint, not the current status. No installed public-lane/native equivalence is inferred.

# Remaining real-vault acceptance gap

`railgun-private-submission-held.test.js` is not runnable after the original Freedom owner modules are removed. Its staged source still requires the old vault relative path and its original fixtures assume local private owner imports. Merely retaining this file is not active coverage. Removal must wait for the following successor or an equivalent installed-lane acceptance. No claim of completed extraction testing is made here.

The smallest faithful successor is a repository-only package host-conformance suite, not a published internal getter. Use current package-private `railgun-private-operation`, `railgun-private-submission`, `railgun-private-capsule-store`, `railgun-private-reservations`, account phases and receipt/intent validators from the existing staged translation. Preserve all original explicit identity/account/POI/proof/preflight/service mocks; bind the actual host/context instance with the existing closed test composition. Do not inverse-transform runtime code or reinstate removed raw enrollment methods.

Bind precisely these real Freedom modules from a reviewed physical host checkout in a separate Jest config:

- `src/main/identity/vault.js`: actual `createVault(disposableIdentityDirectory, publicTestPassword)`; it resolves the already installed host passworder/derivation dependencies naturally.
- `src/main/identity/railgun-submitter-host.js`: actual zero-argument factory; its `readMetadata()` lazily calls actual `src/main/identity-manager.js#getWalletRecord(0)`. Do not replace that read with a successful metadata object.

These are test-only fixed module aliases selected by the conformance config, never runtime host arguments or package exports. Preserve the original test's Electron/profile-path mocks so identity-manager reads only its disposable `FREEDOM_IDENTITY_DATA` directory. There must be no alias to any removed Freedom Railgun owner. The rest of the host capabilities remain the original explicit controlled mocks. Use the existing actual host dependency tree; do not copy the vault dependency closure into the shipped package, add a package dependency, use a public private-owner getter or substitute fake genuine brands. Run with the already required `NODE_OPTIONS=--experimental-vm-modules` in a separate conformance invocation; this is not a default Jest runner change. This document specifies the wiring; that config/test adaptation and run are still outstanding.

Preserve the exact three original cases (c6 source lines467,487,514):

1. Real vault exists but `vault-meta.json` is absent: held proved-unsent recovery returns history/submitter-metadata `ERR_ASSERTION`; no destination RPC, journal read, disclosure review or additional proof begins; reservation and complete stored capsule remain unchanged.
2. Matching public wallet-0 metadata: same original hold passes history, reaches and declines the first disclosure review; exact protocol/transaction RPC and journal-read order remains; review binds original submitter/recipient/signature reuse; capsule remains unchanged.
3. Metadata for another address: history/submitter `ERR_ASSERTION` before disclosure; no replacement signature or rebuilt transaction.

The original test already controls proving and network behavior. Keeping those mocks does not qualify real proving, utility lifecycle, Tor or service behavior; the distinct value is actual vault/identity-manager metadata composition with current owner custody/history checks. A full installed public-lane alternative would need `session.openPrivate(...).prepareTransfer(...)` followed by exact completion consumption and `session.openRecovery(...).submitStored(holdId)` while preserving the original preflight refusal and stored-byte checks. It is larger because facade account/catalog admission must also be genuine, so it should not be substituted with forged facade receipts simply to make this test pass.
