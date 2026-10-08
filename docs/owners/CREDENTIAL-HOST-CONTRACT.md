# Vault custody and Railgun credential conformance

The reusable package owns the normative credential contract. The adopting wallet executes this fixed schedule inside its existing trusted vault boundary. A package owner receives only scoped 32-byte Railgun material through four purpose-specific loans; it never receives the BIP-39 seed, a generic derivation function, or caller-selected key paths. Keeping this small primitive beside the vault avoids widening the package API to cross-protocol wallet authority. JavaScript module boundaries are not an OS sandbox.

This preserves the existing Freedom schedule, including storage-domain strings, rather than migrating any identity or authenticated store. A second host must pass the conformance vectors and genuine-context/loan tests before claiming compatibility. Profile-specific storage roots are intentionally not portable simply by moving a profile directory.

## Exact schedule

Use the 64-byte BIP-39 seed from the unlocked mnemonic with an empty BIP-39 passphrase. The hardened master node is `HMAC-SHA512(key = UTF8("babyjubjub seed"), data = seed)`. Split each 64-byte node into the 32-byte key and 32-byte chain code. For each hardened child index `i`, compute `HMAC-SHA512(key = chainCode, data = 0x00 || key || BE32(i + 2^31))`. The output credential is the first 32 bytes of the final node. Wipe every superseded node, temporary child buffer and local seed; the borrower owns no seed.

For an integer account index from 0 through 65535 (excluding negative zero):

- Spending: `m/44'/1984'/0'/0'/index'`. Both spending-public and spending-sign use these same bytes; this equality grants no signing permission.
- Viewing: `m/420'/1984'/0'/0'/index'`.
- Storage root: `HMAC-SHA256(key = seed, data = UTF8("Freedom Railgun account storage v1") || 0x00 || UTF8(JSON.stringify([profileId,index,11155111,"sepolia"])))`.
- `profileId = SHA256(UTF8(JSON.stringify([profile.id,profile.userDataDir])))`, lowercase hex. Preserve exact strings and JSON order; do not normalize paths or insert whitespace into this preimage.

These domains are historical compatibility contracts, despite the Freedom name. Do not rename them during extraction.

## Admission and lifetime

The host admits an exact `{handle,vaultSession,accountIndex,purpose,signal}` request only after resolving its genuine context, current vault session and current profile. The subject must be `private-account`, principal `railgun:index`, protocol `railgun`, chain 11155111 and deployment `sepolia`.

| Purpose | Required role | Required operation |
| --- | --- | --- |
| spending-public | keystore | spending-public |
| spending-sign | keystore | spending-sign or relay-sign |
| viewing | keystore | null or viewing-identity |
| storage-root | storage | railgun-account-enrollment-v1 |

Reject foreign contexts, changed profiles/sessions, aborted signals, invalid indices/purposes, accessors and proxies before the key callback. Loan bytes must be exactly one owned 32-byte buffer. Storage-root admission also creates the genuine profile guard before the seed is wiped; a plain object is not a replacement guard.

The callback returns an original native promise resolving to `undefined`. Retain it through genuine settlement and wipe the borrowed bytes on abort and final settlement. Spending and root loans are retained through their original owner work; unknown signing-child exits keep the stable account excluded. Viewing consumers currently copy material to supervised utilities: that host loan ends after the copy, and an unknown viewing exit does not itself hold the signer latch. A detached copy does not extend vault access or authorize spending.

## Public tests

[`credential-vectors.json`](../../test/conformance/credential-vectors.json) contains only the well-known public test mnemonic, two fictitious profile identities and indices 0, 1 and 65535. The vectors were generated independently using Python's standard HMAC/PBKDF2 implementation, without importing the host helper. No real wallet, directory, network or profile is involved.

The adopting host must compare all four loan purposes to these vectors, check returned buffers are wiped, and retain its negative admission and original-promise lifetime tests. The package's repo-only harness drives an explicitly supplied test host; it is not a runtime credential export. Native identity/worker qualification remains separate from these conformance tests.
