# Separate credential host conformance

Test-only successor of 20139b9. Runtime/type basis remains package 1972191; preserve newer parent declarations. These two adjacent suites are deliberately separate from the default package runner:

```
NODE_OPTIONS=--experimental-vm-modules npm test -- --config tools/owner-test-staging/jest.host-credential.config.cjs
```

All 174 original identity/enrollment cases and one added original-root-loan settlement control pass (175/2, 12.782 s). Actual installed @scure/bip39 and the exact reviewed host credential adapter, privacy keystore, and fixed derivation algorithm execute; the fixtures pin host commit 42d914d3 (credential file last changed b4bf7e6c). Original vault/profile/session mocks remain explicit, utility jobs and cooperative fence are original controlled doubles, and storage encryption/files remain real disposable data. This does not qualify Electron, OS fences, a live/funded profile, or installed Freedom startup composition.

The old exported enrollment with*Keys calls now use the matching package-private functions on the same genuine enrollment; no public raw-key getter was added. Every original key separation, wipe, revocation, storage-floor, recovery, and ownership assertion is retained. Relay job assertions now demand the fixed enum with absent filename/binaryKey. Context profile IDs are authenticated hashes of the explicit mock profile, including original quarantine/replacement cases. Per-case profiles prevent unrelated tests from inheriting a deliberately permanent quarantine; within-case owner relationships are unchanged.

Synchronous enrollment close revokes authority but does not complete the original host callback. Cold-reopen cases explicitly await the original private closure observer; held POI store work still retains its own independent original barrier and assertions. A new case proves immediate reuse refuses before that root-loan settlement and succeeds afterward. The isolateModules case retains the actual context issuer used by initialized host bindings; this is test isolation, not duplicate-package acceptance.

Failed attempts are retained: a/b attempted native require of ESM through Jest's intercepted module seam and recursed; those adapters were removed entirely. c exposed a virtual vault mock's extension mismatch. d/e/f exposed obsolete public-method, immediate-close, context-profile, computed-import, enum, and isolated-issuer assumptions, resolved only in tests. The final invocation uses genuine ESM under the documented Node flag, without bypass loaders or derivation substitutes.

Default remains 145 adjacent suites. Two more are qualified as separate host conformance, leaving four unresolved classifications. The held-history vault/metadata suite remains a real Freedom-host acceptance obligation, not a package mock replacement. Native GC runner cause remains unknown; no broad default rerun or dependency/version/export/source change is claimed.
