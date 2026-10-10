# Independent reference host: Alice to Bob — October 10, 2026

The standalone application has completed an installed-package synthetic journey
with three independently generated vaults. It imports the package's public
exports and owns its host capabilities; it imports no Freedom source and opens
no Freedom account. Each command runs in a fresh Electron process.

Alice shields, resolves the existing public journal entry, discovers her note,
and pays Bob through the root Kohaku private adapter wrapped around a genuine
owner lane. Alice prepares and submits the transaction's output POI. Bob scans
with his own wallet and discovers exactly the full-value output. Alice and the
unrelated control wallet Charlie discover no unspent output. Bob reopens,
observes Valid POI, and unshields to his own enrolled EOA. Recovery matches the
transaction; received value plus the Railgun fee equals the transferred value.
Bob's subsequent scan shows the note spent.

## What executed

- A real npm pack/install boundary, with the package's publication whitelist.
- Actual vault encryption, credential derivation, context registries, storage,
  utilities, transaction journals, proofs and cold recovery in the new host.
- Both root adapters over genuine owner lanes: public Shield and private
  transfer/unshield, with their respective root submitter/broadcaster factories.
- A synthetic service which verifies the real current-circuit POI proof using
  the pinned engine, prover and verification key. It does not merely accept the
  shape of a proof.
- Three chain-model transactions: Shield, Alice's transfer and Bob's unshield.

The installed copy has one recorded transformation: the production POI list
signature key is replaced with the public synthetic list's key. The repository
and packed tar remain unchanged. `INDEX.json` binds the installed tar, exact
transform and local report digests. No vault, private key, proof, note, account
address or raw report is committed here.

## Current evidence and limits

Run C passed all 50 commands. It precedes the final iterator-drain corrections
and retained-submission command, so it is supporting evidence, not the final
candidate's qualification. Run G completed the retained-submission lifecycle: SIGKILL after preparation,
refusal of a repeated payment, explicit submission of the retained operation,
response loss after delivery, refusal of a repeated submission, and recovery.
Bob received the note, cold-reopened, proved and unshielded it. Charlie could not
receive it. The main flow made exactly three broadcast requests.

G also preserved scan, wallet and TXID reuse after a presentation-only or
serializer-only edit. Its final negative assertion expected the wrong error:
pending cache reuse correctly refused at the catalog layer. A separate local
continuation reran all four controls on G's same installed package and host.
Cache-relevant package and vault changes refused active and pending reuse;
restoring the bytes restored access. That continuation passed with zero sends.
The original failed harness result is preserved; it is not relabelled as a
single uninterrupted passing run. INDEX binds both pieces of evidence.

This evidence includes the captured application gas policy and synchronous
host-currentness performance fix. Run H then passed all 75 steps on a fresh packed installation: the complete
retained-unknown lifecycle, three cryptographically bound transaction receipts,
foreign-hash refusal and all four cache controls.

The final reader additionally accepts standard minimal `r`/`s` signature
quantities. A separate native continuation ran that reader against H's real
journals, with all three transactions served in that encoding. All three signed
hashes verified, the foreign hash refused before network, and every actor profile
file remained byte-for-byte unchanged. No account cache was opened and no
broadcast occurred. INDEX distinguishes H's full lifecycle from this final
receipt-only delta; it does not relabel H's original bytes.

Fresh standalone dependency installation and live two-account use are still
separate gates. The recorded source commit, tar and host-file digests identify
what actually ran; later documentation does not redefine those bytes.

The chain, finality, balances, contract simulation and list signatures are
synthetic. Transactions are signed and their real call data is interpreted, but
there is no EVM execution. SOCKS and TLS use disposable loopback fixtures, not
Tor. No mainnet, live Alice-to-Bob, relay, circuit-isolation or cross-platform
claim follows. Runtime archives were previously authenticated local inputs;
this run does not establish a fresh build or dependency installation.

The native runner is `tools/conformance/reference-journey/run.cjs`. It accepts
only public runtime paths, creates its own marked disposable roots, and never
accepts an existing profile path. An input manifest must identify the Electron
binary, engine/prover archives, artifact directory and public synthetic inputs.
It makes no external network request and never downloads a dependency. The
manual application has no synthetic auto-approval switch.

## Defect exposed by the independent host

The first wallet build exposed an engine stream-lifecycle race: a deferred
iterator close could still be pending when a child job reported its result.
The package now drains admitted remote storage work before a wallet, public
scan or TXID job returns. It retains the main process's idle checks, rejects
new work during drain, and fails closed on an abandoned iterator or expired
drain. This is a package lifecycle fix, not a reference-host workaround.
