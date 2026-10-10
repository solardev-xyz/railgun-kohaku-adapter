"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomBytes } = require("node:crypto");

/** Use a fresh disposable directory and a real host context. The caller supplies
 * its inventory guard. These checks do not establish that guard's authenticity
 * or rollback resistance. All files remain available for inspection. */
async function checkStorageHost({
  storage,
  createScope,
  directory,
  profileGuard,
}) {
  const subject = {
    kind: "private-account",
    principal: "railgun:0",
    chainId: 11155111,
    protocol: "railgun",
    deployment: "sepolia",
    role: "storage",
    operation: "conformance",
  };
  const master = randomBytes(32);
  const scope = createScope(),
    reopened = createScope();
  const handle = scope.getContext(subject),
    next = reopened.getContext(subject);
  const file = storage.getPrivacyStoragePath(handle, directory);
  assert.equal(
    fs.existsSync(file),
    false,
    "conformance requires a fresh store",
  );
  const key = Buffer.from(master);
  try {
    const first = storage.createPrivacyStorage({
      handle,
      directory,
      key,
      profileGuard,
    });
    key.fill(0); // The package wipes its derived key as soon as the factory returns.
    assert.equal(await first.get("record"), null);
    await first.update("record", (prior) => {
      assert.equal(prior, null);
      return "private-conformance-value";
    });
    assert.equal(await first.get("record"), "private-conformance-value");
    assert.equal(
      fs.readFileSync(file).includes(Buffer.from("private-conformance-value")),
      false,
    );
    assert.equal(storage.getPrivacyStoragePath(next, directory), file);
    scope.close();
    await assert.rejects(first.get("record"), {
      code: "PRIVACY_CONTEXT_REVOKED",
    });
    await assert.rejects(
      first.update("record", () => "must-not-write"),
      { code: "PRIVACY_CONTEXT_REVOKED" },
    );
    const second = storage.createPrivacyStorage({
      handle: next,
      directory,
      key: master,
      profileGuard,
    });
    assert.equal(await second.get("record"), "private-conformance-value");
    const updaterError = Object.assign(Error("cancelled update"), {
      code: "RAILGUN_POI_INTENT_STORE_STALE",
    });
    let calls = 0;
    await assert.rejects(
      second.update("record", () => {
        calls++;
        throw updaterError;
      }),
      (error) => error === updaterError,
    );
    assert.equal(calls, 1);
    assert.equal(await second.get("record"), "private-conformance-value");
    await second.update("counter", () => "0");
    const third = storage.createPrivacyStorage({
      handle: next,
      directory,
      key: master,
      profileGuard,
    });
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        (index % 2 ? second : third).update("counter", (prior) =>
          String(Number(prior) + 1),
        ),
      ),
    );
    assert.equal(
      await second.get("counter"),
      "12",
      "separate adapters must serialize updates",
    );
    const authentic = fs.readFileSync(file);
    const changed = Buffer.from(authentic);
    changed[Math.floor(changed.length / 2)] ^= 1;
    fs.writeFileSync(file, changed);
    try {
      await assert.rejects(second.get("record"), {
        code: "PRIVATE_STORAGE_UNREADABLE",
      });
    } finally {
      fs.writeFileSync(file, authentic);
    }
    assert.equal(await second.get("record"), "private-conformance-value");
    return Object.freeze({
      encrypted: true,
      reopen: true,
      revoked: true,
      serialized: true,
      tamperRefused: true,
    });
  } finally {
    master.fill(0);
    key.fill(0);
    scope.close();
    reopened.close();
  }
}
module.exports = { checkStorageHost };
