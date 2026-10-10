# Adapter adoption milestones

Agreed direction, October 10, 2026: make this repository independently usable
before resuming Freedom product integration. Prepare review materials now;
external outreach follows the reference application and adoption work below.
Maintainers will choose and contact reviewers. No outreach has been sent.

The completed Freedom Sepolia campaign is the baseline, not the reference app.
Its evidence and retained profiles stay intact. New development uses independent
disposable state and identifies every new runtime and artifact set.

## 1. Reviewable project

Deliver an accurate README, responsibility diagram, capability/qualification
matrix, reproducible local evaluation and a focused external-review brief.
Distinguish restricted Kohaku compatibility from a complete application host,
and historical package results from the current candidate.

Acceptance: a reader can identify the supported API, implementer obligations,
tested scenarios and important limits without reconstructing the live campaign.
Document and execute the published evaluation commands on a clean checkout.

## 2. Standalone reference application and Alice-to-Bob journey

Build `examples/reference-wallet/` as a small terminal application with explicit
commands and progress, independently installed against the packed tarball of this package.
A GUI is not required for this milestone. The first runtime is a headless
Electron main process: utilities, message ports and ASAR loading match the
existing package. A plain Node launcher is a later separately qualified target.
The example's concrete dependency/build manifest must be reviewed before adding
Electron or other dependencies; no dependency is added by this plan.

First document every captured host function from the package's actual call sites:
arguments, returned values and follow-up calls, identity, lifetime, cancellation,
settlement and errors. Add black-box conformance checks and apply them to the
existing Freedom host as well as the new host. This part of milestone 4 is a
prerequisite: an opaque callback type is not an implementable contract.

The example must own its credentials, context registry, process lifetime,
encrypted persistence and transport. It must not import Freedom source, use a
Freedom profile, deep-import package internals, fake authority receipts, or reuse
the historical live-runner campaign as its application architecture. Public
synthetic fixtures are for tests only.

Deliver in three verifiable stages:

1. Installed application bootstrap, actual host conformance, account creation,
   bounded scanning and cold reopening with genuine encrypted persistence.
   Route at least one private operation through the root Kohaku private adapter
   wrapping a genuine owner lane; the prior journeys exercised the lane directly.
2. Independent Alice and Bob credentials/stores in separate OS processes and
   data roots, with different vault seeds. Alice shields and privately
   transfers to Bob. Alice's process submits the transaction's POI covering Bob's
   output, with the foreign recipient and output-POI disclosure in her review.
   Bob discovers the note through his own scan, closes and restarts, observes
   Valid through his own status read, then spends or unshields it. Bob must
   not need Alice's credentials, local database or a fabricated received note.
   Alice must not see Bob's received note as her own, and an unrelated account C
   must not discover it. The tests retain Alice's sent record separately.
3. The same lifecycle on Sepolia, with recorded inclusion/finality, conservation,
   actual gas and explicit network/privacy scope. Direct submission and authentic
   relay submission are separate acceptance cases. Authentic relay discovery and
   handoff require new package/host work: today's relay lanes stop at local
   custody. Direct submission cannot close the relay/privacy goal.

Interruption cases include scan outage, lock/close, restart with a held operation,
uncertain submission and POI unavailability. No response timeout alone permits a
second transaction. Each command must report whether work is pending, recoverable,
completed or refused without exposing private inputs.

Before a live run, prepare a concrete account/funding plan, service destinations,
disclosures, operation/fee bounds and stop/recovery conditions. Do not reuse the
previous campaign's allowance or silently reopen its funded profile. Synthetic
success is a prerequisite, not evidence of live acceptance. A direct-submission
test needs Bob's own gas-funded EOA; that funding creates a public link and must
not be described as a relay-privacy demonstration.

## 3. Reusable protocol behavior and application policy

Inventory every Freedom-specific restriction and classify it as a protocol
invariant, authenticated deployment/artifact compatibility, application policy,
or qualification-run budget. Use the reference application's actual needs to
design the configuration surface. Necessary prerequisites can be implemented
during milestone 2 rather than bypassed in its host.

Acceptance: supported deployment/configuration combinations are explicit and
validated; application limits no longer masquerade as Railgun protocol limits;
proof verification, ownership, destination binding and uncertainty protection
remain invariant. Historical capsules retain their meanings. A configuration
option does not by itself qualify mainnet or another chain.

## 4. Tractable host integration

Turn the example's proven host obligations into a documented integration path:
precise capability contracts, actionable closed error stages, reusable platform
components where justified, and executable conformance checks. Keep vault and
signing authority in the adopting application's trust boundary.

Acceptance: a developer other than the implementer can install and operate the
example from the documentation, then identify the specific components they must
replace for their own wallet. The host contract is checked with real custody,
cancellation, drain and restart behavior, not just method names or fixture keys.
The example is an independent application but not an independent external audit.

## 5. Maintainable experimental release

Complete the work necessary to support another team over time:

- compatible engine/circuit/service version manifests and update detection;
- explicit storage/operation migration and downgrade behavior;
- narrower derived-cache invalidation, while preserving retained authority;
- bounded idempotent-read recovery and useful redacted progress/error reporting;
- reproducible runtime/artifact acquisition and clear licensing/provenance;
- a clean-checkout CI path, supported-platform matrix and installation guide;
- versioning, release notes, security reporting and a stated maintenance scope.

Acceptance: repeatable installation and upgrade/recovery demonstrations at
identified versions, with a test suite whose required environment is documented.
Do not silently skip failing suites to manufacture a portable baseline. Artifact
distribution, dependencies and publication need their concrete plans reviewed;
this roadmap does not publish an npm release.

## External review and return to Freedom

When the milestones have evidence, update the review brief to the exact release
candidate and ask Kohaku/Railgun/EF reviewers about API fit, host boundaries,
privacy assumptions and the adoption experience. Address the feedback before
resuming Freedom's user-facing integration. Existing Freedom PRs remain separate;
this plan does not merge or activate them.

The key outcome is that another wallet can use this package without inheriting
Freedom's source tree or needing the original implementers to operate it.

## Current implementation checkpoint

The review guide, call-site host contracts and replacement-host path are written.
The independent headless example owns genuine custody/process/network capabilities
and exercises the installed root Kohaku adapters over real owner lanes. Its
synthetic Alice-to-Bob lifecycle, retained interruption/unknown-send recovery,
cold Bob unshield and real current-circuit POI verification have scoped evidence.
It also provides own-journal receipt accounting; it never imports Freedom.

The application gas ceiling is captured at initialization. Derived public,
wallet and TXID cache identities are separate from complete source attestation,
with conservative reviewed exclusions and reuse/refusal controls. Protocol,
deployment, operation-format and security bounds remain explicitly classified.
The artifact drift checker, runtime build evidence, host conformance checks,
maintenance/release guidance and clean-checkout CI configuration are present.

The standalone dependency manifest is approved and implemented. Its installer
checks a clean source commit, exact packed bytes, physical locked dependencies
and an isolated Electron acquisition. Dry installs and offline wallet creation
have passed; the final clean-commit acceptance is in progress.
Still required before outreach: the separately funded live Alice-to-Bob demonstration,
and a final independent review of the exact documented installation. Clean
Linux/macOS Node CI passed at `cff84c9` (304 suites, 12,871 tests; four explicit
external-input skips). The newly approved lint/typecheck gates need their own
new-head CI result; the independent host's
[bounded public scan screen](qualification/reference-public-scan-2026-10-10/README.md)
also passed. These scoped results do not close the remaining acceptance gates or
inherit claims from the historical Freedom campaign.

Other roadmap items stay explicit: the authenticated deployment descriptor and
broader operation-policy generalization are not implemented; Sepolia pins and
historical amount/shape bounds remain. Availability recovery is explicit resume,
not a general idempotent-read retry engine. Experimental versioning and a platform
matrix are documented, private vulnerability reporting is enabled, and a tagged
release's version/notes still require its concrete release decision. Authentic
relay handoff/privacy and additional platforms remain open qualification targets;
the planned direct-submission demonstration cannot close them. No mainnet or
production-activation claim follows from any of these checks.
