# Independent guided walkthrough

This check answers a different question from the automated acceptance tests:
can someone who did not implement this application follow its instructions and
understand its decisions? An AI-operated run or a developer explaining the
recovery internals does not satisfy this check.

Use the [installation instructions](../../examples/reference-wallet/README.md#current-commands) and the
[guided workflow](../../examples/reference-wallet/JOURNEY.md#guided-workflow-candidate-under-qualification).
Start with fresh, separate Sepolia-only profiles. The operator should know the
expected funding, gross Shield amount, recipient and gas ceilings before a
transaction review. Keep the installed version and configuration fixed.

## Walkthrough tasks

1. Install the example from the recorded revision without borrowing a Freedom
   checkout or its dependencies. Record the installation result and identity.
2. Initialize Alice and Bob separately. Save each backup privately and identify
   which public address needs gas. Never paste either phrase or password into a
   bug report, chat or shared terminal recording.
3. Start Bob's guide and obtain his Railgun address. Start Alice's guide, review
   the Shield amount, and enter Bob's address when requested.
4. Close the app between commands. Use `journey-status` without a configuration
   file to find the next step. Follow the saved guide rather than choosing
   internal recovery methods manually.
5. Decline one preparation review. Confirm that nothing was sent and the next
   step remains understandable. Do not intentionally kill a live signing step;
   crash and uncertain-delivery cases belong in the isolated native tests.
6. Finish Alice's local steps. Explain in your own words why Alice's POI handoff
   is not evidence that Bob's output is Valid. Privately give Bob the finalized
   transaction hash requested by his guide.
7. Complete Bob's independent discovery, owned POI check and unshield. Check
   the amount received, protocol fee and actual transaction gas separately.

If the guide stops in diagnosis, preserve the profile and installation. Record
the closed error code and what you expected. Do not reset a store, switch
versions or make another payment to get a passing result. Any help from the
implementer is useful evidence: record exactly where it was needed.

## Feedback record

Keep linking values private. A shareable record should contain only:

- operating system, architecture and installed source revision;
- tasks completed and where documentation was unclear;
- number of times the implementer had to explain a step;
- declined reviews and whether their effects were understandable;
- stopped phases and closed error codes;
- whether the tester could distinguish a wait, a refusal, an unknown delivery
  and confirmed completion;
- elapsed effort and a yes/no answer to “could I repeat this from the docs?”

Transaction hashes, public addresses, note IDs, roots, proof payloads, timings
that connect the parties, raw terminal output and receipts belong in the private
qualification record, not the feedback issue. Report identifiers can bind that
evidence without publishing it. Successful usability does not establish
mainnet safety, a security audit, relay privacy or another supported platform.
