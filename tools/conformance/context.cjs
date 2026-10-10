"use strict";
const assert = require("node:assert/strict");

/** Black-box checks use the adopting host's real registry. No account, key,
 * filesystem or network access. Does not qualify transport isolation. */
function checkContextHost(host) {
  const subject = Object.freeze({
    kind: "private-account",
    principal: "railgun:0",
    chainId: 11155111,
    protocol: "railgun",
    deployment: "sepolia",
    role: "storage",
    operation: "conformance",
  });
  const parent = new AbortController();
  let current = true;
  const scope = host.createPrivacyScope({
    profileId: "public-conformance-profile",
    signal: parent.signal,
    isCurrent: () => current,
  });
  const other = host.createPrivacyScope({
    profileId: "public-conformance-profile",
    signal: parent.signal,
  });
  try {
    assert.throws(() => host.getPrivacyContext(Object.freeze({})), {
      code: "INVALID_PRIVACY_CONTEXT",
    });
    const handle = scope.getContext(subject);
    assert.equal(Object.isFrozen(handle), true);
    assert.deepEqual(Reflect.ownKeys(handle), []);
    assert.equal(scope.getContext({ ...subject }), handle);
    const context = host.getPrivacyContext(handle, 11155111);
    assert.equal(Object.isFrozen(context), true);
    assert.equal(Object.isFrozen(context.subject), true);
    assert.equal(Object.isFrozen(context.requirements), true);
    assert.deepEqual(context.subject, subject);
    assert.equal(context.profileId, "public-conformance-profile");
    assert.equal(context.signal, scope.signal);
    assert.equal(context.signal.aborted, false);
    assert.deepEqual(context.requirements, {
      origin: "tor",
      content: "public",
      correctness: "any",
      maxAgeMs: null,
    });
    assert.throws(() => host.getPrivacyContext(handle, 1), {
      code: "PRIVACY_CHAIN_MISMATCH",
    });
    assert.throws(() =>
      host.getPrivacyContext(JSON.parse(JSON.stringify(handle))),
    );
    const otherContext = host.getPrivacyContext(other.getContext(subject));
    assert.notEqual(otherContext.generation, context.generation);
    assert.notEqual(otherContext.isolationToken, context.isolationToken);
    const distinct = host.getPrivacyContext(
      scope.getContext({ ...subject, operation: "another" }),
    );
    assert.notEqual(distinct.isolationToken, context.isolationToken);
    current = false;
    assert.throws(() => host.getPrivacyContext(handle), {
      code: "PRIVACY_CONTEXT_REVOKED",
    });
    assert.equal(scope.signal.aborted, true);
    current = true;
    assert.throws(
      () => scope.getContext(subject),
      "revocation cannot be reversed",
    );
    assert.equal(other.signal.aborted, false);
    parent.abort();
    assert.equal(other.signal.aborted, true);
    assert.throws(() => other.getContext(subject));
  } finally {
    scope.close();
    other.close();
  }
  const active = new AbortController();
  const closed = host.createPrivacyScope({
    profileId: "public-conformance-profile",
    signal: active.signal,
  });
  const handle = closed.getContext(subject);
  closed.close();
  closed.close();
  assert.throws(() => host.getPrivacyContext(handle));
  const revoked = host.createPrivacyScope({
    profileId: "public-conformance-profile",
    signal: parent.signal,
  });
  try {
    assert.throws(() => revoked.getContext(subject));
  } finally {
    revoked.close();
  }
  return Object.freeze({
    handlesOpaque: true,
    scopesIndependent: true,
    revocationPermanent: true,
  });
}
async function checkContextTasks(host) {
  const subject = {
    kind: "private-account",
    principal: "railgun:0",
    protocol: "railgun",
    deployment: "sepolia",
    chainId: 11155111,
    role: "protocol-rpc",
  };
  const scope = host.createPrivacyScope({
    profileId: "public-task-check",
    signal: new AbortController().signal,
  });
  const other = host.createPrivacyScope({
    profileId: "public-task-check",
    signal: new AbortController().signal,
  });
  const handle = scope.getContext(subject);
  let release, began;
  const original = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    began = resolve;
  });
  const pending = [];
  try {
    assert.equal(
      await scope.run(handle, (signal) => {
        assert.equal(signal, scope.signal);
        return "value";
      }),
      "value",
    );
    assert.throws(() => other.run(handle, () => {}), {
      code: "INVALID_PRIVACY_CONTEXT",
    });
    for (const value of [null, false, 0]) {
      await scope
        .run(handle, () => Promise.reject(value))
        .then(
          () => assert.fail("rejection became fulfilment"),
          (error) => assert.equal(error, value),
        );
    }
    for (let index = 0; index < 32; index++) {
      const task = scope.run(handle, () => {
        began();
        return original;
      });
      pending.push(
        task.then(
          () => assert.fail("late result escaped"),
          (error) => assert.equal(error.code, "PRIVACY_CONTEXT_REVOKED"),
        ),
      );
    }
    assert.throws(() => scope.run(handle, () => {}), {
      code: "PRIVACY_TASK_LIMIT",
    });
    await started;
    scope.close();
    // Revocation settles the outer promises before the original tasks finish.
    await Promise.all(pending);
    release("late");
    await original;
    return Object.freeze({
      ownsHandles: true,
      boundedTasks: true,
      cancellationObserved: true,
      lateResultRefused: true,
    });
  } finally {
    scope.close();
    other.close();
    release();
    await Promise.allSettled(pending);
  }
}
module.exports = { checkContextHost, checkContextTasks };
