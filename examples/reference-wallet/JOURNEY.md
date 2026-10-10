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

First follow the [standalone installation and runtime setup](README.md#current-commands).
Run every command below from `/absolute/new-reference-install/app`, using that
installation's `npm start` and an explicit local runtime/Tor configuration.
Set `ALICE_PROFILE`, `BOB_PROFILE` and their configuration variables to absolute
canonical paths outside the installation; use different profile directories.
The `init` and password prompts require a real terminal; passwords and recovery phrases are never command-line arguments.

```sh
npm start -- init --profile "$ALICE_PROFILE"
npm start -- funding-address --profile "$ALICE_PROFILE"
npm start -- account-create --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
npm start -- scan --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
npm start -- wallet-rebuild --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
npm start -- address --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
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
The current root adapter permits native Shield and one ERC-20 private input,
with 0 < amount ≤ 10¹⁶ wei (0.01 ETH) for Shield and private inputs. These are
qualification/format bounds, not Railgun protocol maxima. Use the exact
[configuration schema](README.md#configuration), not an inferred config.

```sh
npm start -- shield --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --amount "$SHIELD_WEI"
npm start -- shield-history --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
npm start -- shield-observe --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --transaction "$SHIELD_HASH"
npm start -- shield-resolve --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --transaction "$SHIELD_HASH"
npm start -- scan --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
npm start -- wallet-sync --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
npm start -- notes --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
```

Take the transaction hash and note ID from the actual results. Do not invent a
note from a receipt. The native Shield credits WETH net of the protocol Shield
fee. Resolution needs inclusion, matching operation and finality; a refusal
before finality is a reason to observe the existing hash, never to shield again.

## Alice transfers the note and submits its POI

```sh
npm start -- pay-note --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --note "$ALICE_NOTE" --to "$BOB_RAILGUN_ADDRESS"
npm start -- holds --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
npm start -- observe --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --hold "$TRANSFER_HOLD"
npm start -- resolve --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --hold "$TRANSFER_HOLD"
npm start -- scan --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
npm start -- wallet-sync --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
npm start -- txid-sync --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
npm start -- poi-prepare-shield --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --hold "$TRANSFER_HOLD"
npm start -- poi-submit --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG" --capsule "$PREPARED_CAPSULE"
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
npm start -- poi-status --profile "$BOB_PROFILE" --config "$BOB_CONFIG" --note "$BOB_NOTE"
npm start -- txid-sync --profile "$BOB_PROFILE" --config "$BOB_CONFIG"
npm start -- unshield-note --profile "$BOB_PROFILE" --config "$BOB_CONFIG" --note "$BOB_NOTE" --to "$BOB_FUNDING_EOA"
npm start -- holds --profile "$BOB_PROFILE" --config "$BOB_CONFIG"
npm start -- observe --profile "$BOB_PROFILE" --config "$BOB_CONFIG" --hold "$UNSHIELD_HOLD"
npm start -- resolve --profile "$BOB_PROFILE" --config "$BOB_CONFIG" --hold "$UNSHIELD_HOLD"
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
