# Standalone reference wallet — implementation in progress

This example is being built to exercise the installed adapter without Freedom
source or a Freedom profile. It is not yet a qualified wallet: the custody
commands and host are implemented; scan/transaction commands, installed-package
execution and Alice-to-Bob qualification are still in progress. Do not fund it.

The first runtime is headless Electron main, with no BrowserWindow. The fixed
utility and storage-worker entries load only public adapter exports. Each realm
owns a real context registry; its host families share that registry. Alice and
Bob will use different seeds, data roots and OS processes.

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

These components import Node built-ins and the adapter's existing ethers peer;
none imports Freedom modules. The example dependency manifest has been proposed
separately (Electron 44.7.0, ethers 6.17.0, better-sqlite3 13.0.3). No new dependency
has been added by this foundation slice. Existing installed Electron 44.7.0 on
macOS arm64 created and cold-reopened a genuine account with the same identity
and zero connections to a refusing loopback fixture. The fixed utility bootstrap
was exercised too. These are checkout tests, not an installed tar, live Tor,
proof, Alice-to-Bob or platform qualification.

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

## Current commands

With the reviewed Electron executable, the entry is `main.cjs`:

```sh
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs init --profile "$NEW_EMPTY_PROFILE"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs restore --profile "$NEW_EMPTY_PROFILE"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs backup --profile "$PROFILE"
```

These commands use a real terminal; redirected credential input/output is
refused. No password or phrase option exists. `init` shows a 24-word phrase after
creation and asks the user to save it offline. `restore` requires an empty root
and preserves the seed, not an old profile's derived caches. `backup` always
reauthenticates the password and requires an explicit reveal confirmation.
Paths must be absolute and canonical, with an existing parent directory.

`account-create` and `account-info` additionally require `--config` and start the
pinned proxy. `account-info --cache pending` selects an interrupted public
generation explicitly. The independent installation/configuration guide and
remaining commands are being completed; the example is not ready for funding.

Runtime data is not copied from Freedom by the application. The repository owns
[engine/prover build tooling](../../tools/railgun-runtime-build/README.md), with
separate pinned inputs, licensing and distribution constraints. Local native
checks reused already-verified archives as data only; those observations do not
establish a fresh reproducible build or permission to redistribute dependencies.

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
request; bounded keep-alive or measured latency qualification is needed before
the live stage. Proxy readiness requires its exact listener message, bootstrap,
and a drained SOCKS method-only probe. No destination or isolation token is sent
by that probe. A conflicting/read-only Arti state refuses; it is never silently
shared. Arti 2.6.0's configuration and state-lock messages were checked under an
outbound-network-denied macOS sandbox. Live bootstrap remains unqualified here.

The guardian currently needs Electron's RunAsNode fuse. A packaged adopter that
disables that fuse must qualify a different guardian launcher; startup fails
closed. Main-process death is covered; simultaneous guardian failure is not an
OS-level parent-death guarantee. State-lock refusal surfaces a surviving proxy
at restart. During graceful quit, cancellation immediately revokes operations
and the proxy; the entry then waits for original command/session work and proxy
exit before locking the vault. A 15-second drain deadline reports a forced exit.
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
only marked disposable roots. A second interrupt may force exit before graceful
draining; the next launch must recover the preserved journals.
