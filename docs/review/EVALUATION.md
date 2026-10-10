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

This install suppresses builds but does not disable a bundled native addon.
The locked `better-sqlite3` 13.0.3 includes N-API prebuilds; on a covered platform,
native tests may run even with lifecycle scripts disabled. Other platforms need
a compatible source build. The two consumer checks above do not exercise it.

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

The clean CI runs below loaded the locked dependency's bundled N-API prebuild
on Linux x64 and macOS arm64; they did not establish a native source build.
Their npm logs reported lifecycle scripts awaiting allow-scripts policy.
A platform without a compatible prebuild requires a separately approved source
build and toolchain. The full suite includes native storage and worker tests, controlled owner fixtures,
consumer contracts and example-host tests. It does not run the real Electron
Alice-to-Bob journey, fetch proof artifacts or reach Railgun services. The
scripts-disabled consumer setup above remains useful and may also load the
bundled addon on covered platforms. Node 24.18.1 on macOS arm64 passed 302 suites (12,793 tests), including
the cache-compatibility and captured application-policy changes. The later
artifact checker and receipt command have focused tests recorded separately;
this count does not include tests added after that full run.

[Package CI](../../.github/workflows/package-checks.yml) runs this clean-checkout
path on Ubuntu 24.04 and macOS 14 with immutable action pins and read-only GitHub
permissions. [Run 38059676646](https://github.com/solardev-xyz/railgun-kohaku-adapter/actions/runs/38059676646)
passed on exact head `fb6a71d96c38b2255b607799112a9acc6337ccd0` on both platforms:
303 suites and 12,848 tests passed; one suite and four tests were explicitly
skipped. Clean `npm ci`, consumer smoke and source-list checks also passed.
This count precedes the later public-screen tool's 20 tests. The skipped cases
are three archive-backed POI verifier/chain tests and the reference chain's
real-engine fixture. The existing archive-backed cryptographic
fixtures and the reference chain's real-engine fixture are opt-in and explicitly
skipped without their external pinned inputs. CI does not download them or claim
their native coverage. To run the latter with an already authenticated engine:

```sh
RAILGUN_JOURNEY_ENGINE_MODULES=/absolute/path/to/pinned-engine/node_modules npm test -- --runInBand test/reference-chain-actors.test.js
```

An explicitly supplied invalid path fails. The separate installed native journey
also exercises this chain with the real engine. Node CI does not qualify the Electron wallet,
Tor circuits or packaged distribution on either platform.

For the three archived POI verifier/chain tests, explicitly supply an authenticated
runtime-build root with `privacy-build/railgun-engine-oct3-a/source/node_modules`
and `privacy-build/railgun-prover-oct3-f/source/serial-prover.cjs`:

```sh
RAILGUN_PINNED_INPUTS_ROOT=/absolute/path/to/runtime-build-root npm test -- --runInBand test/journey-chain-poi-verify.test.js
```

The default public fixture is committed in this repository. An optional
`RAILGUN_JOURNEY_PUBLIC_SOURCE` must name an existing absolute fixture path and
requires the runtime root too. Omitted runtime inputs skip only the three
external-input tests; invalid explicit inputs fail. Neither command downloads
or silently discovers artifacts in another developer's checkout.

Type checks use the locked TypeScript 5.9.2 development dependency by default:

```sh
npm run typecheck
npm run lint
```

Historical records use compiler 5.9.3; the reference work also records a successful 5.9.2 check explicitly. This command requires a physical `node_modules`
directory in the package checkout; no symlink to a separate installation. The
root README describes the portable consumers and separate upstream bridge.
Type checks do not execute account operations. `TYPESCRIPT_PATH` remains an
explicit compiler override; invalid supplied paths fail. Standard compiler
libraries are permitted, while portable consumers must load no other dependency
declarations.

ESLint 10 checks the maintained JavaScript/CommonJS/ESM tree. Historical docs (including their executable evidence verifiers),
archived Freedom tooling and the immutable engine fixture are excluded.
`eslint-suppressions.json` records 54 pre-existing findings in ten older test or
qualification-tool files (52 unused bindings, two unused assignments). They were
not introduced by this installation change, and are not suppressed globally.
Like the existing host convention, `no-useless-escape` is disabled. New violations fail; this baseline is technical debt, not a claim that those
files are warning-free. Runtime sources and the reference application have no
baseline suppressions. CI runs lint and typecheck as well as the Node suite.

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
