"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash, createHmac, timingSafeEqual } = require("node:crypto");
const files = require("./files.cjs");
const ACCOUNT = "wallet-railgun-accounts";
const SUBMISSIONS = "wallet-private-submissions";
const NAME = "reference-inventory.json";
const accountFile =
  /^wallet-railgun-accounts\/(?:[0-9a-f]{64}\.json|account-[0-9a-f]{64}\/(?:[0-9a-f]{64}\.json|(?:source|public)\.sqlite|railgun-public-[0-9a-f]{64}\/(?:(?:source|public|txid-[0-9a-f]{64})\.sqlite|[0-9a-f]{64}\.json)|railgun-cache-[0-9a-f]{64}\/(?:wallet\.sqlite|[0-9a-f]{64}\.json)))$/;
const submissionFile = /^wallet-private-submissions\/[0-9a-f]{64}\.json$/;
function refuse(code = "PRIVATE_PROFILE_INVENTORY_INVALID") {
  throw Object.assign(new Error("Reference inventory requires recovery"), {
    code,
  });
}
function profileId(profile) {
  return createHash("sha256")
    .update(JSON.stringify([profile.id, profile.userDataDir]))
    .digest("hex");
}
function inventoryKey(seed, profile) {
  if (!(seed instanceof Uint8Array) || seed.byteLength !== 64) refuse();
  return createHmac("sha256", seed)
    .update("Railgun reference inventory v1\0")
    .update(profile.id)
    .digest();
}
function encode(state, key) {
  return JSON.stringify({
    state,
    mac: createHmac("sha256", key).update(JSON.stringify(state)).digest("hex"),
  });
}
/** Called once during explicit new-profile creation, never by account opening. */
function initializeInventory({ profile, seed }) {
  const root = profile.userDataDir;
  files.assertRoot(root);
  if (
    [ACCOUNT, SUBMISSIONS].some((name) => fs.existsSync(path.join(root, name)))
  )
    refuse();
  const key = inventoryKey(seed, profile);
  try {
    files.writeFile(
      root,
      path.join(root, NAME),
      encode({ version: 1, profileId: profileId(profile), files: [] }, key),
      { create: true },
    );
  } finally {
    key.fill(0);
  }
}
/** Owns an independent MAC-key copy until the authentic context is revoked.
 * An authenticated inventory detects missing stores, not whole-profile rollback. */
function createInventoryGuard({ context, handle, profile, seed }) {
  const root = profile.userDataDir,
    expected = profileId(profile);
  const owner = context.getPrivacyContext(handle);
  if (owner.profileId !== expected) refuse("PRIVATE_PROFILE_MOVED");
  files.assertRoot(root);
  const key = inventoryKey(seed, profile),
    marker = path.join(root, NAME);
  const wipe = () => key.fill(0);
  owner.signal.addEventListener("abort", wipe, { once: true });
  function active() {
    context.getPrivacyContext(handle);
  }
  function classified(action) {
    try {
      return action();
    } catch (error) {
      if (/^(PRIVATE_|PRIVACY_)/.test(error?.code)) throw error;
      refuse();
    }
  }
  function validName(name) {
    return (
      typeof name === "string" &&
      (accountFile.test(name) || submissionFile.test(name))
    );
  }
  function name(file) {
    if (typeof file !== "string" || !path.isAbsolute(file)) refuse();
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (!validName(relative)) refuse();
    return relative;
  }
  function read() {
    active();
    try {
      const record = JSON.parse(
        files.readFile(root, marker, 1024 * 1024).toString("utf8"),
      );
      const state = record.state;
      if (
        !state ||
        state.version !== 1 ||
        typeof state.profileId !== "string" ||
        !/^[0-9a-f]{64}$/.test(state.profileId) ||
        !Array.isArray(state.files) ||
        state.files.length > 4096 ||
        state.files.some((item) => !validName(item)) ||
        new Set(state.files).size !== state.files.length ||
        typeof record.mac !== "string" ||
        !/^[0-9a-f]{64}$/.test(record.mac)
      )
        refuse();
      const actual = createHmac("sha256", key)
        .update(JSON.stringify(state))
        .digest();
      if (!timingSafeEqual(Buffer.from(record.mac, "hex"), actual)) refuse();
      if (state.profileId !== expected) refuse("PRIVATE_PROFILE_MOVED");
      for (const file of state.files) {
        try {
          files.assertPath(root, path.join(root, file));
        } catch (error) {
          if (error.code === "ENOENT") refuse("PRIVATE_PROFILE_STORE_MISSING");
          throw error;
        }
      }
      active();
      return state;
    } catch (error) {
      if (/^(PRIVATE_PROFILE_|PRIVACY_)/.test(error?.code)) throw error;
      if (error.code === "ENOENT") refuse("PRIVATE_PROFILE_INVENTORY_MISSING");
      refuse();
    }
  }
  try {
    read();
  } catch (error) {
    owner.signal.removeEventListener("abort", wipe);
    wipe();
    throw error;
  }
  return Object.freeze({
    assert(file) {
      return classified(() => {
        name(file);
        read();
        files.assertPath(root, file, true);
      });
    },
    assertRegistered(file) {
      return classified(() => {
        const relative = name(file),
          state = read();
        if (!state.files.includes(relative)) refuse();
        files.assertPath(root, file);
      });
    },
    remember(file) {
      return classified(() => {
        const relative = name(file),
          state = read();
        files.assertPath(root, file);
        if (state.files.includes(relative)) return;
        if (state.files.length >= 4096)
          refuse("PRIVATE_PROFILE_INVENTORY_FULL");
        state.files.push(relative);
        files.writeFile(root, marker, encode(state, key), { active });
      });
    },
  });
}
module.exports = { initializeInventory, createInventoryGuard, profileId };
