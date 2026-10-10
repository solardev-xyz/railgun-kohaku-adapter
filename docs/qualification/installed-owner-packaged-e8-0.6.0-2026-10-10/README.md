# E8 installed owner: unsigned packaged initialization on the integrated host

Host `f6a5d35635414bfec5853094a3a61cac2e651054` and package `7d75c1373a8afa3212cfe8ace1f784425e1057c5` (tar E8, SHA-256 `eff8dc891345535bf27b1442a4157027fc976541a596e930a9adb6b525de2633`) passed unsigned macOS arm64 packaging and bounded initialization from the actual built `app.asar`. The host is the wallet-privacy feature branch with Freedom main `50a59d69` merged in. A separate physical source/dependency copy kept this build isolated from the integration checkout. No application was signed, notarized or published.

All **281** npm files are accounted for: **265** ship exactly once and **16** README/type files are omitted by the builder's permitted rules. There are no extra package files. Shipped bytes match tar E8, except for the builder's removal of package.json scripts. All **155** package files loaded by initialization have hashes joined back to those shipped tar bytes. The resulting ASAR is 197,567,141 bytes, SHA-256 `1d4ece4c7be65c1ce8a1e5a9daad67d8a276e58250faab9be93ec1d11b9364ac`, and the probe did not change it.

Electron 44.7.0 loaded the real Freedom host. It computed the source identity `0d78ca30…`, the same host policy digest as the live journey, and initialized both owner/execution markers. It returned the frozen `createAccount`/`openAccount` facade and refused a second initialization. The probe observed no legacy owner or native-addon loads and zero network attempts. It did not call an account, vault, utility, database, worker, signing or proof operation. This is packaged initialization, **not ordinary application startup or private-operation qualification**. Node network entrypoints were refusal guards; this is not OS-level network confinement.

The original builder (PID 63721) exited naturally zero in 12,592 ms using the real afterPack hook, with rebuild, signing and notarization disabled. The original probe (PID 63811) exited naturally zero in 1,922 ms on its first attempt, without timeout or cleanup intervention. Source/dependency inventories (49,989 regular files and 95 links) were identical before and after. The original host remained clean at the same commit; runtime and tar pins also remained unchanged. No runtime or dependency payload, profile, home directory, credential or built application is included in this archive.

## Differences from the tar-D check

- **Electron 44.7.0**, from the integrated lockfile. Its dist binaries equal the members of the upstream zip, whose SHA-256 matches Electron's published checksum.
- **No platform payloads.** The Ant, freedom-ipfs, Myotis, Radicle and Arti mac-arm64 payloads are not in Git. No local copy matches the integrated pins, so none was copied, and the builder reported each source as absent. Owner initialization does not load them. The built app is therefore not distributable.
- **The preflight is wider.** It also checked the vendored tar and the lock integrity against tar E8, and the Electron dist pins.
- **The inventory checker starts from tar D's corrected r2 form.** It records `knownWholeRepositoryPackaging: false` and the actual files patterns.

## Representation and verification

RESULT, INITIALIZED, INVENTORY-FINAL, POST and the empty probe log are byte-exact public originals. Process wrappers are **derived, not byte-exact**: absolute command paths are replaced by named placeholders, all other observation fields are retained, and the original byte counts and hashes are recorded. PROVENANCE is a path-free derived projection that binds the original inputs, source, PRE/POST, runtime and tool metadata. Large inventories and tools containing local fixed paths are represented by exact pins instead of copied payloads. RESULT keeps its original relative artifact names; some identify unpublished local inputs rather than archive files.

Original process history relies on the parent's retained original handles; these metadata records do not authenticate that history independently.

Run `node verify.cjs` in this directory to check the archive's pins and cross-record consistency. It is an offline metadata verifier, not a reproduction of the build or native check. The tar-D packaged record remains unchanged in `installed-owner-packaged-final-0.6.0-2026-10-08/`.
