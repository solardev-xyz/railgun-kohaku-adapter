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
with a default 0 < amount ≤ 10¹⁶ wei (0.01 ETH) for gross Shield and full
private inputs. Optional `maxOperationAmount` configures that application ceiling
within the versioned uint120 representation; it is not a Railgun protocol maximum.
The historical live evidence uses the default. A wider setting does not itself
qualify a deployment, asset or operation shape. Use the exact
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

## Retained operation across a reviewed upgrade

Use this path only for an identified old/new package and host pair whose custody
and derived-state compatibility has been checked. A native retained-upgrade case
and the earlier explicit-command live journey exercise this mechanism; they do
not establish compatibility for arbitrary versions. Preserve the old install,
configuration and private run evidence, and never run both installations against
the profile simultaneously.

A changed guide identity refuses `journey-next`. There is no guided migration or
reset command. The old guide remains a record of the interrupted run; an explicit
continuation below is not a frozen-version guided pass.

1. Install the reviewed successor separately. Keep the same canonical profile
   path and vault; do not copy custody into a new profile or edit its records.
2. If cache compatibility changed, explicitly run `scan-new` (review `REBUILD`),
   then `wallet-rebuild` and `txid-sync`. Resume an interrupted scan or wallet
   build using the normal commands. These rebuild derived state, not the held
   operation. Stop on an integrity refusal rather than creating another generation.
3. Run `holds` and require the exact previously recorded hold, its operation and
   `proof-present` state. A missing or different hold needs diagnosis. Then run
   `observe --hold "$HOLD"`. A journaled, included or uncertain operation goes to
   observation/resolution only.
4. Only a proved, unjournaled hold can proceed to an explicit
   `submit-stored --hold "$HOLD"` review. Check the original recipient, asset,
   amount and fee bound again. Do not call `pay-note` or `unshield-note` to replace
   it. Every attempted continuation repeats disclosures; set a finite attempt
   allowance before starting and stop when a repeated refusal needs diagnosis.
5. Observe and resolve that same hold, then account for its actual receipt.
   Continue the original POI/output lifecycle above using its existing handoff
   state. An attempted POI submission does not become prepared through an upgrade.

The application's `operations` list and saved guide can lag this explicit
continuation. Custody and journals remain authoritative. Keep upgrade identities,
refusals and results in private evidence; do not publish the account-linking values.

## Actual gas accounting

After resolving each transaction, run `receipt --transaction <hash>` in its
owning profile (Alice for Shield and transfer, Bob for unshield). It reads the
authenticated journal before asking permission and never changes it. Keep these
linking reports private. Add the three `gasFee` values separately from the
Railgun protocol fees; require the live plan's per-transaction and total caps.
A failed receipt check leaves accounting incomplete and never permits a resend.

## Recorded standalone completion

The [independent live record](../../docs/qualification/reference-alice-bob-live-2026-10-11/README.md)
completed this direct-submission lifecycle with separate Alice and Bob custody.
Bob cold-submitted the original retained unshield after a supported derived-state
upgrade; no replacement payment or repeated POI handoff was used. All three
receipts and the final available-note accounting passed. The record binds its
own installations and does not qualify arbitrary newer bytes, wider amounts,
mainnet or relayer privacy.

## Guided workflow (candidate under qualification)

The `journey-*` commands keep the navigation in encrypted application storage.
They call the same commands and original owner reviews described above. Each
`journey-next` runs one step in a fresh process; there is no unattended transaction
or POI submission loop. These commands are a new candidate and do not inherit
the earlier live run's qualification.

After installing, configuring and initializing two separate fresh profiles:

```sh
npm start -- journey-start --role bob --profile "$BOB_PROFILE" --config "$BOB_CONFIG"
npm start -- journey-next --profile "$BOB_PROFILE" --config "$BOB_CONFIG"
```

Repeat `journey-next` to follow the printed instruction. Bob first gets his
funding EOA and Railgun address. Fund his EOA for unshield gas, then share his
Railgun address with Alice. The guide asks before each step; the original
`ALLOW`, `PREPARE`, `SEND`, `RESOLVE` and `REBUILD` reviews remain separate.

```sh
npm start -- journey-start --role alice --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
npm start -- journey-next --profile "$ALICE_PROFILE" --config "$ALICE_CONFIG"
```

Alice funds her printed EOA, enters the gross Shield amount in wei, and later
enters Bob's Railgun address. The guide binds her received input to her Shield
transaction, retains the original payment's hold and hash, waits for settlement,
checks receipts and attempts its POI handoff once. Alice shares the finalized
private-payment transaction hash with Bob. Bob enters it in his own guide; his
wallet independently discovers its unspent note. There is no storage or key
exchange. The transaction hash is linking information: keep this exchange and
the command output private.

Bob continues through owned POI status, TXID synchronization, reviewed unshield,
finality, receipt accounting and refreshed note state. Missing POI and pending
finality are wait states. Run `journey-next` later to perform the next explicit
observation. Alice's final state means her side has reached the attempted-POI
boundary; it cannot certify acceptance on behalf of Bob.

```sh
npm start -- journey-status --profile "$BOB_PROFILE"
```

`journey-status` needs the vault password, but no configuration, proxy or network.
It reports the saved phase, last closed error code and next command. Guide state
is bookkeeping, never authority to sign, send or release a hold. It is bound to
its configuration and host-source identity; a changed candidate refuses to
continue instead of silently adopting different software. Starting again does
not overwrite a journey. The original explicit CLI commands remain available
for diagnosis, but do not edit the guide state or perform additional payments
outside it during qualification.

An interruption during payment routes to authenticated custody, not a repeated
payment. A unique hold must name the exact original input. An unfinished proof
has its own explicit proof-resume step; a proved unjournaled hold can be offered
for its first submission, with the original recipient checked again. The owner
still decides eligibility. Unknown delivery is observed, never resent. A lost
POI result is recovered without another handoff. A complete empty custody read,
or the fixed first-use history refusal, permits only an exact original-input
recheck and a bounded preparation re-offer. It does not prove that no reservation
exists: the owner authenticates store creation and blocks an existing reservation
of that same input before signing. Ambiguous custody never permits a re-offer.

There are at most three approved private preparation offers, three approved
Shield SEND offers, and three approved stored-operation SEND offers. Declining a
review consumes no approved offer. Every dispatched command still counts toward
the overall 512-call bound. POI submit-command offers are limited to three and
retain the owner's prepared-only guard; an attempted capsule cannot be handed
off again. Exhaustion, mismatched results or unsupported recovery stops with a
diagnosis. A stopped journey does not report completion. No LLM is involved in
these rules.

If Bob's scan has not found a note yet, the next scan prompt lets him keep the
expected transaction hash or correct it. Once a note is selected, its identity
is fixed. A prolonged Missing POI status can require diagnosis on Alice's side;
this guide does not replace proofs or reset attempted handoffs.
