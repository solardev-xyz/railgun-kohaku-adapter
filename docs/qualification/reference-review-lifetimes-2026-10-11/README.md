# Reference review lifetimes — October 11, 2026

This candidate separates a person's Shield approval time from chain-evidence
freshness. After approval, the owner revalidates the exact reviewed transaction
before signing. The reference host implements the new fail-closed handshake;
other hosts must adopt it before using this package for Shields.

Direct private preparation overlaps account-independent deployment, artifact and
verifier reads with POI acquisition. Selected-input reads remain gated by genuine
POI evidence. The evidence ages and operation limits are unchanged; two early
key-admission checks reserve a signing tail. Closed diagnostics identify the
observed preflight failure or evidence gate without leaking payloads or claiming
a network root cause. No automatic private-operation retry was introduced.

The previous frozen guided live run remains interrupted. Its Shield finalized,
but three private preparations refused before any private transaction. Its
cause was not recorded precisely enough to establish. The public-only probe
that later succeeded does not explain those failures. Its original profiles,
private note, guide and evidence remain intact; no state was reset.

## Qualification scope

The native fixture uses a real installed tar and independent random Alice, Bob
and Charlie custody, fresh Electron processes, loopback SOCKS/TLS and synthetic
chain/list data. It genuinely verifies current-circuit POI proofs. Delaying
RPC/service reads by 1.25 seconds during Shield/payment commands and delaying Shield
human review by 45 seconds exercises the real lifetimes, not an extended test
clock. This establishes no Tor latency, EVM or live-service acceptance claim.

The first delayed fixture reached Bob's prepared unshield but its warm submission
returned recovery-required at preflight without sending. Its test driver had
expected an immediate broadcast and stopped. That fixture is preserved. The
follow-up changes only the fixture expectation: it demands the exact refusal
and zero sends, then requires the real guide to find and submit the same held
operation, without another preparation. It never infers permission from a
transport timeout. The final run passed through Bob’s cold same-hold unshield, owned-note spending checks and receipt accounting: exactly three synthetic transactions and three broadcast requests. Charlie discovered no owned note. The [index](INDEX.json) binds the results and identities.

The complete unit inventory was run in bounded batches: 322 suites passed,
13,229 tests passed and four tests skipped. Jest reports one mixed suite as
skipped; its executed assertions passed and its external-runtime assertions
remain pending.
Three loopback suites initially failed because the sandbox denied listeners;
all passed with that permission. Two mutation-test source anchors were updated
to remove the same check from its new location; both controls and provenance
passed on rerun. These reruns replace affected results, not add duplicate test
counts. A separate monolithic in-band invocation exited 139 without a test
report. Its cause is unestablished; it is not counted as a pass. The repository's
Jest worker-recycling setting is unchanged; in-band invocations do not use it.

Lint, root and owner typechecks and packed-source accounting passed. The
separate AI reviewer (Claude) found no code blocker, while noting that private acquisition
plus signer startup must still fit the evidence-age gate. This is an availability
limit, not a claim that arbitrary Tor delays now fit. This review is not an
external security audit.

A clean installation from the committed source used isolated npm/Electron caches
and locked dependencies. The documented installed-host account/create and cold
reopen checks passed with zero connections, the same account and the expected
host digest. Runtime archives/artifacts were already verified inputs; this
is not another fresh runtime-download qualification.

No funded profile was used for these checks. A new frozen guided live run and
an independent human walkthrough remain separate gates. No outreach, release,
mainnet, relay-privacy or Freedom activation follows from this record.
