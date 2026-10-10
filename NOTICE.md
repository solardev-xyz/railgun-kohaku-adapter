# Notice and provenance

`@freedom/railgun-kohaku-adapter` 0.4.0 is an extraction from the Freedom browser repository (https://github.com/solardev-xyz/freedom-browser). It is not published to npm. The original E1 adapter files come from Freedom commit `88b2496b58b1bccca64a35a576b48c026089544a` (branch `feat/wallet-privacy-foundation`). Copies were taken from the git object database (`git cat-file blob 88b2496b:<path>`), not from a working tree.

## License

Freedom's code in this package is licensed under the Mozilla Public License 2.0. `LICENSE` is Freedom's root `LICENSE`, copied verbatim. As in Freedom, that root file is the license notice for the copied sources; they carry no per-file headers. MPL-2.0 covers Freedom's own code and declarations only. It does not relabel the third-party material described below.

## Packed files

### Byte-identical copies

| Package file                            | Freedom path at 88b2496b                            | SHA-256 (original and copy)                                        |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `src/railgun-kohaku-private-adapter.js` | `src/main/wallet/railgun-kohaku-private-adapter.js` | `55dd17ada728d1213f8f051a3141f5575b89fcf1caa5622b733d52bb5495a3f4` |
| `src/railgun-kohaku-public-adapter.js`  | `src/main/wallet/railgun-kohaku-public-adapter.js`  | `18e4bc11207307fad8df688389e6fd8fc0b9ee3feb632fadf56d9be9a2eff9af` |
| `src/railgun-kohaku-read-data.js`       | `src/main/wallet/railgun-kohaku-read-data.js`       | `21522a816a905382b206acfab0cbfd5a767aefcfbccc82c051d18b952e4d409b` |
| `src/railgun-kohaku-read-dispatch.js`   | `src/main/wallet/railgun-kohaku-read-dispatch.js`   | `ed930d0517b759f442a6c19a9d250f0203fce5fc229fd9c6a750051fa41bd705` |
| `src/railgun-kohaku-snapshot-plugin.js` | `src/main/wallet/railgun-kohaku-snapshot-plugin.js` | `24d3d695c99f8860ce0cdc222f31d0ddc52ad049dec71e7c7d961edd9adb6d0b` |
| `src/railgun-shield-pins.json`          | `src/main/wallet/railgun-shield-pins.json`          | `0f38d69a9acb5ecdaeb7197f4410a1c6068b8896e4204a179631176223e31a75` |
| `LICENSE`                               | `LICENSE`                                           | `86cf9656479f1edb82245b985f4a2cc0d503b945766ebeda4269c60b307699ae` |

No E1 adapter runtime source needed a change to work standalone. Relative `require`s already resolve within `src/`. `ethers` resolves from the consumer's installation as a peer dependency. The later `./read` subpath (below) also required no source change.

### Minimally changed copies

| Package file                                  | Freedom path at 88b2496b                                 | SHA-256 original                                                   | SHA-256 package copy                                               |
| --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `types/railgun-kohaku-snapshot-contract.d.ts` | `scripts/fixtures/railgun-kohaku-snapshot-contract.d.ts` | `e8d17a0c103be64ff2d9e44e6ce0324437cbd73e544da4e784a603b566492792` | `72230958335021c87c1513e311754a6eaa0a7df80a8bc959e93b585af11c3d81` |
| `types/railgun-kohaku-private-contract.d.ts`  | `scripts/fixtures/railgun-kohaku-private-contract.d.ts`  | `ef7f1c9e1b2a8811eb1b5c774e41d53625419deca896e8a03ff8f24f94d4f4f9` | `349a7daa4dcb22d65ad3db5cd184d9a2620c428c7cadffbcd0d0ff33af20a439` |
| `types/railgun-kohaku-public-contract.d.ts`   | `scripts/fixtures/railgun-kohaku-public-contract.d.ts`   | `04d6a865e641ea70cb84c489068886340bffc6a0122bbaf1a810c6ba14da4269` | `08769e3485a50a9bd63c936df870df16afb66318c0f40f6b8c23fff964858492` |

In Freedom, the declarations imported `PluginInstance` and `Broadcaster` from a local pinned clone of the Kohaku repository at revision `6fdc248b3d28942d9aaa35c49c1ac76dab89dc0e`:

| File             | Original specifier                                                                     |
| ---------------- | -------------------------------------------------------------------------------------- |
| all three        | `'../../tmp/privacy-build/pinned-inputs/kohaku/packages/plugins/src/base'`             |
| private contract | `'../../tmp/privacy-build/pinned-inputs/kohaku/packages/plugins/src/broadcaster/base'` |

The package copies import nothing from Kohaku. The published `@kohaku-eth/plugins@0.0.1-alpha.16` declarations cannot be loaded under NodeNext without `skipLibCheck` or a path mapping; `README.md` ("Types") gives the diagnostics. The changes are:

- The upstream `import type` lines are removed: one in the snapshot and public files, two in the private file.
- `PinnedReadTarget`, `PinnedPrivateTarget` and `PinnedPublicTarget` are removed, along with the snapshot file's comment about its alias. The package entry never exported them. `test/types/upstream/conformance.ts` checks the same specializations against the published package.
- `PrivateAdapterBroadcaster` was `Broadcaster<PrivateOperation, PrivateSubmissionOutcome>`. It is now the equivalent single-member type `{ broadcast: (operation: PrivateOperation) => Promise<PrivateSubmissionOutcome> }`, with a one-line comment. The bridge check asserts that the two types are identical.
- In the snapshot and public files, one header comment line that described the types as unchecked now points to `test/types`.

The first package copies (commit `95f904a`) had only replaced the two specifiers with `@kohaku-eth/plugins` and `@kohaku-eth/plugins/broadcaster`. Their SHA-256 hashes were `c50a1eb7…fc040`, `72ae6311…95600` and `9a3475c6…22ed8`. They never resolved.

### New package files

| Package file                              | Basis                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.cjs`                               | Freedom's reviewed prototype entry `docs/qualification/railgun-kohaku-public-node-prototype-2026-10-06/artifact/source/restricted-entry.cjs.txt` (SHA-256 `ed8348e6…b010f`). The `require` paths change from `./src/main/wallet/` to `./src/`, and Prettier re-wraps two long lines. |
| `index.mjs`                               | The prototype's `artifact/index.mjs.txt` (SHA-256 `057df46b…c489d`). The import target changes from `./runtime.cjs` to `./index.cjs`, and Prettier re-wraps two long lines.                                                                                                          |
| `types/index.d.ts`                        | New. The CommonJS-format entry declaration for the `require` condition and the top-level `types` field. It re-exports the five factory declarations and their contract types.                                                                                                        |
| `types/index.d.mts`                       | New. The ESM-format entry declaration for the `import` condition. Like the prototype's `artifact/index.d.mts.txt`, it forwards the CommonJS declaration's five factories and 27 types instead of copying them.                                                                       |
| `read.cjs`                                | New. The `./read` subpath's CommonJS entry. It requires `./src/railgun-kohaku-read-data.js` and `./src/railgun-kohaku-read-dispatch.js` and exports their four helper functions, unwrapped, in a frozen object.                                                                      |
| `read.mjs`                                | New. The `./read` subpath's ESM entry. Like `index.mjs`, it imports `./read.cjs` and re-exports the same four functions by name.                                                                                                                                                     |
| `types/railgun-kohaku-read-contract.d.ts` | New. Self-contained declarations of the four helpers and five supporting types, written from the sources and Freedom's callers.                                                                                                                                                      |
| `types/read.d.ts`, `types/read.d.mts`     | New. The `./read` entry declarations for the `require` and `import` conditions; `read.d.mts` forwards `read.d.ts`.                                                                                                                                                                   |
| `package.json`, `README.md`, `NOTICE.md`  | New.                                                                                                                                                                                                                                                                                 |

## The `./read` subpath

The subpath exposes four helpers that Freedom's own callers use directly, without changing any source under `src/`. At `88b2496b`, Freedom's viewing-only read surface `src/main/wallet/railgun-kohaku-read.js` uses the three data helpers, and its private plugin `src/main/wallet/railgun-kohaku-plugin.js` uses `dispatchRailgunKohakuRead` with fixed, main-owned ports. In this package, the snapshot plugin uses all four, and the private and public adapters use `normalizeRailgunKohakuReadFilter`. `read.cjs` and `read.mjs` export those same function objects, not wrappers or copies, and the root entry still exports only the five factories.

- `normalizeRailgunKohakuReadFilter`, `projectRailgunKohakuBalance` and `projectRailgunKohakuNotes` are projection and normalization helpers. They do not authenticate the ownership or currentness of what they are given.
- `dispatchRailgunKohakuRead` is a trusted-host sequencing helper, not a pure function. It calls the caller's capture, view method, retain, recheck and refused callbacks and sequences asynchronous work between them. It has no intrinsic account authority; the caller-supplied callbacks carry their own authority and side effects. Its stale-read, exception, retention and rejection behavior is unchanged from Freedom.

`README.md` ("Read helpers") describes their behavior in detail.

## Relationship to the reviewed prototype

Freedom's five-factory Node prototype was built from source commit `deb3439481f9922f1bba44c164ac9467a4caac48`. Five of the six runtime sources and all three declarations are byte-identical between that commit and `88b2496b`. One file differs: `railgun-kohaku-private-adapter.js`, which hashed to `91fc9aba…51f5` in the prototype and hashes to `55dd17ad…a3f4` here. The difference is one later Freedom commit, `e9b57cff` ("allow a full-value private transfer to another Railgun account"). It moves the `0zk` address check into a `railgunAddress()` helper and documents that `prepareTransfer` passes its recipient through unchanged. The host alone decides whether that recipient is the user's own account. The validation pattern itself is unchanged.

The prototype differs from this package in three ways:

- It shipped an esbuild bundle that inlined the address subset of ethers.
- Its declarations were assembled into one self-contained `index.d.cts`, which `index.d.mts` forwarded.
- It pinned Node 24.18.1 exactly.

This package instead ships unbundled sources with `ethers` as a peer. It keeps the three contract declarations as separate files, now also self-contained, behind a CommonJS entry and a forwarding ESM entry. None of the prototype's build, runtime-consumer or compiler evidence is evidence for this package; `test/types` produces its own.

## Third-party and upstream material

- **Railgun deployment identifiers.** `src/railgun-shield-pins.json` holds identifiers for third-party contracts on Sepolia (chain ID 11155111). It records the addresses of the Railgun proxy, RelayAdapt and implementation contracts and of the wrapped-native (WETH) contract. It also records Keccak-256 hashes of their deployed runtime bytecode and the 25 bps Shield fee that Freedom pinned for that deployment. These are on-chain facts that Freedom recorded, not upstream source code. The file also holds Freedom's own integration ceiling `maxQualificationAmount` (10^16). The packaged account owners also read the deployment addresses, code pins and fee fields for their preflight and recovery checks. The historical qualification ceiling remains an integration/persisted-format bound, not a Railgun protocol limit. No Railgun contract, engine or SDK code is included. Those contracts remain their authors' work under their own terms.
- **Kohaku plugin interfaces.** The declarations are modelled structurally on Kohaku's plugin interfaces (the `@kohaku-eth/plugins` package in the ethereum/kohaku repository, revision above). They do not import them. Their asset union follows Kohaku's `__type` asset shape, and `PrivateAdapterBroadcaster` restates the single member of Kohaku's `Broadcaster` type, specialized to this package's types. No other Kohaku source or declaration text is copied into this package. At the pinned revision, the Kohaku repository's root manifest declares MIT, and the plugins manifest has no license field. Kohaku's types remain under Kohaku's license.
- **`@kohaku-eth/plugins` 0.0.1-alpha.16.** An exact development dependency, used only by the upstream bridge type check. It is not a runtime or peer dependency, and none of its files are packed. Before installation, the registry tarball was checked against `dist.integrity` `sha512-7QrlLeds2pX2mB/5d1BKnpFSPQI4fUyY0i2DPUlvnPxGyqnrR0HfDzfFVsZd07DpmEze8Q2KmaBQVks1Ltmwrg==` (47 files, SHA-1 `e745df5f…1f078`); the lockfile records the same integrity. `npm audit signatures` verified its registry signature and its SLSA provenance attestation. Its manifest declares no license and the tarball contains no license file, so no license is inferred for the published package. Its transitive packages (`@kohaku-eth/provider` 0.1.0-alpha.11, `ox` 0.12.4, `abitype`, `eventemitter3`, `@scure/*`, `@noble/*`, `@anon-rpc/browser-harness`, `@kpstreams/*`; 21 in all) each declare MIT. None of the 22 has an install script.
- **Railgun protocol constants.** The sources use public protocol facts as validation constants: the BN254 scalar field modulus and the `0zk` address format. No upstream code is involved.
- **ethers.** `ethers` (MIT) is a peer dependency, used only for `getAddress` checksum validation. It is not bundled or redistributed. ethers 6.17.0 is a development dependency for the tests, as is Jest 30.5.2. Neither appears in the packed files. TypeScript is not a dependency; `npm run typecheck` uses a compiler named by `TYPESCRIPT_PATH`.

## Test files (not packed)

These files are in the repository but are excluded by the `files` whitelist.

| Repository file                                        | Freedom path at 88b2496b                                  | SHA-256 original                                                   | SHA-256 copy                                                       | Change                                                    |
| ------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------- |
| `test/railgun-kohaku-private-adapter.test.js`          | `src/main/wallet/railgun-kohaku-private-adapter.test.js`  | `b8ee978ab88b839df9b91368565877737b9a0b5efc9a413db11b5115a08146f2` | `73f66a6fb37c032e1fad754c3ae6fb04c7dcddb11597c9022affba6da1e5afc6` | require paths                                             |
| `test/railgun-kohaku-public-adapter.test.js`           | `src/main/wallet/railgun-kohaku-public-adapter.test.js`   | `c47486ba00771c52ab24e605b5562aedd26deb54c9e7eda7b8a5d5e710345852` | `60a1f8881f57788321f1b77b5039a4c0bf6aae1363a7286fb720ea8e19194195` | require paths, one re-wrap                                |
| `test/railgun-kohaku-read-data.test.js`                | `src/main/wallet/railgun-kohaku-read-data.test.js`        | `66b780ca2c7c58a80eb704993fe58e615722bc340b1e683c603a6ca8676fe325` | `4c6dcc7739c5a3b60daa4b51d740ab1e942a3621cd5415b3709ccb550dedd68d` | require path                                              |
| `test/railgun-kohaku-read-dispatch.test.js`            | `src/main/wallet/railgun-kohaku-read-dispatch.test.js`    | `19b225200fbc745998130927dab1ce0812f11434bbaf4554d2fcd6d17c9829e7` | `79f6314580ccb9fd2f16c6d8d367ea828518b9d884d94b4a173059380fb62695` | require path                                              |
| `test/railgun-kohaku-snapshot-plugin.test.js`          | `src/main/wallet/railgun-kohaku-snapshot-plugin.test.js`  | `230397d28859a4cd96117db402b158b38d275f624e48b913d6430db9c6b26904` | `6221a7b7c401f2ad39dbfb73b9b5db77a86843154c0e4d4e52d04a63b3b37f31` | require paths, one re-wrap, one removed assertion (below) |
| `test/fixtures/railgun-kohaku-private-conformance.js`  | `scripts/fixtures/railgun-kohaku-private-conformance.js`  | `98a65575c5f23c277b8953fa95c05c990dec536fc14989860ba27d976fe80ad8` | `709ae00ab7d2f4d6b92da27c3d9f0a9f50909e8d88b0a4b3b1d7538afa5a772e` | pins require path                                         |
| `test/fixtures/railgun-kohaku-public-conformance.js`   | `scripts/fixtures/railgun-kohaku-public-conformance.js`   | `22e2040e332185da0b1035ab0dc7ffe58db3533d36e96faa2852f8c55113a8de` | `6fd33ce02a7b473bae73e31bb3b7b9e91c797882177d1aec3e3cf0460ea47c08` | pins require path                                         |
| `test/fixtures/railgun-kohaku-snapshot-conformance.js` | `scripts/fixtures/railgun-kohaku-snapshot-conformance.js` | `60ee448d53690e631ed5f3493e91011c7fc06e2e4bf65240292df3cea3d7ebf2` | identical                                                          | none                                                      |
| `test/fixtures/railgun-kohaku-contract-oracle.js`      | `scripts/fixtures/railgun-kohaku-contract-oracle.js`      | `4e04b7ea25d858b47ce0466069c5cd0a7030805f2a4100c3108a936f87bb8c91` | identical                                                          | none                                                      |
| `test/fixtures/railgun-kohaku-contract-oracle.test.js` | `scripts/fixtures/railgun-kohaku-contract-oracle.test.js` | `08eebafe330f480f65ad2c71b479ff9ed2fe17a47ef90be92d43db5476e20c1a` | identical                                                          | none                                                      |
| `test/fixtures/railgun-kohaku-contract-pin.json`       | `scripts/fixtures/railgun-kohaku-contract-pin.json`       | `b9fa6285978d5b342e74e0ed7af65d0458de96083957aa09191ffc91f3c99aac` | identical                                                          | none                                                      |

Removed assertion: in Freedom, the snapshot test "constructor snapshots callbacks, enforces exact options and never grants a genuine plugin" also evaluated Freedom's `src/main/wallet/railgun-kohaku-plugin.js` in a `vm` sandbox. It asserted that Freedom's private-plugin registry rejects a snapshot plugin. That module is a Freedom wallet controller (engine, RPC, signers) and is deliberately not part of this package, so that one assertion and its `fs`/`vm` imports were removed. The test case and all its other assertions remain, and Freedom's own copy of the test keeps the registry check. The contract pin JSON describes the pinned Kohaku interface as data (file hashes and method names); it contains no upstream text. `test/package-consumer.test.js`, `test/consumer/smoke.mjs` and `jest.config.js` are new, as is everything under `test/types/`: the type-check runner, the consumer, negative and upstream bridge programs, and `typecheck-record.json`, which records the compiler version and SHA-256 with its path relative to `TYPESCRIPT_PATH`.

## E2a historical capsule data (0.2.0)

The four `src/data/railgun-private-*` modules derive from committed Freedom source
`c208245fa6edeb8eb79452cf399daca264622f4c`, read from git objects. They carry the
same MPL-2.0 license. `test/fixtures/private-data-provenance.json` records original
and copied SHA-256 values and extraction edits. The intent module is byte-identical;
policy changes only its pins import. The offer module retains the exact structural
normalizer and helpers from preparation, excluding owned-note and destination
checks. The capsule module retains historical normalization and digest functions,
changing only the offer import and excluding new-operation engine binding.
The existing pinned deployment JSON is byte-identical at both source commits.

`src/data/index.js`, the data and host-data entrypoints, declarations, consumers
and boundary tests are new. The public reader adds bounded plain-data admission
and fixed errors; the host subpath shares the extracted core without wrapping its
legacy contracts. Static public-dummy capsule vectors record source commit,
canonical bytes and original digests. No funded profile, private note, credential,
engine artifact or authenticated recovery store is included.

This extraction adds no dependency. ethers 6.17.0 is both the lowest declared peer
version and Freedom's version at the extraction commit; golden tests therefore
cover both with the same installed version. No broader peer-version matrix is
claimed. E2a does not extract execution, keys, storage, POI or transport.


## Recovery and guarded result data (0.3.0)

Five more modules are copied from immutable Freedom commit
`668e97ed19d37ce10f596cf19b1cdbd492a6226b`: private destination, signature,
preparation, results and recovery-data. Every algorithm, assertion, error and
false authority flag is retained. The only source edits are relative JSON imports
and preparation's offer import into the existing shared data implementation.
The five adjacent tests retain all assertions with import substitutions only.
`test/fixtures/railgun-partial-capsule-data.js` is the sole added executable
fixture: public structural dummy data, not valid proofs or recovered ownership.
`src/railgun-engine-manifest.json` and `src/railgun-prover-manifest.json` are
byte-identical report-comparison metadata, not engine or prover payloads.

`test/fixtures/private-recovery-provenance.json` pins all 13 original and copied
files and records every literal import substitution. The tests reverse those
substitutions and verify the original hash without importing Freedom or requiring
its repository. The existing deployment JSON is byte-identical at this new source
commit. Existing capsule/intent/offer/policy implementations and safe `/data`
remain unchanged. New host entry exports, declarations, type cases and identity
checks are package integration. No third-party implementation or dependency was
added; MPL-2.0 remains the source license. The package is still private/unpublished.


## POI and TXID data (0.4.0)

The twelve modules named in `test/fixtures/poi-data-provenance.json` are copied
from Freedom `668e97ed19d37ce10f596cf19b1cdbd492a6226b`, changing only deployment
JSON import paths where necessary. The payload binder is the exact function body
from `railgun-own-poi-proof-data.js`, with its two pure imports and an export;
the rest of that host proof-input module is not copied. Original whole-source,
function-slice and package-copy SHA-256 values are recorded. MPL-2.0 applies.

Twelve adjacent test files are moved with import substitutions. The provenance
record separately lists the three retained Freedom selector-launch integration
cases and their replacement package-only domain goldens. The no-host-import test
uses virtual forbidden modules at the new relative paths. The removed launch mocks and their no-launch assertions are recorded as host
seams; all other pure predicate checks are retained. Two captured public dummy capsules are derived from the original
`railgun-own-txid-data` fixture with the immutable generation inputs pinned in the
same record. Its broader fixture modules are not shipped or imported by tests.
The signed-event JSON is byte-identical public fixture data. Existing partial
capsule fixtures and existing core implementations are reused without edits.

Host entrypoints, declarations, type cases and package provenance/identity tests
are new integration files. No additional third-party implementation, dependency,
engine/prover artifact, live credential, profile, storage owner or transport is
included. The fixed list and all digest domains retain their original values.

Execution kernel candidate: the fixed private utility closure originates from
Freedom a146331f63276ea5cbb90ef723195b65bc29e458, under the same MPL-2.0 license.
Exact source hashes and destination mapping are in
`docs/execution/PROVENANCE.json`. Host imports are relocated, the utility
bootstrap admits a fixed enum, and artifact contents gain independent package
checks. Existing shared data cores are reused; historical native evidence does
not qualify these new execution paths.
