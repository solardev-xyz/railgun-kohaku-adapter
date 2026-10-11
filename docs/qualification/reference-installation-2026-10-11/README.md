# Fresh installation and cold account — October 11, 2026

The standalone installer passed from clean source `bb9ebca` on macOS arm64,
with isolated initially empty caches, the exact packed adapter, physical locked
dependencies and verified Electron 44.7.0 distribution. INDEX.json records the
package, host, lock and runtime identities. No Freedom application source or
funded profile was used.

The real installed host then created a disposable encrypted account. A second
Electron process reopened it with exactly the same account identity. Both
processes completed with zero network connections. The conformance harness is
`tools/conformance/reference-owner.cjs` with only its three reference-host import
paths relocated to this installed application; its digest and result digests are
recorded. Runtime archives and artifacts are the separately pinned existing
inputs. This does not repeat their fresh acquisition.

The installer alone reports dependency and executable checks. The subsequent
account/reopen results establish the additional scope explicitly; they do not
turn this into a live payment or other-platform qualification. The earlier
[installation record](../reference-installation-2026-10-10/README.md) remains
unchanged, and the live journey keeps its own earlier installation identities.
No release, npm publication or broad platform support is claimed.
