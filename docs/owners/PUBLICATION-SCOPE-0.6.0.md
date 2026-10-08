# Owner extraction publication scope (0.6.0)

The 0.6.0 owner package extends the earlier adapter, data and execution phases. The packed NOTICE preserves their historical provenance, including the 0.4.0 opening description; it is not the current API inventory. The current API and host responsibilities are in README.md and docs/owners/INTEGRATION.md. Existing MPL and third-party provenance statements remain in force.

The repository retains source migration and review utilities under tools/. In particular, audit-owner-reuse.cjs, stage-owners.py and stage-owner-reverse.py record prerequisites from the original temporary extraction workspace. They are historical reconstruction tools, not portable consumer commands, and are excluded from the package tarball. Current consumers use the documented package exports and supply the specified host capabilities.

The 279-file frozen runtime tarball is bound to source fb3add6aa411375b42ed84735d4901bbc491c68e and SHA-256 6169f7445db3306feae9a16f35d6665e9f767e59b071a41a05e5f14fef02c59c. Subsequent repository test, evidence and removal-manifest commits do not change those packed bytes. Installed native checks and their exact candidate scopes are recorded separately; synthetic evidence does not establish a completed live transfer/withdrawal journey.
