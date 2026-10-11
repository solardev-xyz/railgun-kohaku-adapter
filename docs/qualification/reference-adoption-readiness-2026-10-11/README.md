# Reference adoption candidate — October 11, 2026

Candidate `c2bb5e7` passed a fresh locked installation and the documented
`--app` offline account/create and cold-reopen commands on macOS arm64. Both
processes used the same installed host and account, with zero connections.
INDEX.json pins the 301-member tar, host, dependencies and Electron distribution.
This used the existing authenticated runtime inputs, not another runtime download.

The same tar then passed the complete 75-step native Alice/Bob/Charlie fixture:
separate custody, foreign payment through genuine root adapters, real current
POI proof verification, Bob's owned Valid read and cold unshield, three receipts
and conservation. The loopback service uses synthetic chain/list state; this
establishes neither EVM execution nor Tor behavior. The production tar is
unchanged; the explicitly recorded test-list transform is applied only to its
fixture installation.

The new read-recovery controls were exercised on `ppoi_validated_txid`:
HTTP 503 and malformed JSON each stopped after one call with no recovery event.
A connection reset during the first synchronization recovered in the same
command, with the failed call charged. Its returned count and root exactly
matched a subsequent control sync. Indexer-page and root-masking classification
have unit coverage; this fixture does not claim every failure point natively.
No private operation, proof, POI handoff or broadcast used automatic recovery.

Preparation diagnostics separately named a declined review and a service
refusal during TXID staging. Neither broadcast. The final inventory contained
exactly Bob's successful unshield hold, and the journey made exactly three chain
transactions. Original refusal and cleanup behavior remained intact.

Earlier A/B fixture runs stopped on incorrect harness assumptions (never-created
history is not an empty inventory; the injected TXID error occurs in staging,
not proving). Those failures are preserved locally. C passed but was superseded
by restoring the facade's strict-mode directive placement. D reran the entire
journey on the final committed bytes and is the result recorded here.

The full local suite passed 318 suites / 13,131 tests, with one suite and four
external-runtime cases explicitly skipped. Lint, consumer, root/owner types and
packed inventory checks passed; affected tests were rerun after final small
changes. Removing the root provenance carry, eligibility guard or recovery
backstop made its isolated mutation control fail. Pushed-head CI is recorded in
the roadmap separately; this record does not imply an unobserved CI outcome.

The [independent walkthrough](../reference-independent-adopter-2026-10-11/README.md)
records a separate reviewer's installation and the invocation gap fixed here.
The completed [live payment](../reference-alice-bob-live-2026-10-11/README.md)
keeps its own earlier installation identities and salted private evidence
commitment. No funded profile was used in these checks, and no newer-source live,
mainnet, relayer privacy, other-platform or external-audit claim follows.
