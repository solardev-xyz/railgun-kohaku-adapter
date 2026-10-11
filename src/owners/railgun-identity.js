/** Main-only, vault-bound Railgun identity. Raw spending material is transferred
 * once to a dedicated public-key derivation utility, never to a wallet scanner.
 * Signing is restricted to a dedicated utility and a one-use controller permit.
 * An issued identity expires with its vault/profile.
 */
const assert = require('assert/strict');
const { createPrivacyScope, getPrivacyContext } = require('./context-bindings');
const { credentials } = require('./host-bindings');
const { createRailgunCredentialLoan } = require('./credential-loan');
const { openPrivacySession } = require('./host-bindings').sessions;
const { verifyRailgunEngineRuntime } = require("../execution/railgun-engine-runtime.js");
const { startRailgunProcess } = require("./railgun-process.js");
const identities = new WeakMap(),
  owners = new Set(),
  signers = new WeakMap(),
  relaySigners = new WeakMap(),
  unobservedRelayWork = new Set(),
  unobservedPrivateWork = new Set(),
  unknownRelayFailures = new WeakSet(),
  signing = new WeakSet();
// Process-lifetime quarantine deliberately survives identity/vault replacement.
// The key is the same stable owner used for identity opening, not a caller ID.
// An admitted signer can outlive identity.close() or a replaced vault. This
// separate stable-owner latch gates only new identities, never its own current().
const pendingSigningOwners = new Set();
const quarantinedOwners = new Set(),
  ownerScopes = new Map(),
  ownerLoans = new Map();
function retainLoan(owner, key) {
  // A previously admitted derivation may finish after quarantine. Wipe before
  // any subsequent asynchronous reattestation or credential callback can run.
  if (quarantinedOwners.has(owner)) key.fill(0);
  if (!ownerLoans.has(owner)) ownerLoans.set(owner, new Set());
  ownerLoans.get(owner).add(key);
  return () => {
    key.fill(0);
    const loans = ownerLoans.get(owner);
    loans?.delete(key);
    if (loans?.size === 0) ownerLoans.delete(owner);
  };
}
/** Trusted hosts call only after an issued identity's child exit is unobserved.
 * No currency check: the original lifetime may already be revoked. There is no
 * reset or account-selector API; a fresh application process is required. */
function quarantineRailgunIdentityCredentials(identity) {
  const saved = identities.get(identity);
  if (!saved) throw fail();
  quarantinedOwners.add(saved.owner);
  for (const key of ownerLoans.get(saved.owner) || []) key.fill(0);
  // Closing one scope can synchronously remove it or trigger a reopen attempt.
  // Quarantine is installed first, and every current sibling is revoked.
  for (const scope of [...(ownerScopes.get(saved.owner) || [])]) scope.close();
}
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const fail = () =>
  Object.assign(new Error('Railgun identity unavailable'), { code: 'RAILGUN_IDENTITY_REFUSED' });
const field = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s) && BigInt('0x' + s) < FIELD;
function assertRailgunIdentity(identity, expectedHandle) {
  const saved = identities.get(identity);
  if (!saved || quarantinedOwners.has(saved.owner) || identity.signal.aborted) throw fail();
  const context = getPrivacyContext(saved.handle);
  if (expectedHandle !== undefined) {
    const expected = getPrivacyContext(expectedHandle);
    assert.equal(expected.profileId, context.profileId);
    for (const key of ['kind', 'principal', 'protocol', 'deployment', 'chainId'])
      assert.equal(expected.subject[key], context.subject[key]);
  }
  if (saved.vaultSignal !== credentials.currentSession()) throw fail();
  return identity.descriptor;
}
// A private owner alone creates these callbacks. ready is a loan, not closure:
// original host settlement stays held until the original utility/use is drained.
async function borrowCredential(saved, handle, purpose, signal, loans) {
  const loan = createRailgunCredentialLoan({
    handle, vaultSession: saved.vaultSignal, accountIndex: saved.accountIndex, purpose, signal,
  });
  const entry = { loan, wipe: undefined };
  loans.add(entry);
  const { bytes } = await loan.ready;
  entry.wipe = retainLoan(saved.owner, bytes);
  return bytes;
}
async function finishCredentialLoans(loans) {
  for (const entry of loans) entry.loan.release();
  const settled = await Promise.allSettled([...loans].map(async (entry) => {
    try { await entry.loan.closed; } finally { entry.wipe?.(); }
  }));
  const failed = settled.find((entry) => entry.status === 'rejected');
  if (failed) throw failed.reason;
}
async function withRailgunViewingCredential(identity, use) {
  assertRailgunIdentity(identity);
  assert.equal(typeof use, 'function');
  const saved = identities.get(identity), loans = new Set();
  let result, error, failed = false;
  try {
    let key;
    try { key = await borrowCredential(saved, saved.handle, 'viewing', identity.signal, loans); }
    catch (error) { assertRailgunIdentity(identity); throw error; }
    assertRailgunIdentity(identity);
    result = await use({ viewingKey: key, spendingPublicKey: identity.descriptor.spendingPublicKey });
    assertRailgunIdentity(identity);
  } catch (cause) { failed = true; error = cause; }
  try { await finishCredentialLoans(loans); } catch (cause) {
    if (!failed) { failed = true; error = cause; }
  }
  if (failed) throw error;
  assertRailgunIdentity(identity);
  return result;
}
async function openRailgunIdentity({ archive, accountIndex = 0 }) {
  assert.ok(Number.isInteger(accountIndex) && accountIndex >= 0 && accountIndex <= 65535);
  archive = verifyRailgunEngineRuntime(archive);
  const parent = openPrivacySession(),
    vaultSignal = credentials.currentSession();
  const subject = {
    kind: 'private-account',
    principal: `railgun:${accountIndex}`,
    protocol: 'railgun',
    deployment: 'sepolia',
    chainId: 11155111,
    role: 'keystore',
  };
  const parentHandle = parent.getContext(subject),
    context = getPrivacyContext(parentHandle);
  const owner = JSON.stringify([context.profileId, accountIndex]);
  if (quarantinedOwners.has(owner) || pendingSigningOwners.has(owner)) throw fail();
  assert.ok(!owners.has(owner));
  const scope = createPrivacyScope({
    profileId: context.profileId,
    signal: AbortSignal.any([parent.signal, vaultSignal]),
    isCurrent: () => {
      getPrivacyContext(parentHandle);
      return !quarantinedOwners.has(owner) && vaultSignal === credentials.currentSession();
    },
  });
  const handle = scope.getContext(subject);
  if (!ownerScopes.has(owner)) ownerScopes.set(owner, new Set());
  ownerScopes.get(owner).add(scope);
  scope.signal.addEventListener(
    'abort',
    () => {
      const scopes = ownerScopes.get(owner);
      scopes?.delete(scope);
      if (scopes?.size === 0) ownerScopes.delete(owner);
    },
    { once: true }
  );
  owners.add(owner);
  let task;
  const close = () => scope.close();
  const releaseOwner = () => {
    if (scope.signal.aborted && !task) owners.delete(owner);
  };
  scope.signal.addEventListener('abort', releaseOwner, { once: true });
  async function derive(purpose, spendingPublicKey) {
    let sequence = 0,
      result,
      guards;
    const loans = new Set();
    const operationHandle = scope.getContext({ ...subject, operation: purpose });
    task = startRailgunProcess({
      handle: operationHandle,
      executionJob: purpose,
      input: JSON.stringify({
        archive,
        purpose,
        ...(spendingPublicKey ? { spendingPublicKey } : {}),
      }),
      startupMs: 30000,
      lifetimeMs: 60000,
      heapMb: 128,
      rssMb: 512,
      broker: {
        signal: scope.signal,
        async dispatch(wire) {
          getPrivacyContext(handle);
          const message = JSON.parse(wire);
          assert.equal(message.id, ++sequence);
          if (message.id === 1) {
            assert.deepEqual(message, { id: 1, method: 'key', purpose });
            const bytes = await borrowCredential(
              { vaultSignal, accountIndex, owner }, operationHandle,
              purpose === 'spending-public' ? 'spending-public' : 'viewing', scope.signal, loans
            );
            try {
              getPrivacyContext(handle);
              // Ownership passes to the supervisor, which wipes even a late
              // reply after closure. The key is never hex/JSON serialized here.
              return bytes;
            } catch (error) {
              bytes.fill(0);
              throw error;
            }
          }
          assert.equal(message.id, 2);
          assert.deepEqual(Object.keys(message).sort(), ['guards', 'id', 'method', 'value']);
          assert.equal(message.method, 'result');
          result = message.value;
          guards = message.guards;
          return JSON.stringify({ id: 2, value: null });
        },
      },
    });
    try {
      await task.ready;
      task.close();
      const closed = await task.closed;
      assert.equal(closed.code, 'RAILGUN_PROCESS_CLOSED');
      getPrivacyContext(handle);
      assert.equal(sequence, 2);
      assert.equal(guards?.attempts, 0);
      assert.ok(Array.isArray(guards.hooks) && guards.hooks.length > 0);
      assert.equal(new Set(guards.hooks).size, guards.hooks.length);
      assert.equal(guards.canaries, guards.hooks.length);
      await finishCredentialLoans(loans);
      getPrivacyContext(handle);
      return result;
    } finally {
      task.close();
      await task.closed;
      try { await finishCredentialLoans(loans); } finally {
        task = null;
        releaseOwner();
      }
    }
  }
  try {
    const spending = await derive('spending-public');
    assert.deepEqual(Object.keys(spending), ['spendingPublicKey']);
    assert.ok(
      Array.isArray(spending.spendingPublicKey) &&
        spending.spendingPublicKey.length === 2 &&
        spending.spendingPublicKey.every(field)
    );
    const result = await derive('viewing-identity', spending.spendingPublicKey);
    assert.deepEqual(Object.keys(result).sort(), [
      'instanceId',
      'masterPublicKey',
      'spendingPublicKey',
      'viewingPublicKey',
      'walletId',
    ]);
    assert.deepEqual(result.spendingPublicKey, spending.spendingPublicKey);
    assert.ok(field(result.masterPublicKey));
    for (const k of ['walletId', 'viewingPublicKey']) assert.match(result[k], /^[0-9a-f]{64}$/);
    assert.match(result.instanceId, /^0zk1[023456789acdefghjklmnpqrstuvwxyz]{123}$/);
    const descriptor = Object.freeze({
      ...result,
      spendingPublicKey: Object.freeze([...result.spendingPublicKey]),
      accountIndex,
    });
    const identity = Object.freeze({ descriptor, signal: scope.signal, close });
    identities.set(identity, { handle, vaultSignal, accountIndex, owner });
    assertRailgunIdentity(identity);
    return identity;
  } catch {
    close();
    throw fail();
  }
}
// No callback receives raw key bytes. The controller must issue an exact,
// one-use permit only after B validates its request and durable signing exists.
async function signPrivateIntent({
  identity,
  archive,
  transaction,
  expected,
  expectedHash,
  signal,
  onKeyRequest,
  timeoutMs = 60000,
}) {
  assertRailgunIdentity(identity);
  assert.ok(signal instanceof AbortSignal && !signal.aborted);
  assert.equal(typeof onKeyRequest, 'function');
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60000);
  assert.ok(!signing.has(identity));
  const payload = Object.freeze({
    archive: verifyRailgunEngineRuntime(archive),
    spendingPublicKey: Object.freeze(identity.descriptor.spendingPublicKey.map((v) => '0x' + v)),
    transaction: Object.freeze({ ...transaction }),
    expected: Object.freeze({ ...expected }),
    expectedHash,
  });
  assert.ok(
    ['railgun-private-transfer', 'railgun-token-unshield', 'railgun-partial-unshield'].includes(
      payload.expected.kind
    )
  );
  require("../data/railgun-retained-private-data.js").validateRailgunPrivateSigningIntent(
    payload.transaction,
    payload.expected
  );
  const saved = identities.get(identity),
    context = getPrivacyContext(saved.handle),
    scope = createPrivacyScope({
      profileId: context.profileId,
      signal: AbortSignal.any([identity.signal, signal]),
      isCurrent: () => {
        assertRailgunIdentity(identity);
        return true;
      },
    });
  let handle;
  try {
    handle = scope.getContext({ ...context.subject, operation: 'spending-sign' });
  } catch (error) {
    scope.close();
    throw error;
  }
  const token = Object.freeze({});
  let task,
    taskClosed,
    closureUnknown = false,
    outcomeFailed = false,
    outcomeError,
    sequence = 0,
    value;
  const current = () => {
    assertRailgunIdentity(identity);
    assert.ok(!scope.signal.aborted && task && !task.signal.aborted);
    getPrivacyContext(handle);
  };
  const requests = new Set(),
    loans = new Set();
  async function dispatch(wire) {
    current();
    assert.equal(typeof wire, 'string');
    assert.ok(Buffer.byteLength(wire) <= 16384);
    const message = JSON.parse(wire);
    assert.equal(message.id, ++sequence);
    const results = require("../data/railgun-retained-private-data.js");
    if (sequence === 1) {
      const request = results.normalizeRailgunSpendKeyRequest(message, payload);
      const permit = await onKeyRequest(request, token);
      current();
      const gate = require("./railgun-private-operation.js").consumeRailgunPrivateSigningPermit(
        permit,
        identity,
        token
      );
      await gate.assertCurrent();
      current();
      const bytes = await borrowCredential(saved, handle, 'spending-sign', scope.signal, loans);
      const wipe = () => bytes.fill(0);
      scope.signal.addEventListener('abort', wipe, { once: true });
      try {
        current();
        await gate.assertCurrent();
        current();
        // Ownership passes directly to the supervisor, which always wipes
        // after its binary reply (including closure during this dispatch).
        return bytes;
      } catch (error) {
        wipe();
        throw error;
      } finally {
        scope.signal.removeEventListener('abort', wipe);
      }
    }
    assert.equal(sequence, 2);
    assert.deepEqual(Object.keys(message).sort(), ['id', 'method', 'value']);
    assert.equal(message.method, 'result');
    value = results.normalizeRailgunSpendSignature(message.value, payload);
    return JSON.stringify({ id: 2, value: null });
  }
  assert.ok(!pendingSigningOwners.has(saved.owner));
  pendingSigningOwners.add(saved.owner);
  signing.add(identity);
  signers.set(token, { identity, payload, current, signal: scope.signal });
  try {
    task = startRailgunProcess({
      handle,
      executionJob: 'spending-sign',
      input: JSON.stringify(payload),
      startupMs: Math.min(30000, timeoutMs),
      lifetimeMs: timeoutMs,
      heapMb: 128,
      rssMb: 512,
      broker: {
        signal: scope.signal,
        dispatch(wire) {
          const pending = dispatch(wire);
          requests.add(pending);
          pending.then(
            () => requests.delete(pending),
            () => requests.delete(pending)
          );
          return pending;
        },
      },
    });
    const originalClosed = task.closed;
    const unknown = () => {
      closureUnknown = true;
      unobservedPrivateWork.add(originalClosed);
      // Stable account quarantine survives closing/replacing this identity and
      // vault session. Wiped bytes alone are not proof that the child exited.
      try { quarantineRailgunIdentityCredentials(identity); } catch { /* Marker is installed first. */ }
    };
    taskClosed = new Promise((resolve, reject) => {
      try {
        assert.ok(require('util').types.isPromise(originalClosed));
        Promise.prototype.then.call(originalClosed, resolve, (error) => {
          unknown();
          reject(error);
        });
      } catch (error) { unknown(); reject(error); }
    });
    taskClosed.catch(() => {});
    await task.ready;
    current();
    assert.ok(value && sequence === 2);
    task.close();
    assert.equal((await taskClosed).code, 'RAILGUN_PROCESS_CLOSED');
    await Promise.allSettled([...requests]);
    await finishCredentialLoans(loans);
    assertRailgunIdentity(identity);
    assert.ok(!scope.signal.aborted);
  } catch {
    outcomeFailed = true;
    outcomeError = Object.assign(new Error('Railgun private signing unavailable'), {
      code: 'RAILGUN_PRIVATE_SIGNING_REFUSED',
    });
  } finally {
    signers.delete(token);
    let cleanupError;
    const cleanup = (run) => { try { run(); } catch (error) { cleanupError ||= error; } };
    cleanup(() => scope.close());
    cleanup(() => task?.close());
    if (taskClosed) {
      try { await taskClosed; } catch (error) { cleanupError ||= error; }
    }
    if (task && !taskClosed) {
      closureUnknown = true;
      try { quarantineRailgunIdentityCredentials(identity); } catch { /* Marker first. */ }
    }
    // Retain exclusion through all admitted original callbacks even if a close
    // throws. Unknown child settlement retains the original host loan as well.
    await Promise.allSettled([...requests]);
    if (!closureUnknown) {
      try { await finishCredentialLoans(loans); } catch (error) { cleanupError ||= error; }
      signing.delete(identity);
      pendingSigningOwners.delete(saved.owner);
    }
    if (cleanupError && !outcomeFailed) { outcomeFailed = true; outcomeError = cleanupError; }
  }
  if (outcomeFailed) throw outcomeError;
  return value;
}
async function signRailgunPrivateIntent(options) {
  try {
    return await signPrivateIntent(options);
  } catch {
    throw Object.assign(new Error('Railgun private signing unavailable'), {
      code: 'RAILGUN_PRIVATE_SIGNING_REFUSED',
    });
  }
}
function assertRailgunPrivateSigner(token, identity, { transaction, expected, expectedHash }) {
  const value = signers.get(token);
  assert.ok(value && value.identity === identity);
  value.current();
  assert.deepEqual(value.payload.transaction, transaction);
  assert.deepEqual(value.payload.expected, expected);
  assert.equal(value.payload.expectedHash, expectedHash);
  return value.signal;
}
// Relay signing has a separate permit/token domain but shares identity signing
// exclusion. The fixed controller consumer is intentionally absent until the
// connected durable operation exists; a missing consumer fails before a loan.
async function signRelayIntent({
  identity,
  archive,
  intent,
  recordDigest,
  signal,
  onKeyRequest,
  timeoutMs = 60000,
}) {
  assertRailgunIdentity(identity);
  assert.ok(signal instanceof AbortSignal && !signal.aborted);
  assert.equal(typeof onKeyRequest, 'function');
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60000);
  assert.ok(!signing.has(identity));
  assert.match(recordDigest, /^[0-9a-f]{64}$/);
  const checked = require("../execution/railgun-relay-intent.js").normalizeRailgunRelayUnsignedIntent(intent);
  const payload = Object.freeze({
    archive: verifyRailgunEngineRuntime(archive),
    intent: checked.data,
    recordDigest,
    spendingPublicKey: Object.freeze(identity.descriptor.spendingPublicKey.map((v) => '0x' + v)),
  });
  const saved = identities.get(identity),
    context = getPrivacyContext(saved.handle),
    revocation = new AbortController(),
    scope = createPrivacyScope({
      profileId: context.profileId,
      signal: AbortSignal.any([identity.signal, signal, revocation.signal]),
      isCurrent: () => {
        assertRailgunIdentity(identity);
        return true;
      },
    });
  let handle;
  try {
    handle = scope.getContext({ ...context.subject, operation: 'relay-sign' });
  } catch (error) {
    scope.close();
    throw error;
  }
  const token = Object.freeze({});
  let task,
    sequence = 0,
    value,
    taskClosed,
    outcomeError,
    outcomeFailed = false,
    closureError,
    issued = false,
    brokerFailed = false,
    cleanupFailed = false,
    unobserved = false;
  const current = () => {
    assertRailgunIdentity(identity);
    assert.ok(!brokerFailed && !scope.signal.aborted && task && !task.signal.aborted);
    getPrivacyContext(handle);
  };
  const state = { identity, payload, current, signal: scope.signal, issuing: false },
    requests = new Set(),
    loans = new Set(),
    originals = new Set();
  function observe(original, closure = false) {
    const unknown = () => {
      unobserved = true;
      unobservedRelayWork.add(original);
      quarantineRailgunIdentityCredentials(identity);
    };
    if (!require('util').types.isPromise(original)) {
      if (closure) unknown();
      throw fail();
    }
    const observed = new Promise((resolve, reject) => {
      try {
        Promise.prototype.then.call(original, resolve, (error) => {
          if (closure) unknown();
          reject(error);
        });
      } catch (error) {
        unknown();
        reject(error);
      }
    });
    originals.add(observed);
    observed.then(
      () => originals.delete(observed),
      () => originals.delete(observed)
    );
    return observed;
  }
  function refuseBroker() {
    brokerFailed = true;
    revocation.abort();
  }
  function cleanup(callback) {
    try {
      callback();
    } catch {
      cleanupFailed = true;
    }
  }
  async function dispatch(wire) {
    try {
      current();
      assert.equal(typeof wire, 'string');
      assert.ok(Buffer.byteLength(wire) <= 16384);
      const message = JSON.parse(wire);
      assert.equal(message.id, ++sequence);
      const { shape } = require("../execution/railgun-relay-quote-data.js");
      if (sequence === 1) {
        shape(message, ['id', 'method', 'purpose', 'recordDigest', 'intentDigest', 'expectedHash']);
        assert.equal(message.method, 'key');
        assert.equal(message.purpose, 'relay-sign');
        assert.equal(message.recordDigest, recordDigest);
        assert.equal(message.intentDigest, checked.digest);
        assert.equal(message.expectedHash, checked.data.expectedHash);
        const request = Object.freeze({
          recordDigest,
          intentDigest: checked.digest,
          expectedHash: checked.data.expectedHash,
        });
        const permit = await observe(onKeyRequest(request, token));
        current();
        const gate = require("./railgun-relay-operation.js").consumeRailgunRelaySigningPermit(
          permit,
          identity,
          token
        );
        shape(gate, ['assertCurrent', 'issued']);
        assert.equal(typeof gate.assertCurrent, 'function');
        assert.equal(typeof gate.issued, 'function');
        current();
        await observe(gate.assertCurrent());
        current();
        const bytes = await observe(
          borrowCredential(saved, handle, 'spending-sign', scope.signal, loans)
        );
        const wipe = () => bytes.fill(0);
        scope.signal.addEventListener('abort', wipe, { once: true });
        try {
          current();
          await observe(gate.assertCurrent());
          current();
          // Only this synchronous extent can mark account-window credential
          // issuance. No await or caller-settable flag bridges it to the reply.
          state.issuing = true;
          try {
            const returned = gate.issued();
            // A malformed async hook still owns its original work; observe it
            // before refusal, never await it on the credential-return path.
            if (require('util').types.isPromise(returned)) observe(returned);
            assert.equal(returned, undefined);
          } finally {
            state.issuing = false;
          }
          current();
          issued = true;
          return bytes;
        } catch (error) {
          wipe();
          throw error;
        } finally {
          scope.signal.removeEventListener('abort', wipe);
        }
      }
      assert.equal(sequence, 2);
      assert.equal(issued, true);
      shape(message, ['id', 'method', 'value']);
      assert.equal(message.method, 'result');
      const result = message.value;
      shape(result, [
        'signature',
        'message',
        'recordDigest',
        'intentDigest',
        'guards',
        'inventory',
      ]);
      assert.equal(result.message, checked.data.expectedHash);
      assert.equal(result.recordDigest, recordDigest);
      assert.equal(result.intentDigest, checked.digest);
      assert.equal(result.inventory, require("../execution/railgun-engine-manifest.json").inventory.sha256);
      shape(result.guards, ['attempts', 'canaries', 'hooks']);
      assert.equal(result.guards.attempts, 0);
      assert.ok(
        Array.isArray(result.guards.hooks) &&
          result.guards.hooks.length > 0 &&
          result.guards.hooks.length <= 256 &&
          result.guards.hooks.every(
            (hook) => typeof hook === 'string' && /^[a-zA-Z0-9_.]{1,128}$/.test(hook)
          )
      );
      assert.equal(new Set(result.guards.hooks).size, result.guards.hooks.length);
      assert.equal(result.guards.canaries, result.guards.hooks.length);
      value = Object.freeze({
        signature: require("../data/railgun-private-signature.js").normalizeRailgunSignature(
          result.signature
        ),
        message: result.message,
        recordDigest,
        intentDigest: checked.digest,
      });
      return JSON.stringify({ id: 2, value: null });
    } catch (error) {
      refuseBroker();
      throw error;
    }
  }
  assert.ok(!pendingSigningOwners.has(saved.owner));
  pendingSigningOwners.add(saved.owner);
  signing.add(identity);
  relaySigners.set(token, state);
  try {
    task = startRailgunProcess({
      handle,
      executionJob: 'relay-sign',
      input: JSON.stringify(payload),
      startupMs: Math.min(30000, timeoutMs),
      lifetimeMs: timeoutMs,
      heapMb: 128,
      rssMb: 512,
      broker: {
        signal: scope.signal,
        dispatch(wire) {
          const pending = dispatch(wire);
          requests.add(pending);
          pending.then(
            () => requests.delete(pending),
            () => requests.delete(pending)
          );
          return pending;
        },
      },
    });
    taskClosed = observe(task.closed, true);
    await observe(task.ready);
    current();
    assert.ok(value && sequence === 2 && issued && !brokerFailed);
    task.close();
    assert.equal((await taskClosed).code, 'RAILGUN_PROCESS_CLOSED');
    await Promise.allSettled([...requests, ...originals]);
    await finishCredentialLoans(loans);
    assertRailgunIdentity(identity);
    assert.ok(!scope.signal.aborted);
  } catch (error) {
    outcomeFailed = true;
    outcomeError = error;
  } finally {
    relaySigners.delete(token);
    cleanup(() => revocation.abort());
    cleanup(() => scope.close());
    cleanup(() => task?.close());
    if (taskClosed) {
      try {
        await taskClosed;
      } catch (error) {
        closureError = error;
      }
    }
    if (task && !taskClosed) {
      unobserved = true;
      try { quarantineRailgunIdentityCredentials(identity); } catch { /* Marker first. */ }
    }
    // Ordinary rejected callback work is settled; an unobservable original or
    // rejected child closure quarantines this owner instead of claiming drain.
    await Promise.allSettled([...requests, ...originals]);
    // Unknown child/work retains the host callback, not only a wiped byte view.
    if (!unobserved) {
      try { await finishCredentialLoans(loans); } catch (error) {
        if (!outcomeFailed) { outcomeFailed = true; outcomeError = error; }
      }
    }
    if (!unobserved) {
      signing.delete(identity);
      pendingSigningOwners.delete(saved.owner);
    }
  }
  if (unobserved) {
    const error = Object.assign(new Error('Railgun relay signer exit unavailable'), {
      code: 'RAILGUN_WALLET_EXIT_UNOBSERVED',
    });
    unknownRelayFailures.add(error);
    throw error;
  }
  if (closureError) throw closureError;
  if (brokerFailed || cleanupFailed) throw fail();
  if (outcomeFailed) throw outcomeError;
  return value;
}
async function signRailgunRelayIntent(options) {
  try {
    return await signRelayIntent(options);
  } catch (error) {
    if (unknownRelayFailures.delete(error)) throw error;
    throw Object.assign(new Error('Railgun relay signing unavailable'), {
      code: 'RAILGUN_RELAY_SIGNING_REFUSED',
    });
  }
}
function assertRailgunRelaySigner(token, identity, { intent, recordDigest }) {
  const value = relaySigners.get(token);
  assert.ok(value && value.identity === identity);
  value.current();
  assert.equal(value.payload.recordDigest, recordDigest);
  const checked = require("../execution/railgun-relay-intent.js").normalizeRailgunRelayUnsignedIntent(intent);
  assert.deepEqual(value.payload.intent, checked.data);
  return value.signal;
}
function assertRailgunRelayCredentialIssuance(token, identity, options) {
  const signal = assertRailgunRelaySigner(token, identity, options);
  assert.equal(relaySigners.get(token).issuing, true);
  return signal;
}
module.exports = {
  openRailgunIdentity,
  assertRailgunIdentity,
  quarantineRailgunIdentityCredentials,
  withRailgunViewingCredential,
  signRailgunPrivateIntent,
  assertRailgunPrivateSigner,
  signRailgunRelayIntent,
  assertRailgunRelaySigner,
  assertRailgunRelayCredentialIssuance,
};
