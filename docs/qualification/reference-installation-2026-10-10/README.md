# Independent reference installation — October 10, 2026

The standalone installer passed from clean source `10df38a` on macOS arm64,
Node 24.18.1, npm 11.16.0 and Electron 44.7.0. Both npm and Electron started with
isolated empty caches. The example uses its own physical dependencies and packed
adapter; no Freedom application module or profile is imported.

The installer measured the downloaded Electron zip against its pinned checksum
and recorded all 273 extracted runtime file/symlink entries, including macOS
frameworks. It compared the complete installed adapter file set and bytes to
the tar, checked every physical locked dependency and preserved the original
lock entries while adding the tar dependency. The generated manifests are host
identity inputs. Exact identities are in `INDEX.json`; machine paths are omitted.

The first two installs were development trials, not clean-commit evidence. The
first clean attempt stopped before installation because npm refuses the same
file as both user and global config. Commit `71cdb64` separated those files and
install D passed. Review then identified that the macOS executable is only a
launcher stub. Commit `10df38a` added measured zip and full distribution identity;
install E passed. D received the same measured-runtime check separately. D and E
have byte-identical adapter tarballs and host identities.

## Actual command acceptance

Two independent, random vaults were initialized by the real terminal commands in
dry install A, with recovery material retained privately. Their funding addresses
were reopened through D and matched exactly. The custody, credential, inventory,
lock and signer files were byte-identical between those installs. No funding or
old profile was used to establish these checks.

D created both genuine Railgun accounts using the independently copied, pinned
runtime and application-owned Tor processes. Each cold-reopened with the same
identity, and the actors' identities differ. Before the first scan, `account-info`
without `--cache pending` correctly refuses: there is no completed active public
generation yet. The explicit pending-mode reopen passed. Public scans then began
independently. This record does not claim their completion or a live payment.
The addresses, credentials and account reports remain local and are not published.

## Validation and remaining scope

Lint, locked TypeScript checks, consumer checks and focused installation tests
passed. The initial full run exposed three unit suites relying on package
self-resolution from the example's former parent scope; the example now has its
own manifest. The checkout resolver now uses the package's real exports from the
repository scope. It exposes no private subpath and is not used by the installed
app. Those suites and the consumer check passed. Three loopback suites failed
under the execution sandbox and passed with local socket access; no assertion
was removed. The fresh full run passed 305 suites and 12,887 tests, with one suite/four external-input tests skipped and zero failures. The subsequently added acquisition suites passed 24 focused tests. Exact pushed-head CI remains pending.

The existing engine fixture also installed from its committed lock into a new
empty cache, with scripts disabled. The unmodified builder verified 10,060 input
files and reproduced the pinned engine archive. An initial build used existing reviewed tools; a later fresh scripts-disabled installation of the locked ASAR/esbuild toolchain reproduced both archives again. The prover's 16 archived packages were also downloaded into an empty cache,
checked against recipe integrities transcribed from the historical lock (digest recorded, lock not committed) and all 73 consumed-file hashes, and rebuilt into
the exact pinned prover archive. The circuit downloader then fetched all 18 supported files and matched their existing size/hash pins. Its first trial stopped on published vkey formatting; the corrected trial preserves already-matching bytes or normalizes to the exact pinned representation. No pin was changed. Keys were not re-derived in this run. The live profiles keep their original authenticated artifact copies; the fresh acquisition is separate installation evidence. Arti acquisition and other native platforms remain separate. No npm release, redistribution clearance,
Windows/Linux Electron qualification, mainnet or relay-privacy claim follows.

Reproduce the application installation with the instructions in the
[example README](../../../examples/reference-wallet/README.md). Every run uses a
new directory and preserves failures. No installer opens or funds a wallet.

## Single-command runtime setup

Clean source `b591c6b` subsequently passed
`node tools/conformance/setup-reference-runtime.cjs <new-directory>` with fresh
caches. That run copied tracked tooling, installed the locked build tools and
engine inputs, acquired the prover closure, rebuilt both archives and downloaded
all 18 artifacts. Final archive checks used the adapter's runtime manifests,
which also matched the historical builder manifests. Circuit acquisition used
the copied pure-data pin snapshot and built-ins only. No root checkout modules
were borrowed by the build or acquisition steps. The runtime report digest is in
INDEX. Four focused tool suites passed 27 tests; lint passed.

Arti remains a separately pinned platform prerequisite. This setup does not open
a profile or execute proofs, and its outputs did not replace the running live
profiles' byte-identical pinned runtime. No release or distribution approval is
implied by reproducing the files.

## Documented setup follow-up

A fresh isolated installation at `2856134` passed after independent read-only
review of the published macOS arm64 setup. The installed application includes
its Arti acquisition guide, MPL license and host provenance; all three copies
match their source bytes. The installer initially rejected those added
non-executable files at `8891fe9`; its exact documentation allowlist was fixed,
with an extra executable file still refused by regression coverage.

The follow-up uses the same pinned Electron distribution and locked dependency
versions. Its exact package, host, report and runtime digests are in
`documentedInstallationFollowup` in INDEX.json. This checks installation and
executable version, not a new wallet or network run. The funded demonstration
keeps its earlier frozen installation. The earlier installation and account
results above retain their original scope and identities.
