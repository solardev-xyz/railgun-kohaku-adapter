# Final installed owner: unsigned packaged initialization

Host `dcd242f13da2a1e9b49a1ac092ba42ef45f1be20` and package `fb3add6aa411375b42ed84735d4901bbc491c68e` (tar D) passed unsigned macOS arm64 packaging and bounded initialization from the actual built `app.asar`. A separate physical source/dependency copy kept this build isolated from the cleanup checkout and concurrent native qualification copies. No application was signed, notarized or published.

All **279** npm files are accounted for: **263** ship exactly once and **16** README/type files are omitted by the builder's permitted rules. There are no extra package files. Shipped bytes match tar D, except for the builder's removal of package.json scripts. All **153** package files loaded by initialization have hashes joined back to those shipped tar bytes. The resulting ASAR is 195,491,857 bytes, SHA-256 `cd757f6faa5823342ea2880cb272860ff0d90cb04a0b0d3fd57a4af13e5dbbfa`.

Electron 44.6.0 loaded the real fixed Freedom host, computed its source identity, initialized both owner/execution markers, returned the frozen `createAccount`/`openAccount` facade, and refused a second initialization. The probe observed no legacy owner or native-addon loads and zero network attempts. It did not call an account, vault, utility, database, worker, signing or proof operation. This is packaged initialization, **not ordinary application startup or private-operation qualification**. Node network entrypoints were refusal guards; this is not OS-level network confinement.

The original builder (PID 37862) exited naturally zero in 13,784 ms using the real afterPack hook, rebuild disabled and signing/notarization disabled. The successful original probe (PID 38593) exited naturally zero in 671 ms without timeout or cleanup intervention. Source/dependency/resource inventories—49,761 regular files and 95 links—were identical before and after. The original host remained clean at the same commit; runtime and tar pins also remained unchanged. No runtime or dependency payload, profile, home directory, credential, or built application is included in this archive.

## Preserved failure and correction

The first probe, under the tool sandbox, exited with SIGABRT after 1,654 ms (PID 37923), without a log or initialization result, timeout, or requested termination. Its POST remained unchanged. The identical script passed outside the tool sandbox with fresh disposable home/user-data state after explicit native authorization. **The first failure's cause is not established.** The failed original process observation and POST are retained here.

The first offline inventory report inherited `knownWholeRepositoryPackaging: true` from the prior tar-C checker. That metadata was stale: this host uses explicit source/package file patterns. The original report is retained as `INVENTORY-FINAL.json`; an offline-only checker successor produced `INVENTORY-FINAL-r2.json`, changing only that field to false and adding the actual patterns. All tar accounting and loaded-byte guards remained unchanged. This correction did not repeat the native probe.

## Representation and verification

RESULT, INITIALIZED, both inventory reports, both POST records and the empty probe logs are byte-exact public originals. Process wrappers are **derived, not byte-exact**: absolute command paths are replaced by named placeholders; all other observation fields are retained, and original byte counts/hashes are recorded. PROVENANCE is a path-free derived projection binding the original input/source/PRE/POST/runtime/tool metadata. Large inventories and tools containing local fixed paths are represented by exact pins instead of copied payloads. RESULT's original relative artifact names are preserved; some identify unpublished local inputs rather than archive files.

Original process history relies on the parent's retained original handles; these metadata records do not authenticate that history independently. The archive exporter checked the pinned inputs, natural-zero observations, unchanged inventories, tar accounting, first-attempt/script joins and precise checker delta without opening profiles or rerunning native work.

Run `node docs/qualification/installed-owner-packaged-final-0.6.0-2026-10-08/verify.cjs` to check this archive's pins and cross-record consistency. It is an offline metadata verifier, not a reproduction of the application build or native qualification. The previous tar-C packaged/read evidence remains unchanged in `docs/freedom-qualification/`.
