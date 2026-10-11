# Installation, compatibility and maintenance scope

This repository is experimental source, not a published npm release or a
support commitment. Pin a repository commit and the resulting tar digest when
evaluating it. The package version alone does not identify the historical E4,
E5b and E8 candidate bytes. The qualification indexes identify those explicitly.

## What an adopter must pin

Keep a local installation record containing the adapter tar, host source,
Electron/Node and native storage versions, engine/prover archive digests, circuit
files and service/deployment choices. Keep account identifiers and operational
reports out of a public installation record. Use the package's actual npm file
whitelist, rather than copying an arbitrary source tree into an application.

The [evaluation commands](EVALUATION.md) cover locked Node dependencies, consumer
interfaces and the full Node suite. The [runtime builders](../../tools/railgun-runtime-build/README.md)
reproduce the pinned archives from separately authenticated inputs. Their
[recorded rebuild](../qualification/reference-runtime-rebuild-2026-10-10/README.md)
used cached inputs; a fresh-machine installation is a separate acceptance case.
The reference application's [fresh installation](../qualification/reference-installation-2026-10-10/README.md)
now has macOS arm64 evidence, including isolated downloads and actual cold account
reopens. Fresh engine/prover inputs, locked build tools and circuit downloads also reproduced the pinned runtime. Arti acquisition and other native platforms remain separate.
An existing local Electron binary alone is not installation evidence.

## Detect circuit changes before a handoff

Use `@railgun-community/wallet`'s `artifact-v2-hashes.json` from its npm
release tarball (`package/dist/services/artifacts/json/artifact-v2-hashes.json` in 11.2.0) extracted as data from an explicitly
identified upstream release. Authenticate its release/archive separately; never
execute an unreviewed package's install scripts merely to read the manifest.
Then run:

```sh
node tools/artifact-compatibility.cjs /absolute/path/to/artifact-v2-hashes.json /absolute/path/to/local-artifacts
```

The command checks wasm/zkey hashes for every circuit this adapter supports and,
when the second argument is supplied, the size and bytes of each local wasm,
zkey and verification key. `pinsMatch: true` and exit 0 mean those comparisons match; exit 2 reports
drift or missing artifacts; exit 1 refuses malformed input. The output contains
public hashes and closed statuses, never account material. `unpinned` lists upstream
circuits and artifact kinds outside this package's comparison scope; their
presence does not imply support. Local verification keys are compared as bytes
to their pins, not re-derived from the supplied zkeys. A bad artifact directory
is an input refusal, not reported as drift. Hashes must be lowercase hexadecimal;
uppercase is invalid format. JSON parsing uses last-key-wins for duplicate keys,
so the exact supplied file digest and its authenticated provenance matter. It makes no network
request, updates no pin and never installs or executes an artifact.

A matching supplied manifest does not establish its freshness or provenance,
nor the deployed POI node's verifier revision. Record those uncertainties rather
than treating a successful comparison as service acceptance. If hashes change,
stop preparation for that circuit and qualify an explicit update: authenticated
upstream inputs, independently derived verification key, positive and changed-
signal controls, serialized payload verification, native lifecycle and deployed
owned-output status. Do not replace a hash merely to make loading succeed.

The historical POI rotation demonstrated why this matters: a locally valid
proof can be invalid for a service that has rotated its verification key.
Submission response categories are diagnostic; only the appropriate authenticated
recovery/status path establishes the application's next action.

## Upgrade and downgrade behavior

Separate three kinds of state:

| State | Upgrade behavior |
| --- | --- |
| Derived public/wallet/TXID caches | Compatibility identities decide reuse. A mismatch refuses; an explicitly requested new generation can rebuild derived data. |
| Credential identity, enrollment and signing custody | Preserve authenticated bytes, derivation domains, floors and reservations. A cache rebuild does not reset them. |
| Retained operation/POI attempts | Preserve exact payload/body history. A timeout is not permission to resend or re-prepare the same nullifier. |

The first cache-domain split intentionally invalidates previous derived
generations once. There is no silent v1→v2 conversion. Subsequent presentation or
POI response-classification changes can preserve cache compatibility within the
reviewed exclusion boundary. Serializer changes that alter a retained body's
bytes can still make attempted custody refuse, even if caches remain compatible.
See [policy separation](../owners/POLICY-SEPARATION.md).

The POI store's V4 retry and V5 replacement records require their corresponding
reader. Earlier reader fixtures explicitly refuse the newer document. A code
rollback must not discard a reservation, remove a replacement or restore an old
floor. Keep old installation/evidence files for diagnosis; they are not authority
to revert live authenticated custody. A production migration needs its own
backward/forward tests and crash evidence.

## Availability and errors

The reference application preserves scan progress and offers explicit resume
commands. It does not retry transaction or POI delivery automatically. A public
read failure closes the affected owner. `txid-sync` may continue twice after a
classified transport failure, ten seconds apart, within the original consent,
80-call budget and deadline; every call authenticates the stored cursor anew.
Scan recovery remains an explicit command after the original work has drained. A failed or
unobservable close remains a stop. Never create another operation just because a
client response was lost.

Some production owner errors deliberately remain coarse. The reference CLI uses
closed error codes; maintainers should reproduce a failure with public fixtures
before requesting private state. Do not publish a seed, encrypted vault, raw
proof, receipt/commitment set, private RPC payload or linked transaction timeline
in a public issue. Use the repository’s [private security reporting route](../../SECURITY.md).
A private report should still avoid credentials and funded custody files. No independent security audit is claimed.

## Release gates

Before describing a candidate as independently installable, record a clean
example installation, exact packaged runtime, cold account recovery and the
separate-account journey on its final bytes. The synthetic and live results must
stay distinct. CI is required on the pushed head, and a platform is supported
only for the scenarios actually exercised there.

An npm publication, signed distribution, version tag, mainnet activation or
broader chain/relay support is a separate release decision. External reviewers
should evaluate the exact candidate and its gaps before production commitments
are made. Freedom product activation remains outside this adapter adoption work.

## Experimental versioning and platform record

Unreleased source is identified by commit and tar digest; a shared `0.6.0`
package label does not imply compatibility between development candidates.
Before a tagged/published candidate, allocate its own version and release notes
covering API changes, cache invalidation, persisted-reader minimums, artifacts
and tested platforms. During 0.x development, an incompatible public contract
requires a new minor release; compatible fixes use patch releases. There is no
long-term support or response-time commitment yet. No version tag or npm release
is created by the reference-host work.

| Target | Current evidence |
| --- | --- |
| Node 24.18.1, macOS arm64 | Full package suite and focused later additions; existing locked dependencies. |
| Electron 44.7.0, macOS arm64 | Independent native synthetic lifecycle; fresh example/runtime setup and cold account reopen; completed live private two-account lifecycle on its D/I installation identities. |
| Node 24.18.1, Ubuntu 24.04 / macOS 14 CI | Workflow configured; result must be recorded on the pushed head. |
| Electron Linux/Windows, browser, mobile | Not qualified. |

This matrix describes evidence, not broad platform support. The completed
installation and live records identify different source snapshots explicitly;
subsequent candidates need their own applicable installation/recovery checks.
A published release still needs its concrete version, notes and release decision.
