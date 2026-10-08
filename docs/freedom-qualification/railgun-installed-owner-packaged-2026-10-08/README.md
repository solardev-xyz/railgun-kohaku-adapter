# Installed owner package: unsigned app packaging and initialization

At host `99476989` and package `133e88cc` (tar C), a clean physical checkout and locked install produced an unsigned macOS arm64 directory build with the actual `scripts/after-pack.js`. No application was published or notarized.

All 278 npm files were accounted for: 262 ship exactly once; 16 README/type files are omitted by the builder. Every shipped byte equals the tarball, except the builder removes package.json scripts. There are no extra package files. The 125 package files actually loaded by the initialization check have hashes joined back to those tarball bytes.

The pinned Electron 44.6.0 main loaded Freedom's real fixed host directly from the built app.asar, computed its source identity, initialized both owner/execution markers and obtained the frozen account facade. A second initialization refused. No legacy Freedom Railgun owner or native addon was loaded. The original process exited naturally with zero in 2 seconds.

This is packaged resolution and initialization evidence. It does not exercise accounts, credentials, utilities, storage workers, private operations, live services, or startup of the distributed Freedom executable. Node network entrypoints were deliberately replaced with refusal guards. The separate installed native read campaign covers the genuine wallet and closure path.

The pre-existing platform file-pattern overinclusion remains. This build used a clean clone with no ignored profile data; explicit forbidden profile/vault filenames were absent. This does not establish a general secret scan or fix the unrelated packaging configuration.

The three result files are byte-exact. PROVENANCE records the exact local checker hashes, source/runtime pins, invocation, limitations, and earlier checker/installation refusals. Fixed-path local source files are not published. INDEX pins every published file.
