# Railgun runtime build tooling

This repository owns the engine/prover assembly sources and pinned build-input records previously maintained in Freedom. These are development tools, excluded from the npm runtime file whitelist and exports. They do not add an operation API or production distribution approval.

The eleven files listed in [PROVENANCE.json](PROVENANCE.json) are exact bytes and Git modes from Freedom commit `0f2616b28062d5b107a361bfa0e9fdb876f8def9`. Their nested `scripts/` and `src/main/wallet/` layout deliberately preserves existing relative imports. In particular, the builder's own SHA is embedded in its candidate archive, so editing even a comment would change the archive. The original engine and prover manifest builder hashes still match. The historical fixture README is preserved as source material: its Freedom qualification commands and relative links belong to that original commit, not to new commands in this checkout.

## Dependencies and scope

The closed local dependency graph is:

- Engine builder → `scripts/railgun-fixture-integrity.js` → engine `runtime-integrity.json`; builder copies the engine fixture package/lock/inventory and its separately installed `node_modules`.
- Prover builder → `scripts/fixtures/railgun-prover-inputs.json`; it accepts an explicit existing input workspace, resolves pinned snarkjs and its workers there, records its complete bundler inputs, and copies available license texts.
- Prover checker → both prover build source and pinned prover manifest/input inventory. It reads two separately built archives and a historical archive; it does not execute their contents.

No `scripts/lib` module or adjacent original builder test was present in that closure. New repository tests cover preserved bytes/modes, builder/manifest identity, inventory tamper/symlink rejection, CLI syntax and runtime-whitelist separation. They do not reproduce an ASAR build or qualify a new native runtime.

Tools require Node 24, `@electron/asar` **3.4.1** and (prover builder) `esbuild` **0.28.2**. These are development-only build tools, separate from the adapter runtime dependencies. Their exact versions and transitive dependencies are locked in `toolchain/`. Install that manifest into a new build directory using `npm ci --ignore-scripts`, then set `NODE_PATH` to its physical `node_modules`. The unchanged builders install nothing. The prover source workspace must contain the exact recorded pnpm layout with snarkjs **0.7.5**. Ordinary builds compare all discovered inputs with the committed inventory. `--capture-inputs` creates an explicitly unapproved candidate for review and is not a bypass for a qualified build.

The engine fixture requires its own separately approved, scripts-disabled installation matching its committed lock and full inventory. No installed dependency trees, engine/prover archives, WASM/zkeys, local profiles, secrets or runtime payloads are copied into this tooling directory. Do not treat a general application `node_modules` as that engine fixture.

## Invocation

Run from this package checkout; use fresh absolute output paths. `NODE_PATH` points to the reviewed build-tool installation, not an arbitrary resolver shim. Shell variables below must be set explicitly by the operator.

```sh
export NODE_PATH="$REVIEWED_BUILD_TOOL_NODE_MODULES"
node tools/railgun-runtime-build/scripts/build-railgun-engine.js "$NEW_ENGINE_OUTPUT"
node tools/railgun-runtime-build/scripts/build-railgun-prover.js "$PINNED_PROVER_INPUT_WORKSPACE" "$NEW_PROVER_OUTPUT"
node tools/railgun-runtime-build/scripts/check-railgun-prover-build.js "$FIRST_PROVER_ASAR" "$SECOND_PROVER_ASAR" "$HISTORICAL_PROVER_ASAR" "$NEW_CHECK_REPORT"
```

Argument ordering is unchanged. Engine builder locates the fixture under this directory, not the caller's working directory. It verifies installed inputs before copying and again afterward. Prover checker additionally requires distinct source inodes and the existing pinned historical verifier body. There is no general `--check` CLI mode: `node --check <script>` checks syntax only; invoking these CLIs without required arguments refuses before creating an output. A successful real build/check must be separately observed and recorded. The [October 10 rebuild](../../docs/qualification/reference-runtime-rebuild-2026-10-10/README.md) reproduced both pinned archives from existing authenticated inputs using these repository-owned builders; it does not establish a fresh dependency download.

Run the new source/input tests with the package's existing Jest installation:

```sh
npm test -- --runInBand test/runtime-build-tools.test.js
```

Freedom can later replace its build commands with a thin invocation of these exact repository tools (or an explicitly packaged tooling artifact). The ordinary npm runtime tarball cannot resolve them because they are intentionally excluded. Preserve the fixture installation location and exact original argv; do not copy a second builder implementation into a wrapper or silently install build dependencies. Delete Freedom originals only after destination publication and byte-parity review; no Freedom files were removed in this step.

## License and historical limits

Freedom-authored scripts and metadata retain MPL-2.0 under this repository's root LICENSE. The locked third-party engine/prover inputs retain their separate licenses; the move does not relicense or clear them for distribution. The engine dependency inventory records mixed licenses including GPL-3.0/LGPL-3.0 and historical unresolved advisories. The prover inventory includes GPL-3.0 dependencies; `@iden3/bigarray` and `@iden3/binfileutils` record license identifiers but no packaged license text. Existing builders preserve that distinction and report `productionDistributionApproved: false`.

See the immutable [engine dependency record](https://github.com/solardev-xyz/railgun-kohaku-adapter/blob/377c2a5d1aca18f0ed328dfdda955bd7d1ba271c/docs/freedom-qualification/railgun-engine-dependencies-2026-10-02.json). Historical qualification evidence remains archival; this relocation claims source parity, not current security, portability or reproducible archive output on an untested toolchain.

## Fresh dependency acquisition

The engine fixture already has a complete npm lock. Copy this tooling directory
into a **new** build workspace (exclude any existing `node_modules`), then run
`npm ci --ignore-scripts` in `scripts/fixtures/railgun-engine`, with a new npm
cache. The unchanged engine builder rechecks all 10,060 installed input files;
the October 10 fresh download reproduced its pinned archive exactly.

For the prover, the repository now carries the small authenticated build closure
instead of requiring an entire unrelated application's pnpm workspace:

```sh
python3 tools/railgun-runtime-build/acquire-prover-inputs.py /absolute/new-prover-inputs
NODE_PATH="$REVIEWED_BUILD_TOOL_NODE_MODULES" node tools/railgun-runtime-build/scripts/build-railgun-prover.js /absolute/new-prover-inputs /absolute/new-prover-output
```

The acquisition downloads 16 **existing pinned** npm tarballs as data into a
new cache, verifies recipe integrities transcribed from the historical lock (whose digest is recorded; the lock itself is not committed), rejects unsafe tar
paths, links and special files, and reconstructs only the dependency edges used
by the pinned builder. It checks all 73 consumed files against the independent
input inventory before reporting success. No install script or package entry is
executed. All archives, extracted inputs and failures are retained. This is a
build closure, not a general-purpose installation of snarkjs: unused declared
package dependencies are intentionally absent. The unchanged builder refuses
unexpected inputs and produced the exact pinned prover archive from this fresh
closure. `PROVER-PACKAGES.json` records the archive/edge recipe and its provenance.

A fresh scripts-disabled installation of the locked `toolchain/` also reproduced both archives. These successful fresh downloads do not change the
runtime pins, licenses or `productionDistributionApproved: false` decision.

## Public circuit acquisition

```sh
node tools/railgun-runtime-build/acquire-circuits.cjs /absolute/new-artifact-directory
```

This downloads the 18 supported artifact files from fixed upstream transaction
and current POI IPFS bundles over direct HTTPS. It does not use a wallet, Tor
context or credentials. Redirects and retries are disabled; each response has a
120-second timeout and size bound, and Brotli decompression is bounded by the
pinned output size. Every final file must match the existing size and SHA-256.
Verification keys retain matching published bytes, or use the pinned JSON
formatting if that reproduces the exact pinned bytes. This does not freshly
derive a key or establish which verifier a deployed service uses.

Downloads, final artifacts and `ACQUISITION.json` remain in the new directory.
A failure preserves partial files and cannot overwrite an existing directory.
The October 10 fresh run matched all 18 pins. The first trial failed on vkey
formatting and is retained separately; no artifact pin changed to make it pass.
These tools acquire public runtime data; they neither execute a proof nor open
an account. The example's Arti binary is a separate explicitly pinned platform
input, and full native platform coverage remains open.

The HTTPS gateway is untrusted transport. These tools do not verify the IPFS
CIDs locally; acceptance rests on the adapter's pinned sizes and SHA-256 hashes.
`downloads/` contains raw, potentially unverified bytes retained for diagnosis.
Install the separate locked toolchain in a new directory with an isolated npm
cache and distinct empty user/global npm config files. `--ignore-scripts` skips
esbuild's postinstall; its executable comes from the locked platform package.
