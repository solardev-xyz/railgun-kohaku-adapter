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
The reference application's standalone dependency manifest and installation
qualification are still being completed. An existing local Electron binary is
not evidence of a repeatable dependency install.

## Detect circuit changes before a handoff

Use the wallet package's artifact manifest extracted as data from an explicitly
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
read failure closes the affected session; resume with the authenticated cursor,
within application budgets, after the original work has drained. A failed or
unobservable close remains a stop. Never create another operation just because a
client response was lost.

Some production owner errors deliberately remain coarse. The reference CLI uses
closed error codes; maintainers should reproduce a failure with public fixtures
before requesting private state. Do not publish a seed, encrypted vault, raw
proof, receipt/commitment set, private RPC payload or linked transaction timeline
in an issue. Arrange a private reporting channel with maintainers before sharing
sensitive reproduction material. No independent security audit is claimed.

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
