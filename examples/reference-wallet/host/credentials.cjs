"use strict";
const { createHmac } = require("node:crypto");
const { types } = require("node:util");
const { createInventoryGuard, profileId } = require("./inventory.cjs");
const originalThen = Promise.prototype.then;
const fill = Uint8Array.prototype.fill;
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
).get;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
function check(value) {
  if (!value)
    throw Object.assign(new Error("Reference credential unavailable"), {
      code: "RAILGUN_CREDENTIAL_REFUSED",
    });
}
function isAborted(signal) {
  return Reflect.apply(aborted, signal, []);
}
function capture(request) {
  check(
    request &&
      !types.isProxy(request) &&
      Object.getPrototypeOf(request) === Object.prototype,
  );
  const fields = Object.getOwnPropertyDescriptors(request);
  check(Reflect.ownKeys(fields).every((key) => typeof key === "string"));
  check(
    Object.keys(fields).sort().join(",") ===
      "accountIndex,handle,purpose,signal,vaultSession",
  );
  for (const descriptor of Object.values(fields))
    check(Object.hasOwn(descriptor, "value") && descriptor.enumerable);
  return Object.fromEntries(
    Object.entries(fields).map(([name, descriptor]) => [
      name,
      descriptor.value,
    ]),
  );
}
/** Fixed schedule only, inside the host's vault boundary. No caller-selected
 * derivation path and no raw seed capability reaches the adapter. */
function derive(seed, accountIndex, purpose, ownerProfileId) {
  check(seed instanceof Uint8Array && seed.byteLength === 64);
  const bytes = Buffer.alloc(32);
  let node;
  try {
    if (purpose === "storage-root") {
      node = createHmac("sha256", seed)
        .update("Freedom Railgun account storage v1\0")
        .update(
          JSON.stringify([ownerProfileId, accountIndex, 11155111, "sepolia"]),
        )
        .digest();
    } else {
      node = createHmac("sha512", "babyjubjub seed").update(seed).digest();
      for (const index of [
        purpose === "viewing" ? 420 : 44,
        1984,
        0,
        0,
        accountIndex,
      ]) {
        const input = Buffer.alloc(37);
        try {
          node.copy(input, 1, 0, 32);
          input.writeUInt32BE(index + 0x80000000, 33);
          const next = createHmac("sha512", node.subarray(32))
            .update(input)
            .digest();
          node.fill(0);
          node = next;
        } finally {
          input.fill(0);
        }
      }
    }
    node.copy(bytes, 0, 0, 32);
    return bytes;
  } catch (error) {
    bytes.fill(0);
    throw error;
  } finally {
    node?.fill(0);
  }
}
function createCredentialHost({ context, profiles, vault }) {
  const unobserved = new Set();
  let quarantined = false;
  function currentSession() {
    check(arguments.length === 0 && !quarantined);
    const profile = profiles.getActiveProfile();
    check(
      profile &&
        vault.profile &&
        profileId(profile) === profileId(vault.profile),
    );
    const signal = vault.currentSession();
    check(!isAborted(signal));
    return signal;
  }
  async function withMaterial(request, consume) {
    check(
      arguments.length === 2 &&
        typeof consume === "function" &&
        !types.isProxy(consume) &&
        !quarantined,
    );
    const { handle, vaultSession, accountIndex, purpose, signal } =
      capture(request);
    check(
      Number.isInteger(accountIndex) &&
        !Object.is(accountIndex, -0) &&
        accountIndex >= 0 &&
        accountIndex <= 65535,
    );
    check(
      ["storage-root", "viewing", "spending-public", "spending-sign"].includes(
        purpose,
      ),
    );
    const owner = context.getPrivacyContext(handle),
      subject = owner.subject;
    check(
      subject.kind === "private-account" &&
        subject.principal === `railgun:${accountIndex}` &&
        subject.chainId === 11155111 &&
        subject.protocol === "railgun" &&
        subject.deployment === "sepolia",
    );
    check(
      purpose === "storage-root"
        ? subject.role === "storage" &&
            subject.operation === "railgun-account-enrollment-v1"
        : subject.role === "keystore" &&
            (purpose === "viewing"
              ? [null, "viewing-identity"].includes(subject.operation)
              : purpose === "spending-public"
                ? subject.operation === purpose
                : [purpose, "relay-sign"].includes(subject.operation)),
    );
    const source = profiles.getActiveProfile();
    const profile = Object.freeze({
      id: source.id,
      userDataDir: source.userDataDir,
    });
    check(profileId(profile) === owner.profileId);
    const signals = [...new Set([owner.signal, vaultSession, signal])];
    function active() {
      check(!quarantined && signals.every((item) => !isAborted(item)));
      check(
        currentSession() === vaultSession &&
          context.getPrivacyContext(handle) === owner,
      );
      const now = profiles.getActiveProfile();
      check(now.id === profile.id && now.userDataDir === profile.userDataDir);
    }
    active();
    let bytes, profileGuard;
    function wipe() {
      try {
        if (bytes) Reflect.apply(fill, bytes, [0]);
      } catch {
        /* A transferred buffer has no accessible bytes. */
      }
    }
    for (const item of signals)
      Reflect.apply(add, item, ["abort", wipe, { once: true }]);
    try {
      vault.withSeed((seed) => {
        active();
        bytes = derive(seed, accountIndex, purpose, owner.profileId);
        if (purpose === "storage-root")
          profileGuard = createInventoryGuard({
            context,
            handle,
            profile,
            seed,
          });
      });
      active();
      check(
        bytes instanceof Uint8Array &&
          bytes.byteLength === 32 &&
          bytes.byteOffset === 0 &&
          bytes.buffer instanceof ArrayBuffer &&
          bytes.buffer.byteLength === 32,
      );
      const original = consume(
        Object.freeze(
          purpose === "storage-root" ? { bytes, profileGuard } : { bytes },
        ),
      );
      if (!types.isPromise(original)) {
        quarantined = true;
        wipe();
        vault.lock();
        check(false);
      }
      const settled = await new Promise((resolve, reject) => {
        try {
          // The result is wrapped to avoid adopting an arbitrary callback result.
          Reflect.apply(originalThen, original, [
            (value) => resolve({ value }),
            reject,
          ]);
        } catch {
          unobserved.add(original);
          quarantined = true;
          wipe();
          vault.lock();
          // Unknown original settlement is intentionally not reported as drained.
        }
      });
      check(settled.value === undefined);
      if (!(
        purpose === "storage-root" &&
        isAborted(signal) &&
        isAborted(owner.signal)
      ))
        active();
    } finally {
      wipe();
      for (const item of signals) Reflect.apply(remove, item, ["abort", wipe]);
    }
  }
  return Object.freeze({ currentSession, withMaterial });
}
module.exports = { createCredentialHost };
