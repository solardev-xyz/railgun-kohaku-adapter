# Context, session and storage host contract

These are trusted main-process callbacks supplied to `/host/owner`, not methods
for a renderer or a remote caller. This document specifies the first host-contract
slice; RPC, transaction, process and journal contracts remain separate work.
Types describe calls, not authority. A structural imitation of a context or
credential receipt must never pass the adopting host's registry checks.

## Context and lifetime

`createPrivacyScope({profileId, signal, isCurrent?})` synchronously returns
`{signal, getContext(subject, requirements?), run(handle, task), close()}`. Its signal is owned by
the scope and aborts on parent cancellation, explicit close or failed currentness.
Close is idempotent and permanent. `getContext` and `getPrivacyContext` check
currentness on every call, including handles issued earlier. Currentness includes
the active profile, vault unlock epoch and application lifetime. A new unlock
must not revive old handles.

`isCurrent` predicates must be synchronous and side-effect free: no storage,
network, signing or other custody work. They may authenticate parent contexts.
The reference brackets an entire synchronous nested validation stack with its
physical profile-lock check at entry and exit; every logical predicate, signal
and lifetime check still runs. No result is reused across calls or awaits.
Vault key loans/publication and storage/transaction commit boundaries retain
independent currentness checks. This avoids millions of redundant filesystem
checks in deeply nested recovered-submission scopes without extending deadlines.

`run(handle, task)` requires a handle issued by that particular scope, admits at
most 32 outstanding tasks, and invokes the task after a microtask with the scope
signal. It rejects promptly on revocation while continuing to observe original
work, and checks ownership/currentness again before returning a result. A falsy
task rejection stays a rejection. This method does not authorize a later state
write. `railgun-session.js` and `railgun-session-worker.js` use it for broker RPC.

`getContext` returns an opaque frozen handle, authenticated by identity in the
host's realm-local registry. Repeating the normalized subject and requirements in
one scope returns the same handle. Separate scopes have distinct generations and
isolation tokens. The subject contains kind, principal, chainId, protocol,
deployment, role and operation; absent optional protocol/deployment/operation
normalize to null. Private accounts require protocol and deployment.
Input fields are optional strings, not explicit nulls; normalized output fields
are required nullable strings. All host families in one realm must share the
same registry instance. Workers and utilities each receive a separate instance.

`getPrivacyContext(handle, chainId?)` synchronously returns the frozen context:
profileId, generation, isolationToken, subject, requirements and signal. Unknown,
revoked or wrong-chain handles throw. No serialized object can recreate a handle.
The requirements default to `{origin:'tor', content:'public', correctness:'any',
maxAgeMs:null}`. A Tor requirement is a request and host attestation, not evidence
that the transport has implemented Tor or circuit isolation.

`sessions.openPrivacySession()` takes no arguments and synchronously returns the
active profile/unlock's parent scope. The owners use only its `signal` and
`getContext`; the host owns closing the parent. It must refuse a locked vault or
stopped application. The owners create and close narrower scopes themselves.

Host errors are part of this contract: `INVALID_PRIVACY_CONTEXT`,
`INVALID_PRIVACY_REQUIREMENTS`, `PRIVACY_CHAIN_MISMATCH`,
`PRIVACY_CONTEXT_LIMIT`, `PRIVACY_TASK_LIMIT`, `PRIVACY_CONTEXT_REVOKED`,
`PRIVACY_VAULT_LOCKED` and `PRIVACY_PROFILE_UNAVAILABLE`. The package preserves
or branches on some of these codes. The reference also permanently revokes a
scope if its currentness predicate throws, returning `PRIVACY_CONTEXT_REVOKED`.

Call sites: `railgun-identity.js` derives identity scopes from the parent and vault
signals; `railgun-account-enrollment.js` binds storage to them;
`railgun-transact-recovery.js`, `railgun-shield-recovery.js` and
`operational-submission-lane.js` open public-address recovery/journal contexts.
The utility and worker realms require their own registries; main handles are
never deserialized into authority there.

## Encrypted key/value persistence

`getPrivacyStoragePath(handle, directory)` synchronously returns an absolute
filename stable across process restarts for the same profile and normalized
subject. Generation and transient isolation tokens must not change this path.
Different profiles and subjects must not collide. Owners derive account paths
from its basename and perform direct filesystem checks; it is an actual local
path, not an arbitrary storage URI. The adopting application exclusively owns
the profile directory and prevents concurrent writers across processes.
Canonicalize the profile root once at startup; the reference refuses symlinked
ancestors, including the macOS `/tmp` and `/var` aliases.

`createPrivacyStorage({handle, directory, key, profileGuard})` is synchronous.
The key is a 32-byte Node Buffer. The factory copies it before returning: owners
wipe the caller's buffer immediately. The retained key is wiped when the context
is revoked. Allowed contexts are private-account/storage and the enrolled public
address's transaction-rpc storage scope. The profile guard is supplied by the
genuine credential loan; it is not caller-provided authorization.

The returned minimum interface is:

```ts
get(name: string): Promise<string | null>
update(name: string, change: (previous: string | null) => string): Promise<void>
```

Missing values return null. Authentication, malformed state, unavailable storage
or missing initialized inventory must fail, never appear as a new empty store.
Updates perform a serialized read/modify/commit across all adapters for a file.
The updater is synchronous, invoked at most once and cannot return a Promise.
Its original thrown error object must propagate unchanged; a throw does not
commit. Never retry the updater internally or undo a completed rename.
Currentness is checked at the commit boundary, including if the
updater revoked the context. Success means the encrypted replacement and required
durability barriers completed. A write failure after replacement must carry
`storageCommitted: true` as a host diagnostic. Owners do not read that field:
they already treat failure after updater admission as possibly committed.
Failure is not evidence that nothing was written.

Storage uses `PRIVATE_STORAGE_INVALID`, `PRIVATE_STORAGE_UNREADABLE`,
`PRIVATE_STORAGE_LIMIT` and `PRIVATE_STORAGE_WRITE_FAILED`. Incoming genuine
`PRIVATE_*` and `PRIVACY_*` guard/lifetime errors propagate unchanged, rather than
being disguised as authentication errors.

The profile guard has synchronous `assert(file)` and `remember(file)` methods.
Read-only owner paths substitute `assertRegistered` for both, so storage must
not assume `remember` grants new-file adoption. Call `assert` before reading or
writing and `remember` only after authenticating an existing file or committing
a new encrypted file. A missing registered file or invalid inventory refuses.
The guard's authenticated inventory is not rollback protection; owners maintain
their own floor and journal invariants. Symlink substitution, profile movement
and unregistered-file adoption need explicit refusal and recovery behavior.

Call sites: `railgun-account-enrollment.js` creates the manifest and loans derived
keys; `railgun-scan-journal.js`, `railgun-wallet-journal.js` and
`railgun-txid-journal.js` use synchronous update callbacks for lease/sequence
checks; `railgun-private-capsule-store.js` and `railgun-poi-intent-store.js` retain
operations and handle possibly committed writes. Package owners do not call a
storage `close()`; the context signal controls the storage lifetime.
Other factory callers are `railgun-private-reservations.js`,
`railgun-public-catalog.js`, `railgun-wallet-catalog.js` and
`railgun-relay-recovery-store.js`.

## Executable checks and limits

`tools/conformance/context.cjs` runs against the adopter's actual context registry.
It checks opaque handles, chain binding, independent scopes, cancellation and
permanent revocation. `tools/conformance/storage.cjs` uses real encrypted files
in a fresh disposable directory and checks key copying, authenticated reads,
revocation, reopening and serialized updates. Supply genuine host functions and
a profile guard; the checker does not mint a credential or open a user profile.
The harness leaves its disposable evidence files in place.

The generic storage checks use an explicitly mocked inventory guard. Separate
reference inventory tests use authenticated files, and `reference-custody.cjs`
exercises the actual reference vault, inventory, credential loans and encrypted
storage across fresh processes. These do not qualify simultaneous-process
exclusion, crash durability or a complete application. Account execution needs
the remaining host families and their native qualification.
