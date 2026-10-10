"use strict";
const path = require("node:path"),
  { createHmac } = require("node:crypto");
const { createContextHost } = require("./context.cjs");
const { createStorageHost } = require("./storage.cjs");
const { createInventoryGuard, profileId } = require("./inventory.cjs");
/** Application bookkeeping, not an adapter receipt or submission permit.
 * It uses a separate derivation domain and genuine inventory/storage guards.
 * Only trusted command code receives it; it is not a captured owner family. */
function createApplicationState({ profile, vault, assertCustody = () => {} }) {
  const context = createContextHost({ assertCurrent: assertCustody }),
    unlock = vault.currentSession();
  if (unlock.aborted || profileId(profile) !== profileId(vault.profile))
    throw Error("Application state is locked");
  const scope = context.createPrivacyScope({
    profileId: profileId(profile),
    signal: unlock,
    isCurrent: () => vault.currentSession() === unlock,
  });
  const handle = scope.getContext({
    kind: "private-account",
    principal: "railgun:0",
    chainId: 11155111,
    protocol: "railgun",
    deployment: "sepolia",
    role: "storage",
    operation: "reference-application-v1",
  });
  let storage;
  try {
    vault.withSeed((seed) => {
      const key = createHmac("sha256", seed)
        .update("Railgun reference application state v1\0")
        .update(profileId(profile))
        .digest();
      try {
        storage = createStorageHost(context).createPrivacyStorage({
          handle,
          key,
          directory: path.join(profile.userDataDir, "wallet-railgun-accounts"),
          profileGuard: createInventoryGuard({
            context,
            handle,
            profile,
            seed,
          }),
        });
      } finally {
        key.fill(0);
      }
    });
  } catch (error) {
    scope.close();
    throw error;
  }
  function key(value) {
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value))
      throw Error("Invalid application state key");
  }
  return Object.freeze({
    async get(name) {
      key(name);
      const value = await storage.get(name);
      return value === null ? null : JSON.parse(value);
    },
    async update(name, change) {
      key(name);
      return storage.update(name, (value) =>
        JSON.stringify(change(value === null ? null : JSON.parse(value))),
      );
    },
    close: scope.close,
  });
}
module.exports = { createApplicationState };
