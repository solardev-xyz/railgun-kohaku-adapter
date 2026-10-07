# Notice and provenance

`@freedom/railgun-kohaku-adapter` 0.1.0 is an extraction from the Freedom browser repository (https://github.com/solardev-xyz/freedom-browser). It is not published to npm. Every Freedom file in this package comes from Freedom commit `88b2496b58b1bccca64a35a576b48c026089544a` (branch `feat/wallet-privacy-foundation`). Copies were taken from the git object database (`git cat-file blob 88b2496b:<path>`), not from a working tree.

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

No runtime source needed a change to work standalone. Relative `require`s already resolve within `src/`. `ethers` resolves from the consumer's installation as a peer dependency.

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

| Package file                             | Basis                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.cjs`                              | Freedom's reviewed prototype entry `docs/qualification/railgun-kohaku-public-node-prototype-2026-10-06/artifact/source/restricted-entry.cjs.txt` (SHA-256 `ed8348e6…b010f`). The `require` paths change from `./src/main/wallet/` to `./src/`, and Prettier re-wraps two long lines. |
| `index.mjs`                              | The prototype's `artifact/index.mjs.txt` (SHA-256 `057df46b…c489d`). The import target changes from `./runtime.cjs` to `./index.cjs`, and Prettier re-wraps two long lines.                                                                                                          |
| `types/index.d.ts`                       | New. The CommonJS-format entry declaration for the `require` condition and the top-level `types` field. It re-exports the five factory declarations and their contract types.                                                                                                        |
| `types/index.d.mts`                      | New. The ESM-format entry declaration for the `import` condition. Like the prototype's `artifact/index.d.mts.txt`, it forwards the CommonJS declaration's five factories and 27 types instead of copying them.                                                                       |
| `package.json`, `README.md`, `NOTICE.md` | New.                                                                                                                                                                                                                                                                                 |

## Relationship to the reviewed prototype

Freedom's five-factory Node prototype was built from source commit `deb3439481f9922f1bba44c164ac9467a4caac48`. Five of the six runtime sources and all three declarations are byte-identical between that commit and `88b2496b`. One file differs: `railgun-kohaku-private-adapter.js`, which hashed to `91fc9aba…51f5` in the prototype and hashes to `55dd17ad…a3f4` here. The difference is one later Freedom commit, `e9b57cff` ("allow a full-value private transfer to another Railgun account"). It moves the `0zk` address check into a `railgunAddress()` helper and documents that `prepareTransfer` passes its recipient through unchanged. The host alone decides whether that recipient is the user's own account. The validation pattern itself is unchanged.

The prototype differs from this package in three ways:

- It shipped an esbuild bundle that inlined the address subset of ethers.
- Its declarations were assembled into one self-contained `index.d.cts`, which `index.d.mts` forwarded.
- It pinned Node 24.18.1 exactly.

This package instead ships unbundled sources with `ethers` as a peer. It keeps the three contract declarations as separate files, now also self-contained, behind a CommonJS entry and a forwarding ESM entry. None of the prototype's build, runtime-consumer or compiler evidence is evidence for this package; `test/types` produces its own.

## Third-party and upstream material

- **Railgun deployment identifiers.** `src/railgun-shield-pins.json` holds identifiers for third-party contracts on Sepolia (chain ID 11155111). It records the addresses of the Railgun proxy, RelayAdapt and implementation contracts and of the wrapped-native (WETH) contract. It also records Keccak-256 hashes of their deployed runtime bytecode and the 25 bps Shield fee that Freedom pinned for that deployment. These are on-chain facts that Freedom recorded, not upstream source code. The file also holds Freedom's own integration ceiling `maxQualificationAmount` (10^16). The packaged runtime reads only `chainId` and `maxQualificationAmount`; the other fields are kept so the file stays byte-identical. No Railgun contract, engine or SDK code is included. Those contracts remain their authors' work under their own terms.
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
