# Private facade successor: recovery and public cache maintenance

This successor merges reviewed parent `40ef9bda2a596262e143bc3f5616f8139e4bad61` into first-stage `a9df3c0943ef2a70df3b9fbcd49afd1b17410f64`, preserving both source-provenance layers. The first-stage freeze is historical and unchanged. No public export, version, installation or activation occurs here.

Owner algorithms are now required only inside the fixed initializer, after successful paired host/source capture and exact runtime path validation. The fixed source-list generator now includes the new facade: 243 files, membership digest `6b3b4ed69832349f8348e8275810ebf1e996aa658495013f85b75ab3620934b2`. There is no selectable resolver. A separate real Node process verifies actual require.cache: importing the facade loads no `railgun-*` owner algorithm; invalid runtime options still load none after the actual private host/source initializers have run. No engine, utility or network is invoked by that test.

The existing session adds:

- `rebuildPublic()` and `resumePublic()`: close and await the exact original public owner, then open with fixed mode `new` or `pending`, captured archive and genuine enrollment. No active lane can coexist. Close failure or cancellation prevents a replacement; there is no fallback generation or silent repair. Inputs/overrides are rejected.
- `openRecovery({signal,reviewDisclosures,reviewTransaction,gasLimit,maxGasFee})`: creates the existing Kohaku recovery companion with the exact internal owner tuple and an internally obtained genuine destination observation. It never requires or opens an active wallet. It projects only `history(after)`, `resumeProof(holdId)`, `submitStored(holdId)`, signal and original closed/close. Existing controller proof/review/completed deadlines are untouched; no timeout option or renewal enters this facade.

Recovery method promises/results/errors are forwarded intact. Session shutdown retains each original recovery operation plus the companion's independent original closure barrier. A recovery lane cannot overlap another lane or public replacement. No raw enrollment/store/key, destination observation, original proof/signature, receipt or controller permit is returned.

Validation: full package `npm test -- --runInBand` passed 60 suites / 1,935 tests. Strict changed-file ESLint (cached Freedom tool/config, max warnings zero), relevant formatting, and `tools/generate-owner-source-list.py --check` passed. New controls cover recovery without a usable wallet, exact destination/owner joins, held recovery work after companion closure, public replacement ordering and failed-drain refusal. These are controlled owner compositions; no installed-host or native outcome is claimed.

Relay local and completed recovery lanes remain the next bounded source slice. They require retaining genuine Transact staging replacement accounts and all original work without exposing its receipt, plus a completed wallet whose original <=180-second deadline is never renewed by list/resume/discard. The public/private/read and retained private recovery surfaces are implemented in this stage, but the facade is not yet described as complete or exported.
