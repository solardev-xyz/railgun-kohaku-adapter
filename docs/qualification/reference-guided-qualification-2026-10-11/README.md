# Guided reference qualification — October 11, 2026

The guided standalone application passed its installed synthetic Alice-to-Bob
lifecycle, interruption checks, clean macOS arm64 installation and actual
terminal-entry smoke. The [index](INDEX.json) binds the candidate and evidence.
This closes local qualification, not the fresh frozen-version live run or an
independent human usability walkthrough.

`journey-start`, offline `journey-status` and one-step `journey-next` use the
same owner commands and original reviews as the explicit CLI. Encrypted guide
state is navigation only. The adapter tar is unchanged; the application and its
source identity changed.

The final native run used separate Alice, Bob and unrelated Charlie vaults and
fresh processes. It exercised a paused scan, lost wallet result, declined Shield
preparation, loss of the actual Shield result after broadcast, retained private
preparation, unknown delivery, and loss of the POI result. Bob's first private
preparation failed at TXID staging before recovery stores existed. The next
command refused its history read, rechecked the exact original input, and
re-offered it through the owner's duplicate-input guard. Exactly two Bob
preparation offers and one unshield broadcast occurred. Bob completed cold
unshield and accounting; Charlie discovered no note. Exactly three actual
synthetic transactions and three broadcast requests occurred.

The synthetic service verified current-circuit POI SNARKs. Chain execution,
list data and finality are still synthetic. No live-service or Tor reliability
claim follows. The native app files equal the committed source. The fresh
installation additionally changes the manifest and lock to bind its installed
tar, as the installer documents.

The unmodified installed terminal entry created two disposable unfunded vaults,
started a guide, reopened offline status without configuration, and completed a
funding-address continuation. An invalid digest-bound operator consent was
ignored; the later correct consent completed without restarting the process.
These are agent-operated tests, not independent human feedback.

The full suite passed 320 suites and 13,183 tests; four external-runtime tests
remain explicitly skipped. Lint, both typecheck gates, consumer and source
inventory checks passed. Three isolated mutations established that the nonce,
recipient and ambiguous-hold guards affect test outcomes. The independent AI
reviewer found no remaining code blocker after declined-review accounting and
Bob's pre-selection hash correction were fixed.

Earlier development attempts are retained privately: sandbox socket refusal;
wrong harness expectations for broadcast counts and exact error codes; and an
unlisted documentation file rejected by the source-inventory check. The document
was moved outside the application inventory. A prior native development pass is
superseded by this final run. The operator's terminal script also had a child-exit
race fixed before live initialization. None of these failures is erased or
reported as a final-candidate pass.

Next: complete the fresh live journey on this frozen installation, then ask an
independent person to follow the [walkthrough](../../review/REFERENCE-WALKTHROUGH.md).
Keep addresses, recovery material, transaction linkage, notes and raw terminal
records private. No outreach, release or Freedom activation is part of this
qualification record.
