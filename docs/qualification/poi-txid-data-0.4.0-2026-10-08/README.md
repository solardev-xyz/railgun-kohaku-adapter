# POI/TXID data 0.4.0 native and packaged acceptance

Installed package `b77c7c1edf0e3e7ffe00ed9627f97d86814ae78a` was exercised from
clean Freedom `0f2616b28062d5b107a361bfa0e9fdb876f8def9`, on Electron 44.6.0.
All ten parent processes exited naturally with code 0: own selector and TXID
(full and partial), Shield selector, Shield and Transact POI verification,
private proof/full and partial unshield, and foreign-recipient Transact recovery.
These use real engine/prover computations with synthetic accounts, chain and
services. The foreign case reuses the original signature and recovers B's output;
B's withdrawal remains preparation-only. No live services, funds or Tor were used.
Nested negative utility exits are not relabelled as successful exits.

Exact reports are preserved. PROVENANCE.json is a path-free projection of the
launcher observations, not an independent rerun. All 92 fixed runtime, package,
lock and public-fixture inputs and 1,407 tracked application/script source hashes
matched before and after each case. This is not a full transitive dependency
resolution freeze or a claim to detect new untracked files. Local launcher records
are retained by hash; absolute path records and profiles are not copied here.

An earlier campaign passed nine native processes but stopped during its ninth
postcheck when a pre-existing temporary public fixture disappeared; the cause is
unknown. It did not qualify the campaign or start case ten. The successful fresh
campaign used its own byte-identical copy of the retained public repository fixture.

The separate unsigned macOS arm64 build uses a clean git-archive source copy and
physical existing pinned dependencies/binaries. Its actual packaged executable
loads the package inside app.asar: 32 POI references, 21 other shared references,
manifest parity and four capsule golden vectors pass. All 49 shipped files match
the 59-file npm artifact except builder's removal of package.json scripts. README
and nine .d.ts files are omitted. CLEAN-INVENTORY.json verifies no identity-data,
tmp, coverage, dist or .git roots in that archive. The known platform file-pattern
issue still includes extra public repository files; this is package inclusion/load
acceptance, not a release-quality packaging claim. No packaged proof or wallet run,
code signing, notarization or upload is claimed.

An earlier build from the active working directory reproduced that known pattern
issue and included ignored local directories. It remains restricted locally and
was not uploaded; no artifact or content from those directories is archived here.
Its first inventory checker also exceeded Node's 2 GiB synchronous-read limit;
streaming SHA-256 fixed that checker. The accepted build above is the clean copy.

No credential, funded profile, ASAR, dependency archive or app bundle is included.
The live recovery allowance stays consumed. SHA256SUMS.json binds every other file.
