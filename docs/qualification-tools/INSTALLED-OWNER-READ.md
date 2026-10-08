# Installed owner facade: first synthetic acceptance preparation

This is **source-only preparation, not a completed native qualification**. The recipe uses the fixed main facade from package commit `8f7ed18694e4d2b9470e509f356729f177c098c3` and Freedom's host composition from `b9798c17` (full source pins in the adjacent JSON). No runtime archive, profile, engine, prover or native utility was opened while preparing it. The existing source-only tests use controlled facade doubles and cannot establish installed owner acceptance.

## Smallest scenario

`tools/qualification/owner-facade/freedom-read.cjs` is a thin, non-CLI composition module for a future reviewed Electron launcher. It resolves the installed `@freedom/railgun-kohaku-adapter/host/owner` export before creating a fresh directory, initializes Freedom's genuine profile lock and public test-vector vault, and calls the actual fixed `initializeRailgunOwner(runtime)`. That host calls `initializeRailgunMain({host,runtime})`; the tool never imports package private owners or historical Freedom Railgun owners and never uses an owner resolver, bootstrap getter or test export.

The reusable `read-scenario.cjs` performs:

1. `createAccount({accountIndex:0, signal})` and exact public descriptor/instance equality.
2. Sixty sequential `advancePublic({to,anchor})` calls, starting at zero with the existing 100,000-block bound and ending at 5,944,730. The immutable public source's three events move from blocks 10/20/30 to 5,944,710/720/730; hashes follow the historical proof-recovery rule `hash(block+1000)`. No checkpoint or planner limit is fabricated.
3. `openRead({wallet:'new',signal})`, then `instanceId()`, `notes(undefined,true)`, `notes()`, and `balance()`. Predetermined expectations are three received notes (700/1,000/2,000), the 1,000 note spent, two unspent notes totalling 2,700 wrapped-native units, and `unverified` balance status. Those values come from the preserved public fixture generator and synthetic-wallet assertions, not a future native run.
4. Close the read lane and await its original `closed`, then close the session and await its original `closed`. Failure also retains both original barriers. The host releases its profile lock only after the recipe confirms owner closure; failed/uncertain opening or closure leaves the lock with the original main process until outer cleanup. The outer launcher must own a bounded original Electron process; this recipe does not introduce a Promise-race shortcut that releases owners early.

Only registry, Tor endpoint/settings and lower transport leaves are synthetic. The real `private-rpc` implementation, destination objects, read budgets, context, credential bridge, storage, fence, platform process owner and account APIs remain genuine. The router permits only `eth_chainId`, canonical header reads and bounded contract logs for account 0. Every other subject, endpoint, POI/preflight/submission request refuses; refusals remain sticky even if a caller catches them. No upstream crypto or owner API is patched. Synthetic transport does not prove OS network isolation.

The public mnemonic and password are the historical disposable test vector, not user credentials. Only the published source bytes with SHA-256 `bfa8684f50b2bb838b026f2c4972653bfc4503d9fd15182c6c5b219ce1bc1e41` are accepted. `execute` refuses an existing output directory. The output projection includes no note objects, addresses, vault bytes or paths.

## Readiness gates still pending

The immutable 8f7 package manifest **does not yet export `./host/owner`**. The recipe deliberately refuses before creating its directory until the final installed candidate supplies that reviewed export; there is no private fallback. The original source objects used here remain historical design pins, not approval of a later tar. A final reviewed source/runtime request must bind:

- the exact installed owner entry, complete package files/tar/lock and fixed worker entries, host source identity, this tool and public input;
- engine/prover ASARs, artifacts, Electron executable/framework/bootstrap and actual SQLite/native dependencies;
- pre/post inventories, module resolution and relevant absence checks; original main and utility closure evidence through permitted OS-port observations;
- a predeclared utility role/key-loan/worker map derived from the final fixed source, and outer original-handle deadlines and failure preservation.

This module is intentionally not installed in npm `files`, not a production API, and not wired into any launcher. `outerQualificationRequired:true` accompanies a completed recipe result. There is no `nativeReady` assertion, utility module-cache coverage claim or inferred success from elapsed time. Final installation, runtime hashes, native process counts and native execution remain unperformed.

## Follow-up stages through the same public facade

- Shield private preparation: close the read lane, use `openPrivate({wallet:'active',signal,reviewPreparation,reviewTransaction,gasLimit,maxGasFee})`, then `prepareTransfer({asset,amount,noteId}, instanceId)` or fixed unshield input. The returned handle stays opaque. Do not call `broadcast`; local preparation is not transport qualification. Review summaries and public service request bodies can drive a separately reviewed synthetic selected-list fixture; do not expose enrollment or owned-POI getters to reuse the old fixture.
- Historical proof-recovery fixture migration: its `services.setSelected` and fault wrapper currently receive private enrollment/store/process objects. Those seams cannot be reused verbatim. A new fixed host-boundary fault schedule and public service fixture must preserve genuine key admission and durable signature ordering. A clean process restart can then use `openAccount`, `openRecovery`, `history()` and `resumeProof(holdId)` with original observed first-process exit and exact retained bytes. No cold profile can be chosen independently of that first outcome.
- Public lane: `openPublic` / `prepareShield` / opaque `submit` exist, but the read-only transport intentionally refuses those methods. A separate EOA/deployment and reviewed submission scenario is required.
- TXID: 8f7 has no standalone public TXID-bootstrap/advance operation. Shield read needs none, and Transact notes may be read without granting spend authority. A Transact spending fixture must use its public operation's genuine internal staging path where sufficient; if it requires explicit TXID cache preparation, report that missing facade operation rather than importing private owners.

These follow-ups are plans, not coverage achieved by the seven current source-only tests. Run the focused checks with existing tooling: `npm test -- --runInBand test/owner-native-read-recipe.test.js`.
