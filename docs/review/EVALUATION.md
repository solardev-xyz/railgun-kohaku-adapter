# Local evaluation

These steps evaluate the current package boundary. They do not create a wallet,
open an existing profile, contact Railgun services or authorize a transaction.
The standalone account example is a [planned milestone](../ADOPTION-ROADMAP.md).

## Requirements

- Node.js 24 or newer and npm.
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

`npm test` discovers package tests and staged owner suites. Their dependencies
and evidence differ. The final E8 package campaign recorded thirteen baseline
environmental staging failures; its native Freedom-host runs are separate
evidence. A new clean-host result must record its own passing, failing and
skipped tests rather than silently treating that baseline as an exception.

Type checks use an explicitly supplied TypeScript installation:

```sh
TYPESCRIPT_PATH=/absolute/path/to/typescript npm run typecheck
```

The recorded compiler is 5.9.3. This command requires a physical `node_modules`
directory in the package checkout; no symlink to a separate installation. The
root README describes the portable consumers and separate upstream bridge.
Type checks do not execute account operations.

Engine/prover assembly is documented in
[runtime build tooling](../../tools/railgun-runtime-build/README.md). It requires
separately prepared pinned inputs and build tools. There is not yet a supported
one-command fresh-host setup for full account execution. Supplying arbitrary
archives or replacing hashes to make initialization pass is not that setup.

## Next evaluation target

The reference application will be installed against a packed package in a
separate application directory. Its first acceptance gate is genuine account
creation, scan and cold reopening without Freedom imports or data. The later
Alice-to-Bob gate adds independent credentials, receipt, POI and a subsequent
spend. Both need new evidence; the commands above qualify neither.
