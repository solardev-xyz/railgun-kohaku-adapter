# Installed-owner synthetic journey family

Native synthetic acceptance of the installed package with Freedom's genuine
host:

- genuine `initializeRailgunOwner`, contexts, private RPC, journal, reconciler,
  credentials, stores, engine and prover;
- only the registry, Tor endpoint, availability setting and lower transport
  leaves are replaced (`journey-host.cjs`, adapted from the reviewed r5
  composition).

## Synthetic chain (`journey-chain.cjs`)

One persisted synthetic Sepolia, a POI list node and a TXID indexer. Only
primary facts persist between modes:

- head and finality;
- the signed transactions the owners actually sent, with their inclusion;
- accepted POI outputs.

Every derived value is recomputed in a harness worker
(`journey-crypto-worker.cjs`) with the pinned engine source tree. That code is
independent of the installed package's own projection code, so service
acceptance remains a real check. Derived values are:

- UTXO leaves and roots: `rootHistory` answers only for model roots;
- spent nullifiers;
- TXID rows, verification-hash chain and roots: `ppoi_validate_txid_merkleroot`
  answers only for model roots;
- the POI list tree.

Logs (Nullified, Transact, Unshield and Transfers) come from the actual signed
calldata. Signed POI events use the public test list key (seed `0x0a…0a`),
which reproduces the reviewed vector event byte for byte. Any undeclared
request is a sticky refusal.

Known limitations:

- `simulate` is a narrow semantic check (contract, known root, unspent
  nullifiers), not EVM execution;
- the POI node accepts submissions structurally and does not verify the POI
  snark.

Optional fault and test hooks:

- `sendMode: 'unknown-after-delivery'`;
- the `preflightAnchorAfterEstimate` fault, which reproduces the live L-A 3b
  refusal;
- `autoMine` for dry runs of polling callers.

## Modes (`journey-launcher.cjs`)

| Mode | What it runs |
| ---- | ------------ |
| `prepare` | r5 private preparation |
| `submit-stored` | G1 `unjournaled`, `submitStored`, repeat refused, G1 pending then included |
| `submit-stored-unknown` | Unknown delivery, G1 discovery by hold id, `resolve(12)` |
| `cold-output` | Scan, TXID, unresolved POI control, G1 resolve, Shield-route POI, owned POI `allValid` |
| `transact-unshield` | Unshield of the Transact output, G1 observe and resolve |
| `legacy-recover` | G4 recovery of a legacy hold |
| `policy-probe` | Active-mode refusal of an earlier-package account |
| `policy-recover` | `publicCache` rebuild and recovery of an earlier-package account |
| `pending-negative` | A `pending` open without a candidate refuses |

## G4 legacy harness

`g4-legacy-entry.cjs` and `legacy-launcher.cjs` run the genuine legacy Freedom
`843c0cfc` owners on the same chain. The only change to that worktree is the
recorded synthetic list transform (`transform-legacy.cjs`). The flow is:

1. a normal self-transfer proves (`proved`);
2. the post-proof estimate succeeds;
3. the submission preflight anchor fails and is classified `refused`, with an
   empty journal, so the hold is `proved-unsent`.

The legacy report records hashes only of the capsule, signature, proved
transaction and calldata, plus a profile file inventory. The installed
recovery then checks the sent calldata against them.

## Host transforms

`transform-host.cjs` applies the reviewed r5 byte transform, which swaps the
POI records list key for the public test key. It runs only on disposable
`freedom-journey-host-*` copies and records both hashes. Live hosts are never
transformed.
