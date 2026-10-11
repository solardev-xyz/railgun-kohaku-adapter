# Standalone reference wallet

In an installed copy, links beginning with `../../` refer to the adapter
repository at the `sourceCommit` recorded in `INSTALLATION.json`. The installer
also includes `LICENSE` and `REFERENCE-HOST-PROVENANCE.json` beside this file.

This example exercises the installed adapter without Freedom source or profiles.
The [synthetic Alice-to-Bob journey](../../docs/qualification/reference-alice-bob-synthetic-2026-10-10/README.md)
passes with independent vaults, root Kohaku adapters over real account lanes,
current-circuit POI verification, cold recovery and Bob's unshield. It remains an
experimental wallet: fresh installation and runtime setup (Arti excluded) have
been exercised on macOS arm64. Live two-account execution and cross-platform
behavior remain separate gates. Use new test-only profiles.
The first runtime is headless Electron main, with no BrowserWindow. The fixed
utility and storage-worker entries load only public adapter exports. Each realm
owns a real context registry; its host families share that registry. Alice and
Bob use different seeds, data roots and OS processes.

## Implemented foundation

- Context identity, owned broker tasks, cancellation and permanent revocation.
- Profile/unlock/application session lifetimes.
- Password-encrypted local vault with bounded unlock lifetime and scoped,
  purpose-specific Railgun credential loans.
- Authenticated profile inventory and encrypted atomic key/value storage.
- Manifest-pinned local artifact loading; fixed Electron utility/worker entries.
- SOCKS isolation credentials, remote DNS and TLS with no direct fallback.
- Destination-bound RPC, durable transaction journal, local signer and reviewed
  transaction service, using the public adapter authority checks.
- An OS-backed SQLite profile lock that neither depends on a heartbeat nor kills
  an unresponsive owner. Chromium's ProcessSingleton did kill a blocked native
  fixture, so the application deliberately does not use it for custody.
- A managed, hash-pinned Arti process with persistent guards/cache and a guardian
  that terminates the proxy when the wallet process dies.
- Terminal-only password/recovery entry, explicit backup display, bounded quit
  drainage and closed fatal-error reporting.

These components import Node built-ins, Electron, the adapter’s ethers and
better-sqlite3 peers, and public adapter exports;
none imports Freedom modules. The example locks Electron 44.7.0, ethers 6.17.0
and better-sqlite3 13.0.3 in its own approved manifest. Existing installed Electron 44.7.0 on
macOS arm64 created and cold-reopened a genuine account with the same identity
and zero connections to a refusing loopback fixture. The fixed utility bootstrap
was exercised too. Those earlier checkout checks remain separate. Later installed-package evidence
covers the synthetic Alice-to-Bob and retained-submission paths. Run H passed the full 75-step lifecycle, including signed receipt accounting
and cache controls. A separate installed rerun of the final receipt reader
verified all three signed hashes with minimal signature fields and unchanged
profile bytes. The evidence identifies these revisions separately. Neither establishes live Tor or platform qualification.

The six adapted network/journal modules retain MPL-2.0 and have an immutable
[Freedom source basis](../../docs/owners/REFERENCE-HOST-PROVENANCE.json). They
have their own capability registries and dependencies here; Freedom is not
imported at runtime. The journal now uses this application's vault and guards,
and the network/retention surface admits Railgun operations only. Persisted
`Freedom …` derivation-domain strings are deliberately preserved, not renamed.

From the adapter checkout after the documented development install:

```sh
npm test -- --runInBand --testPathPatterns='test/reference-.*\.test\.js$'
```

The tests create disposable state under the system temporary directory and keep
it for inspection. Public credential vectors use a mocked inventory for their
fictitious paths; separate integration checks use the actual vault, authenticated
inventory, credential host and encrypted storage across fresh processes. No
funded profile, real service, transaction or POI disclosure is used.

The generic context/storage checkers can also be applied to an adopter's real
implementations; see [host contracts](../../docs/owners/HOST-PORTS.md). Small
component tests do not establish a complete application journey. Native tools
under `tools/conformance/reference-{owner,lifecycle}.cjs` additionally check
account creation/cold reopening, actual lock exclusion, a blocked holder, lock
release after SIGKILL, and fatal exceptions/rejections with proxy cleanup. They
admit only their own marked disposable roots, never an existing wallet profile.

## Configuration

Keep a configuration JSON file outside the application source, profile and
adapter checkout. The installation and runtime setup tools require a clean
checkout, including no untracked files. It
must contain these fields, plus only the optional field described below, and be
at most 16 KiB; replace every placeholder:

```json
{
  "version": 1,
  "runtime": {
    "archive": "/absolute/path/to/railgun-engine.asar",
    "proverArchive": "/absolute/path/to/railgun-prover.asar",
    "artifactDirectory": "/absolute/path/to/circuit-artifacts"
  },
  "tor": {
    "binary": "/absolute/path/to/arti",
    "sha256": "REPLACE_WITH_REVIEWED_BINARY_SHA256"
  },
  "rpcUrl": "https://REPLACE_WITH_REVIEWED_SEPOLIA_RPC",
  "serviceOrigins": [
    "https://ppoi.fdi.network",
    "https://rail-squid.squids.live"
  ],
  "unlockMinutes": 60
}
```

Paths are absolute and canonical. The artifact directory must already exist and
its contents must match the adapter's pins. The two service origins above are
required; at most eight distinct HTTPS origins are allowed. The RPC is an
explicit, unkeyed HTTPS destination with no URL credentials, query or fragment.
There is no redirect, source discovery or direct fallback. `unlockMinutes` is
an integer from 1 to 60. Optional `maxOperationAmount` is a canonical positive
decimal string in wei, at most the uint120 maximum. It defaults to
`"10000000000000000"` and limits gross native Shield value and the full selected
private input. The host captures it once when the process starts. Changing the
configuration for a later process needs no cache rebuild; lowering it preserves
note, hold and POI visibility but refuses new spending above the ceiling.
It does not alter relay limits or gas policy. Wider amounts need an explicitly
configured ceiling; the historical live run uses the unchanged default. The app verifies the exact Arti binary hash, not a version
label. Arti 2.6.0 has local configuration/state-lock evidence; this reference
host now has a [bounded public scan observation](../../docs/qualification/reference-public-scan-2026-10-10/README.md)
with Arti 2.6.0. It does not qualify private-service availability or circuit
isolation. [Arti acquisition](ARTI.md) explains the source and binary pin.
The public scan observation used `https://sepolia.rpc.sentio.xyz`; this names the
measured destination, not a reliability recommendation or a failover endpoint.
Do not borrow another host's routing claim.
[Runtime assembly](../../tools/railgun-runtime-build/README.md)
and [artifact checks](../../docs/review/MAINTENANCE.md) remain separate steps.
The [public scan screen](../../tools/conformance/REFERENCE-PUBLIC-SCREEN.md)
exercises this application's actual Tor transport and the planned scan windows
without opening an account or funding a wallet.

## Current commands

See the [Alice-to-Bob workflow](JOURNEY.md) for the complete command order,
separate recipient custody and interruption handling. The live stage still
requires its own reviewed configuration, funding and evidence.

Prerequisites: a clean Git checkout, Git, Node 24 (recorded: 24.18.1), npm
(recorded: 11.16.0), and Python 3 for runtime assembly. Installation has been
exercised on **macOS arm64 only**; Linux is untested and Windows is unsupported
by this example. A source build of Arti additionally needs Rust/Cargo and its
platform dependencies; see [Arti acquisition](ARTI.md).

Allow several GiB of free space for the checkout, isolated dependency caches,
Electron and runtime artifacts. The retained installation and runtime setup
occupied about 1 GiB together on the measured macOS filesystem; this excludes
the development checkout and Arti's Rust build and is not a portable size bound.
Setup fetches directly over HTTPS from `registry.npmjs.org`, Electron's GitHub
release/download infrastructure, and `ipfs-lb.com`. These downloads do not use
the wallet's Tor transport. Arti acquisition has its own upstream destinations.

Install into a **new absolute directory outside the checkout**, under an existing
canonical parent:

```sh
node tools/conformance/install-reference.cjs /absolute/new-reference-install
cd /absolute/new-reference-install/app
npm start -- init --profile /absolute/new-test-profile
```

Enter each answer only when prompted; do not paste multiple password answers
at once. The terminal intentionally does not accept redirected input.

The installer requires a clean committed checkout, records its exact Git identity,
and packs it using npm's real file whitelist. It copies this
example, installs its locked dependencies, and adds that tarball as a local file
dependency. It executes only the explicitly pinned Electron downloader; npm
lifecycle scripts otherwise stay disabled. It verifies every installed adapter
file against the tar and requires every pre-existing dependency lock entry to
retain its version, URL and integrity. The generated application manifest and
lock are part of host attestation and cache identity. Preserve the whole install
directory, including the tar, `INSTALLATION.json` and `installation.log`.
Never rerun the installer into an existing directory; a failure is preserved.
Both npm and Electron use new, isolated caches. Child processes receive only
PATH/HOME/TMPDIR/locale variables and the installer's cache setting; Node, Electron
and npm overrides refuse startup. Parent/global user module trees also refuse
installation, and every locked package must be physically present. Dependencies
are fetched from the lockfile's registry URLs; this setup is not routed through
wallet Tor. It creates no wallet and downloads no engine or circuit artifacts.
Acquire the pinned runtime separately from the clean adapter checkout:

```sh
node tools/conformance/setup-reference-runtime.cjs /absolute/new-reference-runtime
```

This fresh setup writes `RUNTIME.json`; resolve its three runtime paths against
that new directory in your wallet configuration. It does not open a profile.
Complete the separate [Arti acquisition and binary pin](ARTI.md). Inside the
installed `app`, `npm start -- <command>` launches its own Electron:

```sh
npm start -- init --profile "$NEW_EMPTY_PROFILE"
npm start -- restore --profile "$NEW_EMPTY_PROFILE"
npm start -- backup --profile "$PROFILE"
```

These commands use a real terminal; redirected credential input/output is
refused. No password or phrase option exists. `init` shows a 24-word phrase after
creation and asks the user to save it offline. `restore` requires an empty root
and preserves the seed, not an old profile's derived caches. `backup` always
reauthenticates the password and requires an explicit reveal confirmation.
Paths must be absolute and canonical, with an existing parent directory.

`init`, `restore`, `backup`, `funding-address` and `operations` run without
`--config`. Every other command requires it and starts the pinned proxy. The configuration must allow the package's pinned Sepolia POI and
indexer origins; a missing origin is a startup configuration error. Each command
runs in a fresh process and opens its own bounded vault session.

| Command | Purpose |
| --- | --- |
| `funding-address` | Show the fixed public funding EOA without opening a network connection. |
| `account-create`, `account-info --cache active|pending` | Enroll or inspect this profile's account. |
| `scan` | Authenticate/recover the public checkpoint, then scan to finalized within the application allowance. Repeat after a clean pause. |
| `scan-new` | Explicitly begin a fresh public generation and scan phase after typing `REBUILD`. |
| `wallet-rebuild`, `wallet-resume`, `wallet-sync` | Build, resume or advance the derived private wallet against the public scan. |
| `address`, `notes`, `balance` | Read the active wallet. |
| `shield --amount <wei>` | Prepare and separately review one native Sepolia Shield. |
| `pay-note --note <id> --to <Railgun address>` | Transfer one exact unspent note's full value. No automatic coin selection. |
| `unshield-note --note <id> --to <funding EOA>` | Unshield one exact note to this profile's fixed public EOA. |
| `receipt --transaction <hash>` | Read actual gas for an own settled Shield/private transaction, matched against its journal inclusion and RPC transaction. No account-cache open, journal write or send. |
| `shield-history`, `shield-observe --transaction <hash>`, `shield-resolve --transaction <hash>` | Inspect and settle a Shield's existing public journal entry. |
| `holds`, `observe --hold <id>`, `resolve --hold <id>` | Inspect private custody and settle an existing transaction. |
| `submit-stored --hold <id>` | Explicitly review the first broadcast of an existing proved operation. The owner refuses an already journaled operation; this is never an automatic retry. |
| `txid-sync` | Explicitly consent to at most 80 public TXID owner calls, within 10 minutes. Failed calls count. Up to two classified transport recovery continuations wait 10 seconds each; two consecutive segments without returned progress stop. Roots/cursors stay private; no other command is retried. |
| `poi-prepare-shield --hold <id>`, `poi-prepare-transact --hold <id>` | Prepare POI for an existing operation using the original input's creation route. No automatic handoff. |
| `poi-submit --capsule <digest>` | Separately review and hand off that prepared POI capsule once. |
| `poi-recover --capsule <digest>` | Read attempted-output recovery. Does not resubmit. |
| `poi-status --note <id>` | Explicitly query owned POI status for the selected note. |
| `operations` | Read application bookkeeping offline; this is **not** transaction authority. |

Read disclosures use `ALLOW`; preparation uses `PREPARE`; signing/broadcast uses
`SEND`. Journal settlement uses **`RESOLVE`** because it changes local journal
state and permits the next transaction from the public address. Resolution does
not credit a private note: scan and synchronize the wallet to discover it.

Do not repeat a payment after an uncertain result or process interruption. For
Shield, use `shield-history`, then observe/resolve its original transaction hash.
For a private payment, use `holds`, then observe/resolve the original hold. The
package journal and authenticated custody decide what happened; the `operations`
list can lag a durable operation and never authorizes a resend. A held operation
can remain marked `prepared` there even after explicit recovery; that row is not
updated by `submit-stored`. Use authenticated `holds` and `observe` instead. A hold
without a send remains held. Inspect it before choosing `submit-stored`; the
owner checks its eligibility and reviews the original operation again. This
example does not automatically release or submit a hold.

The implemented commands have the scoped synthetic evidence above. Live two-account execution remains a separate acceptance gate. Fresh dependency
installation and offline vault creation/reopening have now been exercised on
macOS arm64. Fresh engine/prover assembly and all 18 circuit artifacts were also
verified; Arti acquisition is separate. This is not cross-platform acceptance.

`receipt` requires an own authenticated, resolved journal record (including the
archive), then `ALLOW` for chain identity, receipt and transaction reads through
the frozen RPC over Tor. Its 30-second network window begins after consent. It
checks hash, sender, nonce, chain and inclusion, then reconstructs the signed
legacy transaction from its RPC fields and verifies its hash and recovered
sender. The gas limit and price are therefore bound to the recorded transaction.
The receipt's execution, gas used and inclusion remain **unverified RPC claims**.
Legacy effective gas price must equal the signed gas price. A missing RPC chain
field is accepted only when the EIP-155 signature establishes Sepolia. Reverted
transactions also report the gas they consumed. The current application gas
ceiling is informational for historical fees; no estimate substitutes for a
missing receipt. Expiry during the final journal read or transport drain also refuses the result. Railgun protocol fees are separate. Output contains linking
data (transaction/block/gas) and belongs in local evidence, not public reports.

Runtime data is not copied from Freedom by the application. The repository owns
[engine/prover build tooling](../../tools/railgun-runtime-build/README.md), with
separate pinned inputs, licensing and distribution constraints. Earlier native checks reused already-verified archives as data only. The later [fresh setup record](../../docs/qualification/reference-installation-2026-10-10/README.md) reproduced the pinned engine/prover archives and acquired all 18 circuit artifacts independently. Reproducible bytes do not grant redistribution rights.

## Custody boundaries

The local vault encrypts random mnemonic entropy using scrypt and AES-GCM. Its
seed callback is internal to the application host; only four fixed Railgun
credential purposes cross into the adapter. BIP-39 and ethers use immutable
JavaScript strings, so complete in-memory erasure of every intermediate value
cannot be promised. This is an example software vault, not hardware custody.

Profile roots must be canonical paths. Copying a profile to another identity or
path does not silently rebind its keys. An absent initialized inventory/store
requires recovery. Inventory authentication does not prevent an attacker with
filesystem access from rolling back a whole profile. The adapter's account
floors/journals retain their own obligations.

The vault itself uses a path-independent identity. Password-authenticated
recovery-phrase export and import into an empty root preserve the seed after a
move. Existing account stores remain path-bound: restore into a fresh profile,
re-enroll and rescan. Partial initialization also requires a fresh root; it never
overwrites the partial files. Keep only one active root per seed: a per-root
process lock cannot coordinate a restored copy with its original.

Unlock has an absolute lifetime (15 minutes by default, at most 60). Scans must
pause and resume before it expires. Lock-stage recovery of the assembled account
flow remains an explicit qualification requirement; cancellation of the small
host primitives alone does not establish it.

SOCKS username/password fields isolate Tor contexts; they do not authenticate
the local proxy. The app must own its Arti process and endpoint. The current
transport tests use a loopback fixture, and require OpenSSL or LibreSSL to make
a disposable one-day TLS certificate. They establish neither Tor circuit
isolation nor live latency. This first transport creates a connection for each
request. The initial public scan screen used a refilling pool, so its 76-second
header result did not qualify production batch timing. The tool now uses the
owner's batch-barrier schedule. A separate live check of the same 304-header
window passed in 97.4 seconds under that schedule. Private-service latency
remains a separate live gate.
Proxy readiness requires its exact listener message, bootstrap,
and a drained SOCKS method-only probe. No destination or isolation token is sent
by that probe. A conflicting/read-only Arti state refuses; it is never silently
shared. Arti 2.6.0's configuration and state-lock messages were checked under an
outbound-network-denied macOS sandbox. The later public screen bootstrapped a
fresh dedicated proxy and completed 679 public RPC requests on macOS arm64.

The guardian currently needs Electron's RunAsNode fuse. A packaged adopter that
disables that fuse must qualify a different guardian launcher; startup fails
closed. Main-process death is covered; simultaneous guardian failure is not an
OS-level parent-death guarantee. State-lock refusal surfaces a surviving proxy
at restart. During graceful quit, cancellation immediately revokes operations
and the proxy; the entry then waits for original command/session work and proxy
exit before locking the vault. A 15-second drain deadline reports `REFERENCE_SHUTDOWN_TIMEOUT`; a deliberate
later interrupt reports `REFERENCE_SHUTDOWN_INTERRUPTED`. Both mean a forced
exit whose retained journals must be inspected.
Fatal exceptions/rejections exit without Electron's blocking error dialog.

Do not infer Tor routing from a context's `origin:'tor'` requirement, or delivery
from an HTTP response. Transport, artifact, account and transaction qualification
are recorded separately as each is completed. The historical Freedom campaign
is not evidence for this new host.

The lock namespace is outside the wallet inventory and backups. No code may
open or read its SQLite file while holding it: on POSIX, closing another file
descriptor for the same inode can release the process's advisory locks. Custody
boundaries check the original directory and file identities; replacement revokes
custody and exits the application. This detects replacement at a boundary, not
an atomic guarantee against a hostile same-user process replacing paths between
system calls. Network filesystems (NFS/SMB), copied seeds, Linux and Windows lock
behavior are not qualified. Plain-Node conformance uses the same lock core and
only marked disposable roots. Forwarded signal bursts within 1.5 seconds of the first signal share the same
graceful shutdown. A later interrupt may force exit before drainage completes; the next launch must recover the preserved journals.

`REFERENCE_SCAN_PHASE_STALE` means the application scan phase is bound to another
compatibility identity. Inspect the generation state before explicitly choosing
`scan-new`; nothing resets automatically. `REFERENCE_SCAN_FINALITY_BEHIND` means
the RPC's finalized anchor trails retained progress and does not authorize a
reset. Terminal presentation edits alone preserve compatible scan budgets.

### Optional local preparation diagnostics

Set `"diagnostics": true` in the private configuration to print a closed
`preparation-diagnostic` JSON record to stderr after a failed private preparation
has drained. The default is off. The original command failure is unchanged;
there is no automatic retry. These records describe a phase and coarse timing,
not raw payloads or a definitive service-error cause. Keep them local alongside
other run output. Account custody and recovery commands still determine what
may happen next.

### Offline installed-account smoke test

This tests the installed host without Arti, a service connection, or funds. First
complete the installer and pinned runtime setup above. Run the checkout's tool
with `--app` pointing to the **installed** application's `app` directory; no
source edits or copied harness are needed. The default without `--app` remains
the source-host development fixture and is not an installed-host test.

On the qualified macOS arm64 setup, from the adapter checkout:

```sh
REFERENCE_APP=/absolute/reference-install/app
REFERENCE_ELECTRON="$(node -e 'process.stdout.write(require(process.argv[1]))' "$REFERENCE_APP/node_modules/electron")"
REFERENCE_ENGINE=/absolute/pinned-runtime/railgun-engine.asar
REFERENCE_PROVER=/absolute/pinned-runtime/railgun-prover.asar
REFERENCE_ARTIFACTS=/absolute/pinned-runtime/artifacts

env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-C}" \
  "$REFERENCE_ELECTRON" tools/conformance/reference-owner.cjs --app "$REFERENCE_APP" \
  "$REFERENCE_ENGINE" "$REFERENCE_PROVER" "$REFERENCE_ARTIFACTS" account
```

Use the actual verified runtime paths reported by setup, not the illustrative
paths above. Resolving Electron's module with Node selects its direct binary;
this avoids the extra npm or `.bin/electron` forwarding process. The clean
environment keeps Node/Electron overrides out of the fixture.

The result must have `passed: true`, `mode: account`, `connections: 0`, a host
digest matching `INSTALLATION.json`, and a new `root`. On macOS that root usually
lives under `/var/folders/.../T` (the canonical `os.tmpdir()`), not `/private/tmp`.
For the cold reopen, use that exact returned root in a second process:

```sh
REFERENCE_FIXTURE=/exact/root/from/the/first/result
env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-C}" \
  "$REFERENCE_ELECTRON" tools/conformance/reference-owner.cjs --app "$REFERENCE_APP" \
  "$REFERENCE_ENGINE" "$REFERENCE_PROVER" "$REFERENCE_ARTIFACTS" reopen "$REFERENCE_FIXTURE"
```

Expect `passed: true`, `mode: reopen`, `connections: 0`, and the same
`account.instanceIdSha256` and `hostDigest`. The tool accepts only its specially
marked disposable roots; never supply a real profile. It uses the fixed public
password `public reference conformance password`, so **never fund these
accounts**. Keep the temporary evidence for review. Its loopback listener counts
and refuses connections; zero connections proves offline account opening only,
not Tor behavior, a public scan, proving, or a live payment. The separately
recorded runtime acquisition and live journey retain their own qualification.

The reference transport preserves a closed `failureCategory` on rejected
requests: connection, timeout, protocol, TLS, response, cancellation or unknown
(the code values are `connection`, `timeout`, `protocol`, `tls`, `response`,
`cancelled`, `unknown`). This is diagnostic information, not permission to retry.
In particular, `TOR_REQUEST_FAILED` alone does not establish availability: it
can represent a TLS or SOCKS refusal. A known non-200 response remains a response
failure if its socket subsequently breaks. Request bodies, endpoints and native
error text are not included. The transport still makes one request, with no
transparent retry or fallback.

An absent category is ineligible for availability recovery. Explicit cancellation
wins over a racing timeout. SOCKS negative replies and TLS-handshake resets remain
conservatively classified as protocol/TLS failures, even when their underlying
cause might be transient.
