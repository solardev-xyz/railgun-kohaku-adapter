# @freedom/railgun-kohaku-adapter

A restricted Kohaku-style facade over **trusted, application-supplied** Railgun hosts. Version 0.1.0 is not published to npm (`"private": true`); its source is public at https://github.com/solardev-xyz/railgun-kohaku-adapter. It was extracted from the Freedom browser (commit `88b2496b`) as the first package of the privacy work ("E1"); see `NOTICE.md` for exact provenance.

This is **not** a self-contained Railgun SDK. It contains no Railgun engine, prover, key management, wallet vault, storage, RPC client, Tor transport or UI. The application's host does the actual work: it owns the account, holds the keys, generates proofs, signs and submits transactions, and keeps durable state. This package only sits between a Kohaku-style consumer and that host, and does four things:

- It validates the data that crosses the boundary.
- It copies and freezes that data so neither side can mutate the other's view.
- It enforces session and one-use operation lifecycles.
- It preserves the host's original settlement results.

Host-shaped objects and readable notes do not establish authority. Host callbacks run in-process and are not sandboxed.

## Requirements

- Node.js 24 or later. Tested on Node 24.18.1 and on Electron 44.5.1's bundled Node 24.21.0. The floor is real; see [Native Promise contract](#native-promise-contract).
- Peer dependency `ethers` `^6.17.0`, used only for `getAddress` checksum validation. It is not bundled.
- CommonJS is the canonical runtime. `index.mjs` is a thin ESM wrapper that re-exports the same CommonJS module objects. `require()` and `import` of this package therefore return the same five functions and share one set of operation registries. Separate physical copies of the package do not share registries, so each copy must use its own hosts.

## Exports

| Export                                         | Takes                                     | Returns                                                                                         |
| ---------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `createRailgunKohakuSnapshotPlugin`            | `{ host: SnapshotHost, signal }`          | A read-only plugin: `instanceId`, `balance`, `notes`, `close`, `closed`, `signal`, `provenance` |
| `createRailgunKohakuPrivateAdapter`            | `{ host: RestrictedPrivateHost, signal }` | Reads plus `prepareTransfer`, `prepareUnshield`, `close`, `closed`, `signal`, `provenance`      |
| `createRailgunKohakuPrivateAdapterBroadcaster` | A private adapter from this package copy  | `{ broadcast(operation) }`                                                                      |
| `createRailgunKohakuPublicAdapter`             | `{ host: RestrictedPublicHost, signal }`  | Reads plus `prepareShield`, `close`, `closed`, `signal`, `provenance`                           |
| `createRailgunKohakuPublicAdapterSubmitter`    | A public adapter from this package copy   | `{ submit(operation) }`                                                                         |

The module object is frozen and has exactly these five keys. Each factory throws a refusal error when its input is invalid: `RAILGUN_KOHAKU_SNAPSHOT_REFUSED`, `RAILGUN_KOHAKU_PRIVATE_ADAPTER_REFUSED` or `RAILGUN_KOHAKU_PUBLIC_ADAPTER_REFUSED`.

```js
const {
  createRailgunKohakuPublicAdapter,
  createRailgunKohakuPublicAdapterSubmitter,
} = require('@freedom/railgun-kohaku-adapter');

const adapter = createRailgunKohakuPublicAdapter({ host: myTrustedPublicHost, signal });
const operation = await adapter.prepareShield({ asset: { __type: 'native' }, amount: 10n ** 15n });
const acknowledged = await createRailgunKohakuPublicAdapterSubmitter(adapter).submit(operation);
```

## Restrictions

These are integration limits carried over from Freedom. They are not Railgun protocol limits.

- **Sepolia and direct submission only.** An acknowledged transaction result must carry `chainId: 11155111` and `broadcastSource: 'direct'`. The `direct` field does not establish that the transport bypassed Tor.
- **Amount ceilings.** A private input must satisfy `0 < amount <= 10^16` base units. A public Shield amount must satisfy `0 < amount <= 10^16` wei. These are checked on the requested amount. A host must also enforce its own ceiling on the entire selected input, for example when it withdraws only part of a larger note.
- **Assets and inputs.**
  - A private operation spends one ERC-20 note, chosen explicitly as `{ asset: { __type: 'erc20', contract }, amount, noteId: 'tree:position' }`.
  - Public Shield accepts only `{ __type: 'native' }`.
  - Multi-operation calls, automatic coin selection and `tailCalls` are not supported; unshield `options` must be omitted or `{}`.
  - A structurally valid ERC-20 input does not authorize spending it.
- **Recipients are checked for syntax only.**
  - The `prepareTransfer` recipient must be a `0zk` Railgun address. It is passed to the host unchanged, and the host alone decides whether it is the user's own or a foreign account.
  - The `prepareUnshield` recipient must be a non-zero `0x` 20-byte address.
  - The optional Shield `to` must be a `0zk` address.
- **Reads.**
  - `instanceId`, `balance` and `notes` accept at most 1000 asset filters (`native`, `erc20`, `erc721`) and at most 10,000 results.
  - Results are tagged `'unverified'` and returned as detached, mutable copies with `provenance: 'host-supplied'`.
  - A snapshot may contain ERC-1155 notes, but an unfiltered snapshot read refuses rather than relabel or silently omit them.
- **Sessions.** Reads are admitted only while a session is ready. A transaction adapter refuses preparation while reads are pending and allows one preparation attempt per session. A denied attempt closes the session; otherwise the session closes once the broadcast or submission settles.
- **One-use operation identity.**
  - A prepared operation is a frozen `{ __type: 'privateOperation' }` or `{ __type: 'publicOperation' }`. Its authority is its object identity in this package copy's registry, not its shape.
  - The broadcaster or submitter refuses copied, replayed, cross-kind and foreign-copy operations.
  - Each operation is consumed before the host is called.
- **Private results.** `broadcast` fulfils with the host's original object in one of three forms:
  - an acknowledged transaction (eight fields, `value: '0'`);
  - an uncertain submission `{ transactionHash, submissionStatus: 'unknown' }`;
  - `{ status: 'recovery-required', stage }`.

  If the host returns a malformed result that still contains exactly one canonical transaction hash, the adapter reports it as uncertain. Any other malformed result becomes `{ status: 'recovery-required', stage: 'adapter-contract' }`.

- **Public results.** `submit` fulfils with the host's original eight-field acknowledgement. Its `value` must equal the admitted gross amount. Host rejections pass through unchanged; a lost response, for example, keeps its transaction hash. A malformed post-admission result rejects with `RAILGUN_KOHAKU_PUBLIC_ADAPTER_CONTRACT` and `submissionMayHaveOccurred: true`. Rejection reasons from a foreign host are untrusted.
- **No result or error authorizes a retry.** Uncertain and recovery-required outcomes must be reconciled by the host's durable state.
- **Cancellation.**
  - `close()` revokes admission and calls the host's `close()`.
  - `closed` resolves only after the host's `closed` promise and all admitted work settle. It rejects on cleanup failure, or when a host promise cannot be observed.
  - Once a broadcast or submission has been handed to the host, the adapter adds no abort race that could hide the original outcome.
  - Private reads and preparation reject promptly on close. Public reads and preparation wait for the host, so the host must cancel them promptly itself.

### Native Promise contract

Host methods must return genuine, unmodified native Promises. Each must have `Promise.prototype` as its prototype, be no proxy, and have **no own properties**. Some environments decorate Promises with own properties, and the adapters refuse those Promises:

- On Node 22, any active `AsyncLocalStorage` decorates them. Jest is one example.
- On any Node version, an enabled `async_hooks` `init` hook decorates them.

On Node 24, `AsyncLocalStorage` no longer decorates Promises. The engines floor is therefore 24, but an application that enables `async_hooks` hooks can still trigger refusals.

## What a second application must implement or supply

Every host must be a plain object (`Object.prototype`) with **exactly** the listed own keys. Each key must be a data property, not a getter, and neither the host nor its methods may be proxies. The adapter captures the methods at construction, so replacing them later has no effect, and it calls them with the host as `this`. A host can be adopted by only one adapter per package copy. The authoritative shapes are in `types/` and in the sources under `src/`.

### Snapshot host (`createRailgunKohakuSnapshotPlugin`)

| Member              | Contract                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal`            | An `AbortSignal` that is not aborted at construction. Aborting it closes the plugin.                                                                                                                                                                                                                                          |
| `capture()`         | A synchronous, non-`async` function returning `{ snapshot: { instanceId, received }, assertCurrent }`. It is called on every read.                                                                                                                                                                                            |
| `snapshot.received` | Up to 10,000 notes in ascending `tree:position` order. Each note has an `id` of `"tree:position"`, `tree < 256` and `position < 65536`. Hashes and contracts are lowercase `0x` hex, `hash` is below the BN254 field and `amount` is below 2^120 as a `bigint`. `tag` is `'unverified'` and `spentTxid` is `false` or a hash. |
| `assertCurrent()`   | A synchronous function that returns exactly `undefined` while the captured snapshot is still current and throws once it is stale. It is called after each projection.                                                                                                                                                         |

### Private host (`createRailgunKohakuPrivateAdapter`)

| Member                                            | Contract                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal`                                          | An `AbortSignal` that is not aborted at construction. Aborting it closes the adapter.                                                                   |
| `closed`                                          | A native Promise that resolves with `undefined` once the host has drained. A rejection or any other value makes the adapter's `closed` reject.          |
| `instanceId()`                                    | Resolves to the account's `0zk` address.                                                                                                                |
| `balance(filter)` / `notes(filter, includeSpent)` | Receive frozen filter copies and resolve to balances or notes in the shapes above.                                                                      |
| `prepareTransfer(input, to)`                      | Receives a frozen copy of the input and the unchanged `0zk` recipient. Resolves to `{ handle }`, where `handle` is a fresh, frozen, empty plain object. |
| `prepareUnshield(input, to, options)`             | As `prepareTransfer`, but `to` is a `0x` address and `options` is `undefined` or a frozen `{}`.                                                         |
| `broadcast(handle)`                               | Submits the prepared operation and resolves to one of the three private result forms.                                                                   |
| `close()`                                         | A synchronous function that returns `undefined`, stops host work and lets `closed` settle.                                                              |

### Public host (`createRailgunKohakuPublicAdapter`)

| Member                                 | Contract                                                                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal`, `closed`, `close()`          | As for the private host.                                                                                                                                                                                                        |
| `instanceId()`, `balance()`, `notes()` | As for the private host.                                                                                                                                                                                                        |
| `prepareShield(input, to)`             | Receives a frozen `{ asset: { __type: 'native' }, amount }` and `to` (`undefined` or a `0zk` address). Resolves to `{ handle }` with a frozen, empty handle.                                                                    |
| `submit(handle)`                       | Resolves to the acknowledgement: `hash`, `nonce`, `from`, `to`, `value` (the decimal gross amount), `chainId`, `broadcastSource` and `explorerUrl` (`null` or an `https:` URL). A rejection carries the host's original reason. |

### Responsibilities the host owns

The adapters check shapes and lifecycles; they do not supply any of the following. A host that claims compatibility must provide each one itself:

- **Ownership:** which Railgun account and EOA belong to the user.
- **Keys and signing:** spending, viewing and EOA keys, plus the wallet vault.
- **Proofs and the engine:** the Railgun engine for scanning, Merkle trees and note decryption, and proof generation.
- **Asset and selected-input policy:** which assets and notes may be spent, and enforcement of ceilings on the whole selected input.
- **Recipient authorization:** whether a recipient may receive funds, including self or foreign `0zk` transfers and unshield addresses.
- **Disclosure review:** user consent before data is disclosed to services and before transactions are submitted.
- **Durable spending and recovery state:** submission journals, nullifier and spend tracking, and reconciliation of uncertain and recovery-required outcomes.
- **Storage, RPC and transport,** including any Tor routing.
- **Private Proof of Innocence (POI) services:** eligibility queries and submissions, and their approvals.
- **Prompt cancellation and closure:** honouring `signal` and `close()`, and settling `closed`.

### Non-goals

This package is deliberately narrow. It has:

- no engine, prover, storage, RPC, Tor, vault or UI;
- no generic Kohaku `Host` or `CreatePluginFn` compatibility;
- no multi-operation or `tailCalls` support;
- no chains other than Sepolia and no mainnet;
- no recovery companion.

Freedom's own fixed hosts, controllers and qualification fixtures stay in Freedom.

## Types

The declarations are verified with TypeScript 5.9.3 under strict NodeNext, for a CommonJS and an ESM consumer, without `skipLibCheck`, path mappings or ambient shims. See [Type checks](#type-checks).

- `require` and the top-level `types` field use `types/index.d.ts`, a CommonJS-format declaration.
- `import` uses `types/index.d.mts`, an ESM-format declaration. It forwards `index.d.ts` rather than copying it, so both conditions share one identity for each operation brand and adapter type. Like `index.mjs`, it has no default export.
- The declarations are self-contained and import nothing from `@kohaku-eth/plugins`. TypeScript consumers need no additional package, and this package declares no peer dependency on it.

The declarations no longer import Kohaku's types, because the published declarations of `@kohaku-eth/plugins@0.0.1-alpha.16` cannot be loaded under NodeNext without `skipLibCheck` or a path mapping:

- `dist/index.d.ts` re-exports `./base`, `./host`, `./errors` and `./shared` without file extensions in a `"type": "module"` package (TS2834, TS2835). Its root entry therefore exports nothing, so importing `PluginInstance` fails (TS2305).
- `dist/base.d.ts`, `dist/broadcaster/base.d.ts` and `dist/errors.d.ts` import `~/host` and `~/shared`, a tsconfig path alias that the build did not rewrite (TS2307, under Bundler resolution as well).
- The `./instance` export points to `dist/instance/base.*`, which the tarball does not contain. `main` names `dist/index.cjs`, which is also missing.

A separate upstream bridge check compiles the declarations against those published types instead. It establishes structural compatibility only:

- Each restricted object is assignable to its Kohaku `PluginInstance` specialization.
- `PrivateAdapterBroadcaster` is identical to Kohaku's `Broadcaster<PrivateOperation, PrivateSubmissionOutcome>`.

This is not generic Kohaku `Host` or `CreatePluginFn` compatibility.

The types cannot express the runtime contracts: native Promises, bounds, one-use identity and authority. The operation brands are phantom, type-only identities, and a host-shaped object proves nothing.

### Kohaku 0.0.1-alpha.16 compared with the pinned revision

The declarations were written against Kohaku revision `6fdc248b` (plugins manifest `0.0.1-alpha.11`). Its `packages/plugins/src` differs from the sources and declarations published in `0.0.1-alpha.16` as follows:

| Upstream item                                                                                                                                                                      | Change in alpha.16                                                                                         | Effect on this package                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TxFeatureMap.prepareUnshieldMulti`                                                                                                                                                | Gains `options?: UnshieldOptions`                                                                          | None. The adapters have no `Multi` method. The bridge asserts that Kohaku's view of each adapter enables only `prepareTransfer` and `prepareUnshield` (private) or `prepareShield` (public). |
| `host/index.ts`                                                                                                                                                                    | Adds `ExternalSyncClient` and `toExternalSyncClient`. `Host` is unchanged.                                 | None. `Host` appears only in a negative bridge program.                                                                                                                                      |
| `host/mnemonic-keystore.ts`                                                                                                                                                        | RAILGUN-path key derivation (alpha.15)                                                                     | None. Runtime code only, not referenced.                                                                                                                                                     |
| `PluginInstance`, `Transact`, `PICapabilities`, `PICapCfg`, `TxFeatures`, `AssetAmounts`, `UnshieldOptions`, `CreatePluginFn`, `Broadcaster`, `shared.ts`, `errors.ts`, `index.ts` | Unchanged                                                                                                  | None.                                                                                                                                                                                        |
| Dependencies                                                                                                                                                                       | `@kohaku-eth/provider` moves from workspace `0.1.0-alpha.8` to exactly `0.1.0-alpha.11`; `ox` is `^0.12.0` | None. `TxData`, the element type of the `tailCalls` result, keeps its shape `{ to: string; data: string; value: bigint }`. `ox` resolves to 0.12.4.                                          |

No unsupported functionality is broadened. The runtime sources are unchanged. The adapters still have no multi-operation methods and still refuse `tailCalls` and any other non-empty unshield options, non-ERC-20 private inputs and non-native Shield inputs. In the declarations, `PrivateUnshieldOptions` is still `{ tailCalls?: never }`. The negative bridge programs show that Kohaku's generic `Host`, generic `PluginInstance` views and `UnshieldOptions` are refused.

One limitation is unchanged from the pinned revision. In Kohaku's `PluginInstance` view, `prepareUnshield` accepts `options?: UnshieldOptions`, and method-parameter bivariance lets a private adapter be assigned to that view. Code holding the adapter through that view can therefore pass `tailCalls` without a compile error. The runtime refuses it.

## Tests

`npm test` runs Jest: 7 suites and 291 tests. The suites are:

- the five Freedom suites for the copied modules;
- the pinned contract-oracle suite;
- a package consumer check.

The consumer check starts a child Node process that loads the package through its own `exports` with both `require()` and `import()`. It asserts that both return the same five functions. It then prepares and submits a public operation across the two entrypoints and does the same for a private operation, using the in-memory test hosts. The test hosts are fixtures, not genuine accounts or authority. Their passing is not native, live-network or security-audit evidence.

### Type checks

TypeScript is not a dependency. `npm run typecheck` uses the compiler that the `TYPESCRIPT_PATH` environment variable names, either an installed `typescript` package directory or its `lib/typescript.js`, and fails if the variable is unset:

```sh
TYPESCRIPT_PATH=/path/to/node_modules/typescript npm run typecheck
```

The runner, `test/types/typecheck.cjs`, compiles programs and never emits or runs them. Every program must produce exactly the diagnostics that its `// expect TS<code>` markers name, and no others.

- **Portable checks** use `strict`, `noEmit`, `module` and `moduleResolution` `NodeNext`, `target` `ES2022`, `types: []`, and no `skipLibCheck` or `paths`. Programs must not load any file from `node_modules`.
  - A CommonJS (`.cts`) and an ESM (`.mts`) consumer import the package by its own name. They use all five factories with typed hosts and pass brands across the two conditions.
  - Six negative programs must fail:
    - a host without `broadcast` (TS2741);
    - snapshot callbacks that return a value or are `async` (TS2322);
    - an unnarrowed or misused private result (TS2339, TS2322);
    - cross-kind or forged operations and swapped adapters (TS2345);
    - `tailCalls`, a `0zk` unshield recipient and a native private input (TS2322, TS2345);
    - a default import from the ESM entry (TS1192).
  - Both entries must export the same 32 names, each with a single declaration identity.
- **Upstream bridge** compiles `test/types/upstream/` against the installed `@kohaku-eth/plugins@0.0.1-alpha.16`. It uses Bundler resolution and one `~/*` alias into that package's `dist/`. The runner checks that only files inside that `dist/` use the alias. One positive program covers the assignability, `Broadcaster` identity and enabled-feature assertions. Two negative programs cover Kohaku's generic `Host` (TS2739, TS2740), generic `PluginInstance` views and `UnshieldOptions` (TS2345).
- **Controls** compile the bridge's positive program without that setup, under NodeNext and under Bundler without the alias. Both must fail inside the upstream files with the diagnostics recorded in the runner.

`test/types/typecheck-record.json` holds the last recorded run: TypeScript 5.9.3 on Node 24.18.1, `lib/typescript.js` SHA-256 `3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675`. It also holds the options, resolutions, export parity, upstream declaration hashes, alias uses and each case's diagnostics. Regenerate it with `npm run typecheck -- --record test/types/typecheck-record.json`.
