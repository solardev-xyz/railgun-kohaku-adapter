# Local evaluation

These steps evaluate the current package boundary. They do not create a wallet,
open an existing profile, contact Railgun services or authorize a transaction.
The standalone account example has its own [implementation and evidence](../../examples/reference-wallet/README.md).

## Requirements

- Node.js 24 or newer and npm.
- Python 3 for source inventory checks. If no matching better-sqlite3 prebuilt
  addon exists: a C/C++ build toolchain and Python for node-gyp (Xcode Command
  Line Tools on macOS; the equivalent compiler/make toolchain on Linux).
- A checkout of this repository at an explicit commit.
- For the portable consumer check below, the locked JavaScript dependencies.
  Native storage is not exercised by that check.

From a fresh checkout:

```sh
npm ci --ignore-scripts
npm test -- --runInBand test/package-consumer.test.js
node test/consumer/smoke.mjs
```

Installation downloads dependencies but suppresses their lifecycle scripts. The
two checks use public fixture hosts and no account keys or service requests.
They exercise real Node CJS/ESM package resolution, shared operation identities,
and the restricted adapter contract. A successful fixture submission is not a
chain transaction or a genuine owner-host test.

The install deliberately does not build `better-sqlite3`. Native account/storage
tests require a compatible real addon and further host fixtures. Do not interpret
missing-native-module failures after this install as a supported native setup.

## Check the packaged evidence record

```sh
node docs/qualification/installed-owner-packaged-e8-0.6.0-2026-10-10/verify.cjs
```

This checks the committed archive's metadata consistency. Its result explicitly
says `metadataOnly: true` and `nativeExecuted: false`: it does not rerun the
packaged application, load a vault or reproduce the live journey.

## Deeper checks

For the full Node suite, allow installation of the repository's existing locked
native dependency. Use a clean checkout and preserve any existing installed tree
before switching installation modes:

```sh
npm ci
npm test -- --runInBand
node test/consumer/smoke.mjs
python3 tools/generate-owner-source-list.py --check
```

`npm ci` runs the locked native dependency's installation/build step. The full
suite includes native storage and worker tests, controlled owner fixtures,
consumer contracts and example-host tests. It does not run the real Electron
Alice-to-Bob journey, fetch proof artifacts or reach Railgun services. The
scripts-disabled consumer setup above remains useful but cannot run these native
checks. Node 24.18.1 on macOS arm64 passed 302 suites (12,793 tests), including
the cache-compatibility and captured application-policy changes. The later
artifact checker and receipt command have focused tests recorded separately;
this count does not include tests added after that full run.

[Package CI](../../.github/workflows/package-checks.yml) runs this clean-checkout
path on Ubuntu 24.04 and macOS 14 with immutable action pins and read-only GitHub
permissions. Adding the workflow does not establish either runner's result: CI
must pass on the pushed candidate. The existing archive-backed cryptographic
fixtures and the reference chain's real-engine fixture are opt-in and explicitly
skipped without their external pinned inputs. CI does not download them or claim
their native coverage. To run the latter with an already authenticated engine:

```sh
RAILGUN_JOURNEY_ENGINE_MODULES=/absolute/path/to/pinned-engine/node_modules npm test -- --runInBand test/reference-chain-actors.test.js
```

An explicitly supplied invalid path fails. The separate installed native journey
also exercises this chain with the real engine. Node CI does not qualify the Electron wallet,
Tor circuits or packaged distribution on either platform.

Type checks use an explicitly supplied TypeScript installation:

```sh
TYPESCRIPT_PATH=/absolute/path/to/typescript npm run typecheck
```

Historical records use compiler 5.9.3; the reference work also records a successful 5.9.2 check explicitly. This command requires a physical `node_modules`
directory in the package checkout; no symlink to a separate installation. The
root README describes the portable consumers and separate upstream bridge.
Type checks do not execute account operations.

Engine/prover assembly is documented in
[runtime build tooling](../../tools/railgun-runtime-build/README.md). It requires
separately prepared pinned inputs and build tools. There is not yet a supported
one-command fresh-host setup for full account execution. Supplying arbitrary
archives or replacing hashes to make initialization pass is not that setup.

## Independent application evidence

The [reference application](../../examples/reference-wallet/README.md) has run
against a real packed/extracted adapter, separate from the source checkout.
Its [synthetic record](../qualification/reference-alice-bob-synthetic-2026-10-10/README.md)
includes independent credentials, encrypted stores, fresh-process recovery,
Alice-to-Bob receipt and Bob's cold unshield. The fixture verifies actual POI
SNARKs, but chain execution and routing remain synthetic. The native command
runner is opt-in and requires separately pinned runtime inputs; `npm test` does
not run it. Fresh standalone installation and live two-account execution remain
separate gates.
