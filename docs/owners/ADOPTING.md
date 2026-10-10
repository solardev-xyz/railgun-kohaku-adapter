# Integrating the account owner in another wallet

Start with the standalone example as a complete host implementation, then replace
its application capabilities deliberately. A set of callbacks with the right
names does not establish account authority. The adapter's genuine owner sessions
must create the lanes used by the root Kohaku factories.

## The first vertical slice

1. Pin the package, native runtime and artifacts. Reproduce the consumer checks
   in [local evaluation](../review/EVALUATION.md) before using credentials.
2. Implement one context registry per realm and share it between that realm's
   capabilities. Check the real registry with `tools/conformance/context.cjs`.
3. Provide a disposable vault, profile lock, authenticated inventory and encrypted
   storage. Apply `tools/conformance/storage.cjs` to a fresh directory and your
   genuine context/guard. Then run the credential vectors and loan-lifetime tests.
4. Bind fixed process entries and actual original child exit/drain barriers.
   Initialize `/host/owner` exactly once in main with a captured
   [application policy](APPLICATION-POLICY.md). Utility and storage-worker
   bootstraps have their own fixed realm-local initialization.
5. Create an account, exit and reopen it before adding any network path. Confirm
   the account identity survives and a second process cannot open the same root.
6. Add one explicitly selected RPC path, cancellation and review UI. Scan, close,
   authenticate the saved cursor and resume. Do not create a fresh generation as
   an automatic response to a read failure.
7. Only then add preparation, signing, journal recovery and POI. Exercise lost
   responses and process death before using an external service or funded profile.

The example's `host/compose.cjs` is the assembly point. Its commands use public
package exports; application bookkeeping is separate from authoritative account
custody. `payment-command.cjs` wraps genuine owner lanes with the root Kohaku
adapters and submitter/broadcaster factories. Do not replace those lanes with
fixture callbacks and describe the result as an integrated wallet.

## What to replace

| Capability | Reference implementation | Obligation when replacing it |
| --- | --- | --- |
| Vault and key loans | `host/vault.cjs`, `host/credentials.cjs` | Preserve exact derivation domains, purpose-specific loans, zeroization and original drain. The adapter never receives the master seed. |
| Profile custody | `host/profile-lock.cjs`, `host/inventory.cjs`, `host/files.cjs` | Genuine exclusive access and authenticated, canonical storage roots. A heartbeat or process kill is not an ownership proof. |
| Context and lifetime | `host/context.cjs`, `host/sessions.cjs` | Opaque local handles, permanent revocation, scope/task ownership and cancellation. Synchronous currentness predicates must have no side effects. |
| Encrypted persistence | `host/storage.cjs`, `host/leases.cjs` | Exact transaction/floor semantics, retained original work and observable closure. Never resolve a close barrier while storage work remains. |
| Process platform | `host/platform.cjs`, fixed utility/worker entries | Real ports, transferred keys, bounded memory and original child exit observation; no caller-selected module. |
| Network and privacy | `host/tor.cjs`, `host/transport.cjs`, `host/rpc.cjs`, `host/registry.cjs` | Fixed approved destinations, remote DNS, TLS, cancellation and no hidden direct fallback. SOCKS credentials alone do not establish circuit isolation. |
| Signing and journal | `host/signers.cjs`, `host/transactions.cjs`, `host/journal.cjs` | Exact reviewed transaction and genuine adapter authority at signing/broadcast; durable attempts and uncertain-outcome recovery. |
| User interaction | `review.cjs`, `terminal.cjs` | Display the real operation/disclosures and settle on cancellation. A timeout or closed window never means consent. |
| Compatibility | `host/source-identity.cjs` | Complete immutable implementation snapshot plus conservative cache-specific identities, if supported. Never use a freely mutable version label. |

The [call-site inventory](HOST-PORTS.md), [credential contract](CREDENTIAL-HOST-CONTRACT.md)
and [context/storage contract](HOST-CONTEXT-STORAGE.md) define inputs and return
values. `types/host-owner.d.ts` is the compile-time contract. Some values are
opaque because a genuine runtime registry must issue them; copying an object's
shape is deliberately insufficient.

## Lifecycle that the host must preserve

A scope can be revoked before work settles. `close()` must stop new authority
immediately; `closed` must wait for the original requests, workers and key loans.
A rejected or unobservable drain leaves the account excluded. A new Promise that
merely races a timer does not replace the original settlement barrier.

A prepared operation, durable submission attempt and matched chain observation
are different states. After a crash, inspect retained custody before creating or
sending anything. A proved but never-attempted hold has an explicit reviewed
submission path. An attempted/unknown transaction has observation and resolution
paths, not an automatic retry. POI preparation and disclosure likewise have
separate durable transitions.

The reference wallet's [command workflow](../../examples/reference-wallet/JOURNEY.md)
shows these states across separate processes. Its terminal UI is intentionally
small; its cryptographic and custody work is real. Native synthetic evidence
uses a separately marked test harness, not a hidden auto-consent flag in the
application.

## Acceptance for a replacement host

Run the reusable checkers against the actual implementations, then account
creation/reopen, lock contention and killed-process cleanup with disposable
state. A unit mock cannot qualify those behaviors. Run the installed-package
separate-account journey with real proofs and refusal cases, then a separately
bounded live test with explicit funding and disclosure scope. Record platform,
archive and package identities with each result. Do not inherit another host's
qualification by copying its type definitions or source files.

The current example targets Electron main first. A Node process, browser worker,
mobile host or hardware signer needs its own process/key/transport implementation
and evidence. None is enabled by relaxing the host checks or exporting internal
account objects.

The [shared-contract record](../qualification/reference-host-contracts-2026-10-10/README.md)
applies these checkers to the existing Freedom primitives as well as the reference
host tests, with the inventory seam and evidence limits stated explicitly.

## Runnable local checks

With the existing locked development dependencies installed:

```sh
npm test -- --runInBand test/reference-credentials.test.js test/reference-context.test.js test/reference-storage.test.js
node tools/conformance/reference-journey/run.cjs /absolute/path/to/public-fixture-inputs.json
```

The second command requires authenticated `electron`, `runtime` (`archive`,
`proverArchive`, `artifactDirectory`), `engineModules`, `serialProver` and
`publicSource` paths in its input JSON. Set `variant` to `retained-unknown` for
the prepared-operation crash/uncertain-send case. The runtime/prover builders
and [qualification record](../qualification/reference-alice-bob-synthetic-2026-10-10/README.md)
identify those inputs and their limits. The runner creates new marked temporary
profiles and uses only loopback synthetic services; it does not accept an existing
wallet path. It invokes real crypto and Electron, so the portable Node CI is not
a substitute. The public source fixture is in
`docs/freedom-qualification/railgun-unsigned-relay-preparation-2026-10-06/public-source.json`.
