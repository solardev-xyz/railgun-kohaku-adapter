# Main host implementation inventory

This inventory follows actual owner calls, not the larger Freedom APIs. Together
with the [credential contract](CREDENTIAL-HOST-CONTRACT.md) and
[context/storage contract](HOST-CONTEXT-STORAGE.md), it describes the work needed
to implement the 20 families in `RailgunMainHost`. It is not a certification of
the new reference host. Opaque runtime tokens below require genuine local
registries; accepting a structurally similar object is not an implementation.

The composition must create each realm's context registry once and share it
between that realm's families. Initialization captures the original functions
and receivers. Do not substitute an operation's callbacks for those originals.
Utilities and storage workers initialize their own fixed contexts through the
public bootstraps, synchronously during entry evaluation.

## Files, credentials and processes

| Family and function | Owner-facing contract |
| --- | --- |
| context.getPrivacyContext, context.createPrivacyScope | See context/storage contract, including scope.run and revocation codes. |
| sessions.openPrivacySession | Synchronous current profile/unlock parent scope; see context/storage contract. |
| profiles.getActiveProfile | Synchronous `{id,userDataDir}`. Directory is absolute, canonical and exclusively owned. A changed identity revokes the old scopes. |
| storage.createPrivacyStorage, storage.getPrivacyStoragePath | See context/storage contract. |
| credentials.currentSession, credentials.withMaterial | Exact purpose-specific loans and root-drain rules in credential contract. |
| sourceIdentity.readDigest | Synchronous lowercase SHA-256 over the complete fixed host implementation inventory. Captured before owner algorithms load. Not a mutable version label or authentication against a malicious local user. |
| sourceIdentity.readCacheDigests (optional) | Synchronous exact `{public,wallet,txid}` lowercase SHA-256 record from the same immutable source snapshot as `readDigest`. Bind every host byte affecting cache interpretation or persistence. Omission uses the complete host digest for all three. This is trusted host bootstrap, never an account or operation override. |
| artifacts.createPrivacyArtifactLoader | Synchronous `{handle,directory,manifest}` → `{load(name):Promise<Uint8Array>}`. Manifest entries contain kind/name/size/sha256. Authenticate artifacts context, use fixed local names and bounded owned buffers, verify actual bytes and close original descriptors before settlement. No download fallback. The package verifies its pinned manifest again. |
| platform.applicationLifetime | Actual application's one-way shutdown AbortSignal. |
| platform.spawnUtility | `{entry:'railgun-utility-v1',heapMb}` → original Electron UtilityProcess. Fixed entry, environment cleanup and heap bound; `.once('spawn'/'exit'/'error')`, `.on('message')`, `.postMessage(wire,[port])` and genuine pid. No arbitrary code path. |
| platform.createUtilityChannel | Genuine MessageChannelMain ports. Owner consumes message `{data,ports}`, start/close/postMessage and close events. Node child-process IPC is not a substitute. |
| platform.memorySamples | Actual application metrics with pid and memory.workingSetSize in KiB. No fabricated zero metrics. |
| platform.terminateUtility | Exact retained child plus SIGTERM or SIGKILL. Check original live child/PID, never a caller-supplied PID. Termination request is not observed exit. |
| platform.spawnStorageWorker | Fixed worker entry, exact workerData/transferList from `OwnerStorageWorkerInput`. Transfer the owned 32-byte key buffer, do not clone a pooled backing store. Preserve Worker messages/error/exit and native termination. |

Call-site anchors: `railgun-process.js`, `railgun-session-worker.js`,
`railgun-artifacts.js`, `railgun-artifact-broker.js`, `source-identity.js`.
Process limits, deadlines, loan retention and unknown-exit handling remain in
the owner. Host platform functions must not simulate successful drainage.

## Public services and RPC

| Family and function | Owner-facing contract |
| --- | --- |
| settings.isWalletTorExperimentAvailable | Synchronous boolean host policy gate. Does not establish routing. |
| tor.getWalletSocksEndpoint | Current managed loopback `{host,port,signal}` endpoint object. Stable identity during one Tor lifetime; replacement/abort invalidates clients. |
| transport.createWalletTorTransport | Synchronous fresh transport `{request,release,close,closed}`; terminal closed is a non-rejecting Promise that resolves only after original request/connect/socket cleanup. |
| registry.getNetwork | For chain 11155111: a network with explicit access.readOrder and bounded quorum.timeoutMs. These are current source-selection policy inputs, not evidence of quorum verification. |
| registry.getEndpointSources | `(chainId,'rpc')` → source rows including keyed flag and coverage indexed by decimal chainId. Current owners require an unkeyed source. |
| registry.getEndpoints | `(chainId,'rpc')` → ordered URLs. Pin one eligible HTTPS endpoint; no hidden fallback or redirect. |
| rpc.createPrivateRpc | `(handle,role,{signal?,destinationConstraint?}?)` → client below. Role is protocol-rpc or transaction-rpc and must equal the context role. |
| rpc.getPrivateRpcDestination | `(client,handle)` → opaque same-client destination observation, after currentness checks and without I/O. |
| rpc.assertPrivateRpcDestination | `(client,handle,observation)` → the same observation or refusal; not a URL string comparison alone. |
| rpc.getPrivateRpcDestinationDetails | Genuine observation → frozen `{version:1,url,chainId,role,transport:'tor-experimental'}`. Explicit trusted-host disclosure; the token itself carries no serialized URL. |
| rpc.createPrivateRpcDestinationConstraint | `{observation,signal,deadline}` → `{constraint,signal,close}`. Monotonic deadline, same profile/stable subject/role/URL; operation may narrow the subject. Token cannot remove an existing restriction. |
| rpc.createPrivateRpcReadBudget | `{client,handle,destination,signal,deadline,envelope}` → `{budget,signal,closed,close}`. Binds the actual protocol client and approved request envelope; see below. |
| rpc.getPrivateRpcReadBudgetOutcome | Genuine budget → detached terminal/progress classification, pending count and admission counters. A closed budget remains readable as history. |

Transport `request(handle,url,options)` returns a native Promise of
`{status,body:Buffer,...}`. Owners use POST, a JSON content-type, a string body,
signal and timeoutMs; POI handoff additionally sets maxResponseBytes 2048 and
requireFramedResponse true. Do not decode, redirect, retry or interpret HTTP
responses as acceptance. No URL, request body or arbitrary server message in
errors. `release(handle)` retires that handle's pool; terminal close covers
already-retired pools too. SOCKS isolation credentials and remote DNS are host
responsibilities. These credentials do not authenticate the local proxy;
ownership of the managed process and endpoint needs separate qualification.
Circuit isolation requires separate measured evidence.

The RPC client exposes `signal`, `trust`, `privacy`, `assertActive()`, `ready()`,
`release()` and `request(method,params,validate,budget?,admission?)`. Readiness
checks the chain via eth_chainId. Request returns `{result,source,verified,trust,
privacy,observedAt}`; current direct RPC is unverified. A response must have a
matching JSON-RPC id and result without an error. Validate the admitted response
even if a local read budget has just been cancelled, so an integrity failure
cannot be disguised as harmless cancellation. Unbudgeted admission deadlines
are checked again after readiness, immediately before transport admission.

Read envelopes allow named canonical headers with bounded per-tag counts, one
address/range getLogs, and unique event headers inside that range (at most 512).
The hidden chain-id read counts too. Tokens cannot be used on another client.
Admission exhaustion, cancellation and expiry stop new work; `closed` waits for
admitted original work. Fatal transport, response/validator and real lifetime
failures remain sticky during drain. Outcomes distinguish active/draining/closed,
reason, fatal, failure, integrityFailure, pending and admissions. Deadline
comparisons use the monotonic clock. Exact caps are policy, not Railgun protocol
constants; changing them requires a reviewed compatible owner/host contract.

Call-site anchors: `railgun-scan-source.js`, `railgun-private-preflight.js`,
`railgun-shield-preflight.js`, `railgun-public-services.js`, `railgun-poi-source.js`,
`railgun-poi-root.js`, `railgun-poi-disclosure-plan.js`, `railgun-kohaku-plugin.js`.

## Signing, submission and reconciliation

| Family and function | Owner-facing contract |
| --- | --- |
| submitter.readMetadata | Synchronous `{index:0,type:'mnemonic',address}` for the enrolled EOA; `address` is canonical lowercase `0x` plus 40 hex digits, matching authenticated custody. No key is returned. Must remain bound to the current vault/profile. A checksummed signer address is not the metadata representation. |
| signers.getSigner | Index 0 → address/signTransaction signer, with no sendTransaction method. Currentness before and after awaited work; the signer never bypasses the owner's review or the durable broadcast journal. |
| transactionIntent.transactionIntent | `(kind,transaction)` → immutable normalized intent. Railgun transact and shield bindings use the public `/host/journal-data` helpers. Recompute from signed bytes at send admission. |
| transactionIntent.validIntent | Validate supported intent data; no signing authority follows. |
| transactionNetwork.getPrivateTransactionNetwork | `(handle,{destinationConstraint?}?)` → genuine pinned transaction network below. A failed constrained construction cannot reopen unconstrained. |
| transactionNetwork.getPrivateTransactionNetworkDestination | `(network,handle)` → genuine underlying RPC destination observation. |
| transactionNetwork.assertPrivateTransactionNetworkDestination | Same arguments plus observation; check exact retained network/client/handle and currentness. |
| submissionJournal.getPrivateSubmissionJournal | Genuine public-address transaction-rpc handle → encrypted EOA journal for this profile/address/chain. Explicit initialize is separate from ordinary reopening. |
| submissionJournal.readExistingPrivateSubmissionSnapshot | Handle → Promise of one authenticated detached `{records,archive}` snapshot. Existing-only: must not create/adopt inventory or initialize a journal. Recheck profile/vault/context after reading. |
| journalRetention.validArchive | `(archive,'public')` → validity of archived submission records. Do not silently ignore archived nonces, intents or resolutions. |
| transactions.signAndSendTransaction | `(transaction,signer,{privacyContext,intent,reviewExpiresAt,review})` → native submission Promise. Perform nonce/fee selection and exact review, then signing, then journal-before-send. No retry on uncertain delivery. |

Transaction networks expose `request(chain,method,params)`, `getFeeQuote(chain)`,
`assertSigner(address)`, `assertActive(chain?)`, `signal`, `initialize()`,
`selectNonce(pending)`, `assertCanSubmit()`, `listSubmissions()`,
`reconcileSubmission(hash)`, `resolveSubmission(hash,policy)` and
`broadcastRawTransaction(chain,signed,{expiresAt,intent})`. Bind owner address,
chain and destination throughout. Receipt/transaction reads are restricted to
journaled hashes. Nonces include the archive and unresolved operations block
new sends. Reconciliation is observation, not a resend or permission inferred
from an RPC response.

Before journal begin and transport admission the host must call the genuine
same-instance `/host/owner-authority` submission checks. Recovered private
submissions can carry a monotonic admission deadline. Resolution also requires
the corresponding genuine owner authorization/checks. `/host/journal-data`
normalizers validate shapes only; they cannot replace these registries.

The transaction review receives the fully populated transaction and from address.
Only explicit approval while its original deadline/lifetime remains current may
reach signing. A journal write failure may have committed; a send error may have
delivered. Preserve the transaction hash and unresolved state, never treat a
timeout as permission to create or send another transaction. Retain actual
original callback/transport settlement barriers.

Call-site anchors: `railgun-private-submission.js`, `railgun-private-operation.js`,
`railgun-shield-operation.js`, `railgun-transact-recovery.js`,
`railgun-shield-recovery.js`, `operational-submission-lane.js`,
`railgun-own-txid.js`, `railgun-shield-origin.js` and `railgun-own-operation.js`.
Journal record/observation/resolution schemas and the complete transaction
network conformance cases still need their dedicated implementation specification;
this table alone is not sufficient to qualify a replacement transaction host.
