# Operational facade declarations

Basis: private facade `6dc377144339122a9b7e38dd30642575e52fca05`. This commit supplies declarations and compile-only consumer checks. It does not change the package manifest, exports, runtime entries, version, installed files or native activation. The parent owns those changes separately.

`host-owner.d.ts` declares only `initializeRailgunMain` as a runtime export. Its ESM declaration forwards that same declaration so both conditions share the nominal preparation-token identities. The fixed worker entry declares the existing no-argument `installRailgunStorageWorkerBootstrap()`, whose sole returned method initializes the worker-local context and then the fixed storage protocol. It does not accept a path, job, key, main binding or caller module selector.

The main table names exactly all 20 captured host families and their methods, including once-only `sourceIdentity.readDigest`. Platform inputs, scoped credential loans and context/artifact contracts are structural descriptions, not genuine-context or key-eligibility proofs. The remaining registry-specific host functions are deliberately opaque original function references (`CapturedHostOriginal`), accepted only as initial host bindings; their impossible call parameter makes them unavailable as an invocation API through these declarations. This preserves actual host implementations without claiming their opaque return objects are portable authority. No facade result returns those functions or host tables. Runtime admission continues to require all exact own-data property sets and original same-realm identities; TypeScript cannot establish those facts.

The runtime's different review signatures are retained: plugin preparation and transaction reviews and fresh relay/TXID reviews receive `{signal}`; private-recovery disclosure receives the original signal itself; private-recovery transaction review receives only the transaction summary. Every callback must settle upon cancellation. Native promises are required by strict consent gates; unknown thenables or reserved unknown-exit errors can quarantine an account until restart. Preparation tokens have type-only nominal brands; their runtime representation remains an empty frozen object owned by the originating lane's private WeakMap. No key, store, proof, receipt, owner or module getter is exported.

One runtime correction is pre-admission recovery gas validation, matching the existing private/public lane and recovery companion bounds. Invalid budgets now refuse before `run`, do not create a companion, and leave the session available; the companion's independent validation remains. TXID cleanup now runs after a captured operation outcome instead of throwing inside finally; the original drain still settles before publication, and a cleanup rejection still overrides either a successful result or an earlier operation failure. Held-drain tests distinguish both cases.

Compile with cached TypeScript and the actual reviewed parent manifest (until that manifest is merged):

```
TYPESCRIPT_PATH=/absolute/cached/typescript OWNER_PACKAGE_MANIFEST=/absolute/reviewed/package.json node test/types/owner-typecheck.cjs
```

The checker writes a disposable declaration-only consumer directory, performs strict NodeNext compilation with `skipLibCheck:false` and no ambient packages, checks exact host method-table parity with source, and runs negative controls by removing every diagnostic expectation. It never executes package runtime or installs dependencies. An activation manifest is required rather than fabricated dynamically by the checker.
