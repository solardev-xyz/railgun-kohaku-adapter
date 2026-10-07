# Fixed private execution kernel: integration boundary

This package-only candidate extracts the fixed private utility closure from
Freedom `a146331f63276ea5cbb90ef723195b65bc29e458`. It layers on the exact .3/.4
shared data cores and preserves published package `b77c7c1` documentation and
qualification archives. No Freedom runtime route has been activated by this
change. Controlled tests do not qualify the new layout under Electron or prove
cryptographic equivalence of a native run.

## Bootstrap and fixed ports

The future Freedom utility entry is deliberately minimal:

```js
const {
  installRailgunExecutionBootstrap,
} = require('@freedom/railgun-kohaku-adapter/host/bootstrap');
const bootstrap = installRailgunExecutionBootstrap();
// Only after the actual Electron/Node guards have been installed:
const { getPrivacyContext, createPrivacyScope } = require('../networks/privacy-context');
const { createPrivacyArtifactLoader } = require('./privacy-artifacts');
bootstrap.initialize({
  context: { getPrivacyContext, createPrivacyScope },
  artifacts: { createPrivacyArtifactLoader },
});
```

`installRailgunExecutionBootstrap()` has no parameters and refuses outside an
Electron utility with its actual parent port. It owns environment cleanup and
obtains `require('electron').net` itself. Before guard installation it loads only
the guard module and Electron. `initialize` is one-shot. Host initialization
attempts are also refused across duplicate package copies in the same realm by
a non-resettable process-global marker. A failed/preempted initialization is
fatal to that bootstrap. There is no binding, context, lease or reset getter in
an export path.

The captured context functions retain the host's genuine WeakMap checks and
scope lifetime. They are not operation-supplied callbacks. The artifact function
is an I/O port: the kernel supplies its own frozen six-variant manifest, takes
an owned snapshot of every returned Buffer, wipes the I/O Buffer, and verifies
size and SHA256 before creating its existing private issued-artifact brand.
The genuine host loader remains responsible for fixed-name/O_NOFOLLOW/open/read
checks, its two-load cap, original promise settlement and descriptor drainage.
The extraction adds no timeout race or cancellation substitute around that load.

Archive verification has no host filesystem port. Engine/prover loaders keep
the original internal `original-fs`/`fs` selection, O_NOFOLLOW open, before/after
inode and stat checks, full container SHA256, and refusal of `.unpacked` trees.
The same pinned engine and prover archive manifests are retained. Loading those
archives still requires the qualified Electron ASAR environment; no ordinary
Node ASAR execution claim is made.

## Main supervisor patch, still deferred

The new utility init wire is exactly `{type:'init', job, input}`. `job` is one
of the nine fixed purpose strings below. The utility uses a static switch with
literal relative requires, independently of main. Absolute paths, old filename
messages, relay purposes and unknown strings are refused. There is no generic
`runJob`, verifier, signer, raw-key lease or artifact replacement export.

| job              | Internal job        | Existing main admission to preserve               |
| ---------------- | ------------------- | ------------------------------------------------- |
| spending-public  | identity-job        | keystore, public spending derivation              |
| viewing-identity | identity-job        | keystore, public viewing identity                 |
| spending-sign    | spend-sign-job      | keystore, genuine one-use private signer          |
| wallet-viewing   | wallet-job          | engine, wallet viewing                            |
| private-prepare  | private-prepare-job | engine, selected private preparation              |
| private-operate  | private-operate-job | engine, original private operation                |
| private-recover  | private-recover-job | private-account/engine, original capsule recovery |
| private-receive  | private-receive-job | engine, selected output recovery                  |
| private-verify   | private-verify-job  | existing keyless proof verification               |

All binary-key paths retain pinned Sepolia protocol/deployment/chain and the
exact existing main subject constraints. Main must derive binary-key eligibility
from this fixed enum and its original genuine owner checks, never from an
arbitrary caller boolean. `getRailgunExecutionJob(job)` is an inert inventory
locator, not process or key admission. The two identity enums also require input.purpose to equal the enum before job import. Only private-verify is keyless and receives a rejecting requestKey function; private-prepare and private-operate still restore a viewing wallet using the original one-key wire.

The old unmoved relay/POI routes remain
separate and keep their current exact-filename admission.

The future main patch must preserve original supervisor ready/closed tasks,
startup/lifetime/RSS limits, one binary key reply at id 1, original loan/broker
promise drainage, escalation accounting, and unknown-exit quarantine. Utility
ports and their current limits are copied without a new authority route. Main's
36-module owner SCC, account fence, durable journals/capsules, identity brands,
review receipts, signing permits and original-work exclusions remain in Freedom.
They must move together later, not be represented by `verified: true` or generic
host callbacks. The fixed wallet source remains `freedomfixture`.

## Closure, workers and packaging

`docs/execution/PROVENANCE.json` records the complete 40-source closure:
30 copied execution files, eight existing shared data modules, the existing
shield pins, and the process entry split into `host-bootstrap.cjs`. The new
host bindings and fixed locator are additional package modules. Relay data
normalizers remain in the closure because existing wallet purpose branches use
them; their jobs are not admitted by the new bootstrap.

Dynamic loads are restricted by existing code to the verified engine archive's
fixed dist paths (including its original transitive modules/workers), the
verified prover archive's `serial-prover.cjs`, and the guard's fixed builtin list.
The locator's `require.resolve` indexes a closed frozen map. This is a bounded
source inventory, not a semantic claim about every possible JavaScript load.
The host session storage worker and its bootstrap remain in Freedom in this
slice; they must still be pinned and observed separately. No worker has been
silently converted into a main-thread function.

Freedom integration must replace current wallet-policy source entries with
actual installed package files, export map, manifests, bootstrap and host stub,
including shared data cores. Source-policy hashes identify generations/cache
compatibility; they do not authenticate a maliciously replaced application.
Qualifiers' explicit source inventories and external PRE/POST inventories need
the same actual package paths. No engine/prover ASAR rebuild is needed solely
for these external job relocations; their existing build recipes, runtime bytes
and inputs remain pinned until deliberately moved/rebuilt in a later change.

Packaged acceptance must resolve every job, guard and bootstrap inside
`app.asar`, never `app.asar.unpacked`, and qualify genuine prepare/sign/prove/
independent-verify/recovery with original utility closures. Tests here cover
controlled shims, transport/guard ordering, real container hashing of disposable
synthetic files, and shared-data compatibility only. No native, funded, live RPC,
Tor, relay service, disclosure, signing or submission was performed.

## Explicit staged duplicate model (K1 choice b)

This bounded extraction deliberately keeps the local Freedom helpers needed by
main and legacy jobs. It is not complete Railgun removal. The package has no
public main-helper surface and main must not initialize the execution host just
to use the inert locator. `private-preflight` keeps its original local artifact
issuer/assertion together. Legacy POI/relay utilities use local helpers and
issuers. Newly admitted private utilities use only package helpers/issuers. Do
not pass artifact objects between those implementations or initialize both in
one utility. Existing data wrappers and the kernel share the same installed
.3/.4 data cores by module identity.

Each of the 40 provenance rows now pins both immutable extraction source and
Freedom integration basis `0f2616b28062d5b107a361bfa0e9fdb876f8def9`, plus the
package destination. Six rows changed only to existing .3/.4 data wrappers.
Import relocation, the bootstrap split and E2 artifact checks are explicit
reviewed differences; two hashes are not a claim of semantic equivalence. The
Freedom integration test must verify every local and installed destination pin,
and source policies/qualification inventories must retain BOTH sets of files.
Any changed row needs deliberate successor review; no silent parity exemption.
The later coherent owner/SCC move will remove this temporary duplication.

`initialize` installs the parent message listener synchronously before it
returns. Freedom's entry must call it during module evaluation, without an
await, timer or promise turn. A controlled immediate-message test covers the
ordering, but actual Electron startup/timing remains an integration qualification
requirement, not an already observed native result.
