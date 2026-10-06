# Notice and provenance

`@freedom/railgun-kohaku-adapter` 0.1.0 is a private, unpublished extraction from the Freedom browser repository. Every Freedom file in this package comes from Freedom commit `88b2496b58b1bccca64a35a576b48c026089544a` (branch `feat/wallet-privacy-foundation`). Copies were taken from the git object database (`git cat-file blob 88b2496b:<path>`), not from a working tree.

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
| `types/railgun-kohaku-snapshot-contract.d.ts` | `scripts/fixtures/railgun-kohaku-snapshot-contract.d.ts` | `e8d17a0c103be64ff2d9e44e6ce0324437cbd73e544da4e784a603b566492792` | `c50a1eb70fa51b7f6e306ed2cb72a64a88fd709c1de5f53deb9fee48baffc040` |
| `types/railgun-kohaku-private-contract.d.ts`  | `scripts/fixtures/railgun-kohaku-private-contract.d.ts`  | `ef7f1c9e1b2a8811eb1b5c774e41d53625419deca896e8a03ff8f24f94d4f4f9` | `72ae6311ca22351f7137cc67db22484a590a5991b5dc60095cb71a95ab895600` |
| `types/railgun-kohaku-public-contract.d.ts`   | `scripts/fixtures/railgun-kohaku-public-contract.d.ts`   | `04d6a865e641ea70cb84c489068886340bffc6a0122bbaf1a810c6ba14da4269` | `9a3475c6b0528ea7ef6fa9fafbbf7d99b451dc37e6959eab6372da9897b22ed8` |

Only the upstream import specifiers changed: one line in the snapshot and public files, and two lines in the private file. In Freedom, the declarations imported Kohaku's types from a local pinned clone of the Kohaku repository at revision `6fdc248b3d28942d9aaa35c49c1ac76dab89dc0e`. Here they import from the published package names:

| File             | Original specifier                                                                     | Package specifier                   |
| ---------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| all three        | `'../../tmp/privacy-build/pinned-inputs/kohaku/packages/plugins/src/base'`             | `'@kohaku-eth/plugins'`             |
| private contract | `'../../tmp/privacy-build/pinned-inputs/kohaku/packages/plugins/src/broadcaster/base'` | `'@kohaku-eth/plugins/broadcaster'` |

At that revision, the `@kohaku-eth/plugins` root entry re-exports `PluginInstance` from `src/base`, and its `./broadcaster` subpath maps to `broadcaster/base`. The package does not depend on `@kohaku-eth/plugins`. Adding `@kohaku-eth/plugins@0.0.1-alpha.16` as a peer is a pending decision, so **these declarations do not resolve and are not verified**. Version `0.0.1-alpha.16` has not been compared with the pinned revision, where the manifest reports `0.0.1-alpha.11`. No `skipLibCheck`, path mapping or ambient shim works around the missing peer.

### New package files

| Package file                             | Basis                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.cjs`                              | Freedom's reviewed prototype entry `docs/qualification/railgun-kohaku-public-node-prototype-2026-10-06/artifact/source/restricted-entry.cjs.txt` (SHA-256 `ed8348e6…b010f`). The `require` paths change from `./src/main/wallet/` to `./src/`, and Prettier re-wraps two long lines. |
| `index.mjs`                              | The prototype's `artifact/index.mjs.txt` (SHA-256 `057df46b…c489d`). The import target changes from `./runtime.cjs` to `./index.cjs`, and Prettier re-wraps two long lines.                                                                                                          |
| `types/index.d.ts`                       | New. It re-exports the five factory declarations and their contract types for both export conditions.                                                                                                                                                                                |
| `package.json`, `README.md`, `NOTICE.md` | New.                                                                                                                                                                                                                                                                                 |

## Relationship to the reviewed prototype

Freedom's five-factory Node prototype was built from source commit `deb3439481f9922f1bba44c164ac9467a4caac48`. Five of the six runtime sources and all three declarations are byte-identical between that commit and `88b2496b`. One file differs: `railgun-kohaku-private-adapter.js`, which hashed to `91fc9aba…51f5` in the prototype and hashes to `55dd17ad…a3f4` here. The difference is one later Freedom commit, `e9b57cff` ("allow a full-value private transfer to another Railgun account"). It moves the `0zk` address check into a `railgunAddress()` helper and documents that `prepareTransfer` passes its recipient through unchanged. The host alone decides whether that recipient is the user's own account. The validation pattern itself is unchanged.

The prototype differs from this package in three ways:

- It shipped an esbuild bundle that inlined the address subset of ethers.
- Its declarations were self-contained, assembled into `index.d.cts`/`index.d.mts`.
- It pinned Node 24.18.1 exactly.

This package instead ships unbundled sources with `ethers` as a peer, plus the original upstream-importing contract declarations. None of the prototype's build, runtime-consumer or compiler evidence is evidence for this package.

## Third-party and upstream material

- **Railgun deployment identifiers.** `src/railgun-shield-pins.json` holds identifiers for third-party contracts on Sepolia (chain ID 11155111). It records the addresses of the Railgun proxy, RelayAdapt and implementation contracts and of the wrapped-native (WETH) contract. It also records Keccak-256 hashes of their deployed runtime bytecode and the 25 bps Shield fee that Freedom pinned for that deployment. These are on-chain facts that Freedom recorded, not upstream source code. The file also holds Freedom's own integration ceiling `maxQualificationAmount` (10^16). The packaged runtime reads only `chainId` and `maxQualificationAmount`; the other fields are kept so the file stays byte-identical. No Railgun contract, engine or SDK code is included. Those contracts remain their authors' work under their own terms.
- **Kohaku plugin interfaces.** The declarations are modelled structurally on Kohaku's plugin interfaces (the `@kohaku-eth/plugins` package in the ethereum/kohaku repository, revision above). They name `PluginInstance` and `Broadcaster` by import only, and their asset union follows Kohaku's `__type` asset shape. No Kohaku source or declaration text is copied into this package. At the pinned revision, the Kohaku repository's root manifest declares MIT, and the plugins manifest has no license field. Kohaku's types remain under Kohaku's license.
- **Railgun protocol constants.** The sources use public protocol facts as validation constants: the BN254 scalar field modulus and the `0zk` address format. No upstream code is involved.
- **ethers.** `ethers` (MIT) is a peer dependency, used only for `getAddress` checksum validation. It is not bundled or redistributed. ethers 6.17.0 is a development dependency for the tests, as is Jest 30.5.2. Neither appears in the packed files.

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

Removed assertion: in Freedom, the snapshot test "constructor snapshots callbacks, enforces exact options and never grants a genuine plugin" also evaluated Freedom's `src/main/wallet/railgun-kohaku-plugin.js` in a `vm` sandbox. It asserted that Freedom's private-plugin registry rejects a snapshot plugin. That module is a Freedom wallet controller (engine, RPC, signers) and is deliberately not part of this package, so that one assertion and its `fs`/`vm` imports were removed. The test case and all its other assertions remain, and Freedom's own copy of the test keeps the registry check. The contract pin JSON describes the pinned Kohaku interface as data (file hashes and method names); it contains no upstream text. `test/package-consumer.test.js`, `test/consumer/smoke.mjs` and `jest.config.js` are new.
