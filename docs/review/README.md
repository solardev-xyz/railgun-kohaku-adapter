# Technical review guide

This guide describes the adoption work through October 11, 2026. The
package is experimental and not published to npm. External outreach is planned
after the [adoption milestones](../ADOPTION-ROADMAP.md); this document is a draft
review brief, not a claim that those milestones have passed.

## What problem this solves

The package integrates Railgun with restricted Kohaku plugin interfaces and a
wallet-controlled execution environment. It combines account enrollment,
encrypted scan state, proving, operation custody, POI and recovery while keeping
the wallet's master seed, process lifecycle and network policy in the host.
Railgun's engine and proving artifacts remain upstream implementations. This
package does not implement a new privacy protocol or replace their cryptography.

Freedom is the first adopting application. The standalone reference host now uses the installed packed tarball (`npm pack`) of this package without
Freedom source or its profiles. Its independent Alice-to-Bob flow passed against
a synthetic chain and a real SNARK-verifying POI fixture. The separately funded
live Alice-to-Bob journey also completed on its recorded installations. Fresh
standalone installation and cold-account checks have their own evidence; wider
native platform coverage remains open.

## Read in this order

1. [Architecture](ARCHITECTURE.md) and the two integration levels.
2. [Local evaluation](EVALUATION.md), including what each check does not prove.
3. [Owner integration](../owners/INTEGRATION.md) and the
   [credential contract](../owners/CREDENTIAL-HOST-CONTRACT.md).
4. [Independent live Alice-to-Bob evidence](../qualification/reference-alice-bob-live-2026-10-11/README.md),
   [fresh installation and cold account](../qualification/reference-installation-2026-10-11/README.md),
   and the earlier [Freedom Sepolia evidence](../qualification/installed-live-sepolia-journey-0.6.0-2026-10-10/README.md).
5. [Installation and maintenance](MAINTENANCE.md), then the [adoption roadmap](../ADOPTION-ROADMAP.md) and [provenance](../../NOTICE.md).

## What the evidence establishes

| Evidence | Established | Not established |
| --- | --- | --- |
| Package consumer and type checks | Restricted CJS/ESM interfaces, shared operation identity, structural compatibility with the recorded Kohaku types | Generic Kohaku `Host`/`CreatePluginFn` compatibility or account authority from a host-shaped object |
| Historical Freedom native synthetic journeys | Real package/engine/prover execution, retained custody and refusal/recovery cases under the recorded fixtures | An independent non-Freedom host, live provider behavior, authentic list roots or circuit isolation |
| Independent reference-host synthetic journey | Installed root adapters over genuine owners; three separate vaults/processes; Alice-to-Bob discovery, retained recovery and cold Bob unshield; real current-circuit POI verification | Live chain/service behavior, EVM execution, Tor or platform qualification |
| Historical Freedom installed live Sepolia journey | Private self-transfer, output POI, fresh-process reopens and source-policy upgrade rebuilds, finalized unshield and receipt/conservation checks | An independent non-Freedom host, live two-account spend, live crash recovery, mainnet, ordinary startup or relayer privacy |
| Independent reference-host live journey | Separate custody and fresh processes; foreign payment through the root private adapter; Bob’s independent discovery, owned Valid status, same-hold cold recovery and finalized unshield; three receipt/conservation checks | Mainnet, relay privacy, live Charlie control, latest-source qualification or independent security audit |
| Wider-amount native policy lifecycle | Configured direct ceiling, policy-independent reads, cold refusal under a lower ceiling, same-hold submission after restoration and three-receipt conservation | Wider live amounts, broader proof shapes or relay policy changes |
| Fresh newer-candidate installation | Isolated locked dependencies, exact packed bytes, verified Electron distribution and actual cold account reopen with zero connections | A second live payment, other platforms or new runtime/artifact acquisition |
| E8 unsigned macOS packaged initialization | Exact package resolution, paired initialization, loading and zero network attempts during that probe | Packaged wallet operations, ordinary app startup, a signed build, a distributable application or other platforms |

The historical Freedom live journey used earlier package candidates before E8. Historical tar-D and
0.5 results remain separate; a later package does not inherit their qualification.
RPC observations retain the `unverified-rpc` trust label. No independent security
audit of this integration is claimed.

The historical Freedom journeys exercised account-owner lanes directly. The
reference application's newer evidence exercises root Kohaku adapters over
genuine lanes; see its [scoped record](../qualification/reference-alice-bob-synthetic-2026-10-10/README.md).

## Questions for reviewers

- Does the restricted Kohaku interface fit a useful integration tier? Which
  additional upstream interfaces would an adopter actually need?
- Is the division between Railgun account owners and wallet capabilities clear?
  Which host obligations should have reusable implementations?
- Which Freedom-derived restrictions should become reviewed deployment or
  application policy, and which should stay invariant?
- Are custody, signing, cancellation and uncertain-submission boundaries
  understandable and reviewable? Where does the API encourage unsafe assumptions?
- Can another developer install the reference application and complete its
  documented lifecycle without private instructions or a Freedom checkout?
- What compatibility and release commitments are necessary before adoption?

The [first fresh installation record](../qualification/reference-installation-2026-10-10/README.md) covers isolated application dependencies, runtime inputs and cold account reopens on macOS arm64. The [newer candidate check](../qualification/reference-installation-2026-10-11/README.md) repeats installation and an offline account reopen. Keep those identities separate from the completed live journey and synthetic lifecycle; other native platforms remain open.

## Information kept out of public reports

Do not combine account-linked transaction hashes, addresses, amounts, precise
timings, note/hold identifiers, proof inputs or commitments in public reports.
Together those can link private operations. The completed campaign publishes
scope and a salted commitment to its private evidence bundle, with the salt and
sensitive operational evidence retained locally. Plain hashes of small wallet
reports are not redaction: public-chain candidates can make their inputs
enumerable. Publish ordinary digests only for public inputs or explicitly
non-funded fixtures, and keep the commitment opening private.
