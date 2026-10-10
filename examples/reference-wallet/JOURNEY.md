# Alice pays Bob: reference workflow

This is the manual command sequence for the standalone example. The synthetic
acceptance runner uses fresh random vaults and the same command implementations.
Live execution is a separate qualification step, not implied by this guide.
Do not use a valuable or historical wallet for evaluation.

Use one canonical profile directory per independent seed. Alice and Bob must
have different vaults, different public funding EOAs and different Railgun
addresses. A control wallet Charlie provides a useful negative ownership check.
No step copies Alice's storage or credentials to Bob.

## Prepare each independent wallet

Run these commands with a reviewed Electron executable and an explicit local
runtime/Tor configuration. The `init` and password prompts require a real
terminal; passwords and recovery phrases are never command-line arguments.

```sh
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs init --profile "$ALICE_PROFILE"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs funding-address --profile "$ALICE_PROFILE"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs account-create --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs scan --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs wallet-rebuild --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs address --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
```

Repeat for Bob, and optionally Charlie. Each invocation is a new process.
`scan` recovers the authenticated checkpoint and may pause cleanly before vault
expiry; run it again to continue. Use `wallet-resume` after an interrupted wallet
rebuild. Neither command creates a new generation merely because a read failed.
`scan-new` is a separate, explicit full-rescan decision.

The configuration fixes the Sepolia RPC endpoint, reviewed Arti binary/hash,
engine and prover archives, current circuit artifacts, and the package's POI
and indexer origins. Set the bounded vault lifetime to suit a rescan (at most
60 minutes). Keep the configuration and runtime fixed for one run.

## Fund and shield Alice

Direct submission requires native Sepolia ETH for gas in **both** funding EOAs.
Alice pays for Shield and transfer; Bob pays for unshield. Funding from related
addresses creates public links. This workflow does not demonstrate relay privacy.
Prepare the exact funding and fee budget before a live run. The command's gas
ceiling is 0.002 ETH per transaction; that ceiling is not an estimate of the fee.

```sh
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs shield --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --amount "$SHIELD_WEI"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs shield-history --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs shield-observe --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --transaction "$SHIELD_HASH"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs shield-resolve --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --transaction "$SHIELD_HASH"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs scan --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs wallet-sync --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs notes --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
```

Take the transaction hash and note ID from the actual results. Do not invent a
note from a receipt. The native Shield credits WETH net of the protocol Shield
fee. Resolution needs inclusion, matching operation and finality; a refusal
before finality is a reason to observe the existing hash, never to shield again.

## Alice transfers the note and submits its POI

```sh
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs pay-note --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --note "$ALICE_NOTE" --to "$BOB_RAILGUN_ADDRESS"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs holds --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs observe --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --hold "$TRANSFER_HOLD"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs resolve --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --hold "$TRANSFER_HOLD"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs scan --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs wallet-sync --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs txid-sync --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs poi-prepare-shield --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --hold "$TRANSFER_HOLD"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs poi-submit --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --capsule "$PREPARED_CAPSULE"
```

`pay-note` sends the selected note's full value; there is no automatic coin
selection. Review Bob's address and the foreign-output disclosure. The
`poi-prepare-shield` route is correct here because the **input** was created by a
Shield. An input received from a private transfer uses `poi-prepare-transact`.
POI preparation and submission are distinct, explicitly reviewed actions. A
timeout or malformed response is not proof of rejection or permission to submit
again. The package keeps the attempted record; use recovery/status to inspect it.

## Bob independently receives, reopens and spends

Run Bob's `scan`, `wallet-sync`, and `notes` using Bob's profile/configuration.
Close and reopen the application, then run `notes` again. Bob must see the full
transfer value. Alice must have no unspent copy of that note; Charlie must not
discover it. Alice's sent history is separate from note ownership.

```sh
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs poi-status --profile "$BOB_PROFILE" --config "$BOB_CONFIG" --note "$BOB_NOTE"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs txid-sync --profile "$BOB_PROFILE" --config "$BOB_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs unshield-note --profile "$BOB_PROFILE" --config "$BOB_CONFIG" --note "$BOB_NOTE" --to "$BOB_FUNDING_EOA"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs holds --profile "$BOB_PROFILE" --config "$BOB_CONFIG"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs observe --profile "$BOB_PROFILE" --config "$BOB_CONFIG" --hold "$UNSHIELD_HOLD"
"$ELECTRON_BINARY" examples/reference-wallet/main.cjs resolve --profile "$BOB_PROFILE" --config "$BOB_CONFIG" --hold "$UNSHIELD_HOLD"
```

Wait for genuine Valid status. The unshield preparation rechecks its own current
eligibility; a prior status printout does not grant signing authority. The
recipient must be Bob's enrolled public funding EOA. After finality, scan and
synchronize Bob again and verify that the note is spent. Received value plus the
Railgun unshield fee must equal the note's full value. Actual chain receipt gas
is a separate cost and must be included in the live evidence.

## Interruptions

After a payment interruption, inspect the existing journal or holds first. A
proved, unjournaled retained private operation can be explicitly reviewed with
`submit-stored --hold "$HOLD"`; it is the first broadcast of the retained
operation, not a new payment. If a broadcast response was lost, observe/resolve
that original hold instead. The owner refuses a second submission of a journaled
operation. The application's `operations` rows may lag custody.

An unavailable scan or TXID page can be resumed by a later explicit command from
authenticated progress. There is no automatic transaction or proof-handoff
retry. Keep errors, budgets, disclosure decisions and uncertainty distinct from
successful completion; do not reset stores or manufacture a new profile to
bypass a refusal.

## Actual gas accounting

After resolving each transaction, run `receipt --transaction <hash>` in its
owning profile (Alice for Shield and transfer, Bob for unshield). It reads the
authenticated journal before asking permission and never changes it. Keep these
linking reports private. Add the three `gasFee` values separately from the
Railgun protocol fees; require the live plan's per-transaction and total caps.
A failed receipt check leaves accounting incomplete and never permits a resend.
