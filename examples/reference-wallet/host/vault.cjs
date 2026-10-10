"use strict";
const path = require("node:path");
const fs = require("node:fs");
const {
  randomBytes,
  scrypt,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv,
} = require("node:crypto");
const { promisify } = require("node:util");
const { Mnemonic } = require("ethers");
const { readFile, writeFile, assertRoot } = require("./files.cjs");
const { initializeInventory } = require("./inventory.cjs");
const stretch = promisify(scrypt);
const PARAMETERS = Object.freeze({
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});
function check(condition) {
  if (!condition)
    throw Object.assign(new Error("Reference vault unavailable"), {
      code: "REFERENCE_VAULT_REFUSED",
    });
}
function seedFromEntropy(entropy) {
  // BIP-39 tooling creates a JavaScript string; JS cannot promise erasure of
  // immutable strings. Neither mnemonic nor seed is logged or persisted raw.
  const phrase = Mnemonic.fromEntropy(entropy).phrase.normalize("NFKD");
  return pbkdf2Sync(phrase, "mnemonic", 2048, 64, "sha512");
}
function entropyFromPhrase(bytes) {
  check(
    bytes instanceof Uint8Array &&
      bytes.byteLength >= 32 &&
      bytes.byteLength <= 512,
  );
  const phrase = new TextDecoder("utf-8", { fatal: true })
    .decode(bytes)
    .normalize("NFKD");
  check(Mnemonic.isValidMnemonic(phrase));
  const entropy = Buffer.from(
    Mnemonic.fromPhrase(phrase).entropy.slice(2),
    "hex",
  );
  // The reference app uses 24-word BIP-39 phrases, no optional passphrase.
  if (entropy.length !== 32) {
    entropy.fill(0);
    check(false);
  }
  return entropy;
}
/** The app must own the profile's process lock before construction. This is a
 * password-encrypted example vault, not the system keychain or a hardware wallet.
 * Its fixed seed callback is host-private; it is never passed to the adapter. */
function createVault({
  profile,
  unlockMs = 15 * 60 * 1000,
  assertCustody = () => {},
}) {
  assertCustody();
  check(
    Number.isSafeInteger(unlockMs) && unlockMs >= 60000 && unlockMs <= 3600000,
  );
  assertRoot(profile.userDataDir);
  check(
    typeof profile.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(profile.id),
  );
  profile = Object.freeze({ id: profile.id, userDataDir: profile.userDataDir });
  const filename = path.join(profile.userDataDir, "reference-vault.json");
  function aad(record) {
    return Buffer.from(
      JSON.stringify([
        "railgun-reference-vault",
        1,
        record.vaultId,
        record.profileId,
      ]),
    );
  }
  let session = new AbortController(),
    unlockedSeed = null,
    timer = null,
    epoch = 0,
    busy = false;
  session.abort();
  function lock() {
    epoch++;
    if (timer) clearTimeout(timer);
    timer = null;
    unlockedSeed?.fill(0);
    unlockedSeed = null;
    session.abort();
  }
  async function passwordKey(password, salt) {
    check(
      password instanceof Uint8Array &&
        password.byteLength >= 12 &&
        password.byteLength <= 1024,
    );
    const copy = Buffer.alloc(password.byteLength);
    copy.set(password);
    try {
      return await stretch(copy, salt, 32, PARAMETERS);
    } finally {
      copy.fill(0);
    }
  }
  async function initialize(password, recoveryPhrase) {
    assertCustody();
    check(
      !busy &&
        !unlockedSeed &&
        fs.readdirSync(profile.userDataDir).length === 0,
    );
    const version = epoch,
      fresh =
        recoveryPhrase === undefined
          ? randomBytes(32)
          : entropyFromPhrase(recoveryPhrase),
      identity = {
        vaultId: randomBytes(32).toString("hex"),
        profileId: profile.id,
      },
      salt = randomBytes(32),
      iv = randomBytes(12);
    let key, seed;
    busy = true;
    try {
      key = await passwordKey(password, salt);
      assertCustody();
      check(epoch === version);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad(identity));
      const ciphertext = Buffer.concat([cipher.update(fresh), cipher.final()]);
      seed = seedFromEntropy(fresh);
      // Partial initialization is deliberately not auto-repaired or overwritten.
      initializeInventory({ profile, seed });
      writeFile(
        profile.userDataDir,
        filename,
        JSON.stringify({
          version: 1,
          ...identity,
          kdf: "scrypt-32768-8-1",
          salt: salt.toString("hex"),
          iv: iv.toString("hex"),
          tag: cipher.getAuthTag().toString("hex"),
          ciphertext: ciphertext.toString("hex"),
        }),
        {
          create: true,
          active: () => {
            assertCustody();
            check(epoch === version);
          },
        },
      );
    } finally {
      key?.fill(0);
      seed?.fill(0);
      fresh.fill(0);
      busy = false;
    }
  }
  async function decrypt(password, version) {
    assertCustody();
    let key, head, tail, opened;
    try {
      const record = JSON.parse(
        readFile(profile.userDataDir, filename, 4096).toString("utf8"),
      );
      check(
        record.version === 1 &&
          record.kdf === "scrypt-32768-8-1" &&
          record.profileId === profile.id &&
          /^[0-9a-f]{64}$/.test(record.vaultId),
      );
      for (const [field, size] of [
        ["salt", 32],
        ["iv", 12],
        ["tag", 16],
        ["ciphertext", 32],
      ])
        check(
          typeof record[field] === "string" &&
            new RegExp(`^[0-9a-f]{${size * 2}}$`).test(record[field]),
        );
      key = await passwordKey(password, Buffer.from(record.salt, "hex"));
      assertCustody();
      check(version === epoch);
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(record.iv, "hex"),
      );
      decipher.setAAD(aad(record));
      decipher.setAuthTag(Buffer.from(record.tag, "hex"));
      head = decipher.update(Buffer.from(record.ciphertext, "hex"));
      tail = decipher.final();
      opened = Buffer.concat([head, tail]);
      check(opened.length === 32 && version === epoch);
      const result = Buffer.alloc(32);
      opened.copy(result);
      return result;
    } finally {
      key?.fill(0);
      head?.fill(0);
      tail?.fill(0);
      opened?.fill(0);
    }
  }
  async function unlock(password) {
    check(!busy && !unlockedSeed);
    busy = true;
    const version = epoch;
    let opened;
    try {
      opened = await decrypt(password, version);
      assertCustody();
      check(epoch === version);
      unlockedSeed = seedFromEntropy(opened);
      session = new AbortController();
      timer = setTimeout(lock, unlockMs);
      timer.unref();
    } catch {
      lock();
      check(false);
    } finally {
      opened?.fill(0);
      busy = false;
    }
  }
  // Explicit host-only recovery action. The CLI must use a private terminal,
  // obtain confirmation and never put this phrase in reports, argv or logs.
  // Password reauthentication is required even when the vault is unlocked.
  async function exportRecovery(password, consume) {
    check(!busy && typeof consume === "function");
    busy = true;
    const version = epoch;
    let opened, phrase;
    try {
      opened = await decrypt(password, version);
      assertCustody();
      check(version === epoch);
      phrase = Buffer.from(Mnemonic.fromEntropy(opened).phrase, "utf8");
      check(consume(phrase) === undefined && version === epoch);
    } catch {
      check(false);
    } finally {
      opened?.fill(0);
      phrase?.fill(0);
      busy = false;
    }
  }
  function withSeed(consume) {
    assertCustody();
    check(
      unlockedSeed && !session.signal.aborted && typeof consume === "function",
    );
    const version = epoch;
    let seed;
    try {
      seed = Buffer.alloc(64);
      unlockedSeed.copy(seed);
      check(
        consume(seed) === undefined &&
          version === epoch &&
          !session.signal.aborted,
      );
    } finally {
      seed?.fill(0);
    }
  }
  return Object.freeze({
    profile,
    initialize,
    exportRecovery,
    unlock,
    lock,
    currentSession: () => session.signal,
    withSeed,
  });
}
/** Read only the persisted logical identity; unlock authenticates it. A moved
 * directory can export its phrase, but its path-bound account stores must be
 * restored into a fresh profile and rescanned, never silently re-adopted. */
function readVaultProfile(directory) {
  assertRoot(directory);
  const record = JSON.parse(
    readFile(
      directory,
      path.join(directory, "reference-vault.json"),
      4096,
    ).toString("utf8"),
  );
  check(
    record.version === 1 &&
      typeof record.profileId === "string" &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(record.profileId),
  );
  return Object.freeze({ id: record.profileId, userDataDir: directory });
}
module.exports = { createVault, readVaultProfile };
