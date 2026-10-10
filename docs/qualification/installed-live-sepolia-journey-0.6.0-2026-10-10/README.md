# Installed-package live Sepolia journey, 0.6.0

Between October 8 and 10, 2026, the installed package completed one bounded live Railgun journey on Sepolia through Freedom's real host. It made a private self-transfer and established the output's proof of innocence (POI), then unshielded that output to the enrolled EOA. It observed finality and recorded a summary with receipt gas and conservation checks. The final summary report (`09163719…`) passed: every conservation assertion holds, both receipts match their recorded inclusion, and each gas fee is within its cap.

**Scope.** This qualifies only this journey, on Sepolia, at the identities below. It is not a mainnet, ordinary-startup, Tor circuit-isolation or platform qualification. RPC answers are trusted only as `unverified-rpc`.

[INDEX.json](INDEX.json) holds the exact identities, artifact pins and the digest of every live request, report and ledger referenced here.

## What happened

1. **Transfer.** The private self-transfer was sent and observed to finality on October 8.
2. **First POI handoff and identical retry.** Both got HTTP 400; the retry's response was classified as invalid-proof.
   - Cause: Railgun's `@railgun-community/wallet` 11.2.0 rotated the POI circuits (bundle `QmZ2MyM6TKxffkv6stuo2hFwmUfs3q4xgMYN164Sje8new`), and the package still proved with the retired POI_3x3 artifacts.
   - Offline evidence: a public engine vector proved with the retired artifacts fails the node's verification path under the current key, and passes under the retired key.
   - Live evidence: before the replacement, the transition check confirmed that the stored original proof verifies under the retired key and is rejected by the current key.
   - Not observed: the deployed node's exact verifier revision, and the first response's body.
3. **Replacement proof.** Package `ee64dc0` and its fixes (`bcd8607`: the original Shield membership route; `7d75c13`: field-wise capture binding) pin the current POI_3x3 artifacts.
   - It adds one replacement proof for the same output (intent store V5) and its single handoff.
   - The handoff was answered with HTTP 200; the 36-byte body was discarded and classified malformed. The later owned status read decided: **Valid, allValid**.
4. **Unshield.** Three reservations were refused before any send, then the next one succeeded.
   - The first refusal's stage is unknown, because a later history read masked it.
   - The third was instrumented: inside preparation, the only request was `ppoi_validated_txid`, which failed with `TOR_REQUEST_FAILED` at the 10-second limit.
   - After an authenticated no-hold check, the next attempt was acknowledged, included and finalized, and matched its journal.
5. **Summary.** The first summary refused before any request, because the host's live read helper did not allow receipt reads. Host `09eb25d6` added `eth_getTransactionReceipt` only; the host policy digest is unchanged. A summary-only link then recorded the passing summary.

Totals: five operator reservations and **two chain transactions** (the transfer and the unshield). The three unsent reservations are listed separately, each with its own report.

## Ledger links

Each continuation is a fixed, immutable link that binds its predecessor's exact bytes and header. It names old and new identities and receives Codex's technical sign-off before any live action:

- **journey-4:** circuit rebuild and replacement proof.
- **journey-5:** one further unshield after a pre-send refusal.
- **journey-6:** at most three further instrumented attempts, each gated by a custody verification. Eligibility:
  - the first attempt only as `first-instrumented`;
  - later attempts only with a primary Tor failure inside the refused preparation interval and no null result.
- **journey-7:** summary only.

None of these links adds chain sends, raises gas caps or replenishes POI allowances.

## Live and synthetic coverage

**Live:**
- the transfer;
- POI handoffs and status reads;
- the replacement proof;
- custody verification and unshield attempts;
- finality observation and the receipt summary.

**Native synthetic lineages:** these exercised every new link before its live use, against a POI service that verifies the SNARK with the current key. The service's roots, list signatures and finality are synthetic, and only the 3x3 circuit is pinned. The lineages also covered crash after reservation, crash after hold creation, refusal paths and disallowed modes.

## Privacy of this record

Transaction hashes, block numbers, the recipient, amounts, exact receipt gas, note and hold identifiers, proofs, roots and blinded commitments are deliberately not published here, because together they would link the private transfer to the public unshield. They remain in the local evidence, which the digests in INDEX.json bind.

## Follow-up engineering exposed by this campaign

- **Source-policy invalidation is broad.** Any package change invalidated both derived generations, so every fix cost a full live rebuild of about 4–5 h over Tor.
- **Preparation errors are opaque.** Private preparation reports one sanitized code, and successful runner reports kept no request telemetry until journey-6. Preparation needs closed stage categories.
- **Availability behavior is bounded but brittle.** Single Tor failures (the POI node's `ppoi_validated_txid` at the 10-second limit, and block reads) abort a preparation that makes many sequential requests with no tolerance. Bounded, reviewed retry of idempotent reads is needed.
- **Circuit and artifact updates are not detected.** Nothing noticed the upstream POI circuit rotation until live handoffs failed.
- **Response classification guesses.** Handoff responses should be classified only from bytes actually observed and retained, never inferred from length.

These are recorded, not started.
