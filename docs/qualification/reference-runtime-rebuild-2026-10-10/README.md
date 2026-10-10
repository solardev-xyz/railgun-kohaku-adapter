# Repository-owned runtime rebuild — October 10, 2026

The adapter repository's preserved engine/prover builders reproduced the pinned
runtime archives using already-installed, hash-checked public dependency inputs.
No builder, manifest or runtime pin changed. No package was downloaded or added.

| Runtime | Result |
| --- | --- |
| Engine | 10,060 input files checked before and after copying; 81,790,332-byte archive equals the package's pinned SHA-256 `019f10880abf1c448aee02ec77c5c2d68c3561c7b4eef02095d66bb5fecd6a7a`. |
| Prover | Two separately assembled 1,613,882-byte archives equal the pinned SHA-256 `dd50a29f297867b3bf91cb425066e1d257ea02230a94b02e4cf34c5c70a0c7ab`; 73 direct inputs match the committed inventory. |
| Historical verifier | The prover check confirms the verifier body is unchanged from the separately pinned historical serial-verifier archive. |

Environment: Node 24.18.1, macOS arm64, `@electron/asar` 3.4.1, esbuild 0.28.2,
snarkjs 0.7.5. Existing physical build-tool and dependency installations were
used. The engine fixture was copied into this repository's tooling directory;
the builder itself did not import Freedom source. The prover builder read an
explicit existing public dependency workspace.

`ENGINE.json` and `PROVER.json` are the builders' data-only reports. The first
prover-check invocation mistakenly supplied the current archive as its historical
input; the exact historical hash check refused it. With the intended historical
serial-verifier archive, the unchanged checker passed. Neither a pin nor a check
was relaxed.

Reproduce using the [build instructions](../../../tools/railgun-runtime-build/README.md)
with fresh output paths and the stated input/tool versions. The checker's third
argument must be the historical archive whose SHA-256 is
`eacc32476b2fc3be0344e1c9b341a9964e405f59703604385b29307350bcca7a`,
not another copy of the current prover archive.

This qualifies assembly from existing authenticated inputs, not a clean network
installation, circuit download, archive redistribution, runtime execution on a
new platform or a security audit. The reports keep
`productionDistributionApproved: false`; mixed third-party licensing and the
two dependencies without packaged license text remain explicit. No archive or
dependency tree is committed with this record.

## Public artifact preflight

The October 10 npm metadata read still names wallet 11.2.0 and the same registry
integrity recorded for the independently authenticated archive. No package was
installed or script run. `ARTIFACT-CHECK.json` records that metadata and the
maintainer checker's 30 matching comparisons against its extracted manifest and
local pinned artifacts. Upstream circuits/kinds outside the adapter's pins are
listed separately, not silently claimed supported. This does not observe the
deployed POI verifier or re-derive verification keys; the earlier artifact
provenance covers their independent derivation.
