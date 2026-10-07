# Recovery/result data 0.3.0 native and packaged acceptance

The installed package from `cbc34b2c5d2d346e4fde722741c3638f4dcd312c` was exercised
from clean Freedom `b5d949981a2d0069023d288c42214ac01d350cdf`, on Electron44.5.1.
The transfer/full-unshield and partial-unshield cases perform real signing, proof
generation, independent verification and fixture capsule recovery on synthetic
inputs. The foreign Shield case additionally uses genuine account owners/stores
with synthetic services: A's original signature is reused, B receives/scans the
output and prepares a withdrawal. B's withdrawal is not signed, proved or sent.
All three parent processes exited naturally with code0. Nested utility negative
controls and intentional closes are not described as successful code0 exits.

The exact JSON reports are preserved. PROVENANCE.json is a path-free projection
of local launcher observations, not an independent re-execution. Native runs
retain fixed runtime/package/lock inventories and tracked wallet/network/identity/
script source hashes before and after; all match. This is not a complete transitive
dependency-resolution freeze or a claim to detect untracked new files. The original
local launcher records and source maps are identified by hash, not shipped here.

The separate unsigned arm64 directory build loads the shared data functions and
four public golden vectors inside app.asar through the actual packaged Electron
executable. It checks21 shared references and engine/prover manifest parity. All
33 shipped files match the42-file npm artifact, with only package scripts stripped;
README and eight .d.ts files are omitted. No packaged wallet/proof run, signing,
notarization, publication, live network or Tor qualification is claimed.

The first packaged consumer invocation stopped because its vector filename was
wrong; the inventory checker then saw its empty output. The corrected input passed
without artifact changes. Neither invocation opened a wallet. These are developer
invocation failures, not successful first-attempt claims.

No funded profile, private credential, engine/prover archive or build artifact is
included. Raw local-path launcher files are omitted rather than rewritten. The
stopped live recovery allowance remains consumed; this archive grants no new
spending authority. SHA256SUMS.json binds every other file in this folder.
