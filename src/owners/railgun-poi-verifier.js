/** Fresh keyless POI verification with the same pinned cryptographic runtime.
 * A diagnostic only: checkpoint index/list metadata are hash-bound, not SNARK
 * signals. No ownership, current membership, root or disclosure authority.
 * The circuit transition check is a separate receipt: the retired key accepts
 * and the current key rejects the exact payload. It never confers validity.
 */
const assert = require('assert/strict');
const { createHash } = require('crypto');
const { createPrivacyScope, getPrivacyContext } = require('./context-bindings');
const path = require('path');
const { verifyRailgunProverRuntime } = require("../execution/railgun-prover-runtime.js");
const { startRailgunProcess } = require("./railgun-process.js");
const { normalizeRailgunPoiPayload } = require("../data/railgun-poi-payload.js");
const fail = () =>
  Object.assign(new Error('Railgun POI verification unavailable'), {
    code: 'RAILGUN_POI_VERIFICATION_REFUSED',
  });
const RETIRED = new WeakSet();
const RETIRED_VKEY_SHA256 = '2f4dcbf58d383204e09240863a6f6eff249071849e5161801ebfe83691037b23';
const shape = (value, keys) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
};
async function verify(
  { handle, proverArchive, artifactDirectory, payload, signal, timeoutMs = 30000 },
  transition = false
) {
  const parent = getPrivacyContext(handle);
  assert.ok(signal instanceof AbortSignal && !signal.aborted);
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 60000);
  assert.equal(parent.subject.kind, 'private-account');
  assert.equal(parent.subject.protocol, 'railgun');
  assert.equal(parent.subject.chainId, 11155111);
  assert.equal(parent.subject.deployment, 'sepolia');
  assert.equal(parent.subject.role, 'prover');
  assert.equal(parent.subject.operation, 'poi-verify');
  // Normalize synchronously before any await; caller mutation cannot replace it.
  const normalized = normalizeRailgunPoiPayload(payload);
  const payloadSha256 = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  assert.ok(typeof artifactDirectory === 'string' && path.isAbsolute(artifactDirectory));
  const input = JSON.stringify({
    proverArchive: verifyRailgunProverRuntime(proverArchive),
    artifactDirectory,
    payload: normalized,
    ...(transition ? { transition: true } : {}),
  });
  assert.ok(Buffer.byteLength(input) <= 32768);
  const digest = createHash('sha256').update(input).digest('hex');
  const scope = createPrivacyScope({
    profileId: parent.profileId,
    signal: AbortSignal.any([signal, parent.signal]),
    isCurrent: () => {
      getPrivacyContext(handle);
      return true;
    },
  });
  const started = performance.now(),
    deadline = started + timeoutMs;
  let task,
    result,
    closed = false;
  const active = () => {
    if (
      closed ||
      scope.signal.aborted ||
      performance.now() < started ||
      performance.now() >= deadline
    )
      throw fail();
    getPrivacyContext(handle);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    scope.close();
    task?.close();
  };
  scope.signal.addEventListener('abort', close, { once: true });
  const timer = setTimeout(close, timeoutMs);
  timer.unref?.();
  try {
    active();
    task = startRailgunProcess({
      handle: scope.getContext(parent.subject),
      executionJob: 'poi-verify',
      input,
      startupMs: Math.min(30000, timeoutMs),
      lifetimeMs: timeoutMs,
      broker: {
        signal: scope.signal,
        async dispatch(wire) {
          try {
            active();
            assert.equal(result, undefined);
            assert.ok(typeof wire === 'string' && Buffer.byteLength(wire) <= 16384);
            const message = JSON.parse(wire);
            shape(message, ['id', 'method', 'value']);
            assert.equal(message.id, 1);
            assert.equal(message.method, 'result');
            const value = message.value;
            shape(value, [
              'inputSha256',
              'payloadSha256',
              'proofVerified',
              'sourceAuthenticated',
              'membershipAuthenticated',
              'rootAccepted',
              'disclosureEnabled',
              'spendingEnabled',
              'guards',
              'proverSha256',
              ...(transition
                ? ['retiredVerified', 'currentRejected', 'retiredVkeySha256', 'currentVkeySha256']
                : []),
            ]);
            assert.equal(value.inputSha256, digest);
            assert.equal(value.payloadSha256, payloadSha256);
            assert.equal(value.proofVerified, !transition);
            if (transition) {
              assert.equal(value.retiredVerified, true);
              assert.equal(value.currentRejected, true);
              assert.equal(value.retiredVkeySha256, RETIRED_VKEY_SHA256);
              assert.equal(
                value.currentVkeySha256,
                require("../execution/railgun-artifacts.js").manifest.POI_3x3.find(
                  (entry) => entry.kind === 'vkey'
                ).sha256
              );
              assert.notEqual(value.currentVkeySha256, RETIRED_VKEY_SHA256);
            }
            for (const key of [
              'sourceAuthenticated',
              'membershipAuthenticated',
              'rootAccepted',
              'disclosureEnabled',
              'spendingEnabled',
            ])
              assert.equal(value[key], false);
            assert.equal(value.proverSha256, require("../execution/railgun-prover-manifest.json").sha256);
            shape(value.guards, ['attempts', 'canaries', 'hooks']);
            const { attempts, canaries, hooks } = value.guards;
            assert.equal(attempts, 0);
            assert.ok(Array.isArray(hooks) && hooks.length >= 1 && hooks.length <= 256);
            assert.ok(
              hooks.every((hook) => typeof hook === 'string' && /^[a-zA-Z0-9_.]{1,128}$/.test(hook))
            );
            assert.equal(new Set(hooks).size, hooks.length);
            assert.equal(canaries, hooks.length);
            result = Object.freeze({
              inputSha256: digest,
              payloadSha256,
              ...(transition
                ? {
                    circuit: Object.freeze({
                      from: value.retiredVkeySha256,
                      to: value.currentVkeySha256,
                    }),
                    retiredVerified: true,
                    currentRejected: true,
                  }
                : {}),
              proofVerified: !transition,
              independentlyVerified: !transition,
              sourceAuthenticated: false,
              membershipAuthenticated: false,
              rootAccepted: false,
              metadataAuthenticated: false,
              ownershipAuthenticated: false,
              disclosureEnabled: false,
              spendingEnabled: false,
            });
            return JSON.stringify({ id: 1, value: null });
          } catch (error) {
            // Refusal revokes this attempt before another message can be admitted.
            close();
            throw error;
          }
        },
      },
    });
    await task.ready;
    active();
    assert.ok(result);
    task.close();
    const exited = await task.closed;
    assert.equal(exited.code, 'RAILGUN_PROCESS_CLOSED');
    active();
    const completed = Object.freeze({ ...result, utilityExitObserved: true });
    if (transition) RETIRED.add(completed);
    return completed;
  } finally {
    clearTimeout(timer);
    close();
    if (task) await task.closed;
  }
}
exports.verifyRailgunPoiPayload = async (options) => {
  try {
    return await verify(options);
  } catch {
    throw fail();
  }
};
// Completed only when the retired key verified and the current key rejected.
exports.checkRailgunRetiredPoiCircuit = async (options) => {
  try {
    return await verify(options, true);
  } catch {
    throw fail();
  }
};
exports.assertRailgunRetiredPoiCircuit = (receipt, payloadSha256) => {
  try {
    assert.ok(RETIRED.has(receipt));
    assert.equal(receipt.payloadSha256, payloadSha256);
    assert.equal(receipt.retiredVerified, true);
    assert.equal(receipt.currentRejected, true);
    assert.equal(receipt.utilityExitObserved, true);
    return receipt.circuit;
  } catch {
    throw fail();
  }
};
