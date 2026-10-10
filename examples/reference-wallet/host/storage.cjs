"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} = require("node:crypto");
const MAX_BYTES = 4 * 1024 * 1024;

function failure(code = "PRIVATE_STORAGE_INVALID") {
  return Object.assign(new Error("Reference encrypted storage unavailable"), {
    code,
  });
}
function check(condition, code) {
  if (!condition) throw failure(code);
}
function canonicalDirectory(directory) {
  check(typeof directory === "string" && path.isAbsolute(directory));
  let current = path.parse(directory).root;
  for (const part of path
    .relative(current, directory)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      check(stat.isDirectory() && !stat.isSymbolicLink());
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
function name(value) {
  check(typeof value === "string" && value.length > 0 && value.length <= 256);
}

/** Single owning main process, enforced by the application's profile lock.
 * This authenticated key/value layer is not an anti-rollback counter. Account
 * owners retain their separate floors and journals. */
function createStorageHost(context) {
  function binding(handle) {
    const value = context.getPrivacyContext(handle);
    return {
      value,
      aad: Buffer.from(JSON.stringify([1, value.profileId, value.subject])),
    };
  }
  function getPrivacyStoragePath(handle, directory) {
    check(typeof directory === "string" && path.isAbsolute(directory));
    const { aad } = binding(handle);
    return path.join(
      directory,
      `${createHash("sha256").update(aad).digest("hex")}.json`,
    );
  }
  function createPrivacyStorage({ handle, directory, key, profileGuard }) {
    const { value, aad } = binding(handle);
    check(
      (value.subject.kind === "private-account" &&
        value.subject.role === "storage") ||
        (value.subject.kind === "public-address" &&
          value.subject.role === "transaction-rpc" &&
          value.subject.protocol === null &&
          value.subject.deployment === null &&
          value.subject.operation === null),
    );
    check(Buffer.isBuffer(key) && key.length === 32);
    check(
      typeof profileGuard?.assert === "function" &&
        typeof profileGuard?.remember === "function",
    );
    canonicalDirectory(directory);
    const file = getPrivacyStoragePath(handle, directory);
    const secret = Buffer.alloc(32);
    key.copy(secret);
    value.signal.addEventListener("abort", () => secret.fill(0), {
      once: true,
    });
    function active() {
      context.getPrivacyContext(handle);
    }
    function read() {
      active();
      canonicalDirectory(directory);
      profileGuard.assert(file);
      let stat;
      try {
        stat = fs.lstatSync(file);
      } catch (error) {
        if (error.code === "ENOENT") return Object.create(null);
        throw failure("PRIVATE_STORAGE_UNREADABLE");
      }
      check(
        stat.isFile() &&
          !stat.isSymbolicLink() &&
          stat.nlink === 1 &&
          stat.size <= MAX_BYTES * 2,
      );
      let plaintext, head, tail;
      try {
        const record = JSON.parse(fs.readFileSync(file, "utf8"));
        check(
          record.version === 1 &&
            [record.iv, record.tag, record.ciphertext].every(
              (item) => typeof item === "string",
            ),
        );
        const iv = Buffer.from(record.iv, "base64"),
          tag = Buffer.from(record.tag, "base64"),
          ciphertext = Buffer.from(record.ciphertext, "base64");
        check(
          iv.length === 12 &&
            tag.length === 16 &&
            ciphertext.length <= MAX_BYTES,
        );
        const decipher = createDecipheriv("aes-256-gcm", secret, iv);
        decipher.setAAD(aad);
        decipher.setAuthTag(tag);
        head = decipher.update(ciphertext);
        tail = decipher.final();
        plaintext = Buffer.concat([head, tail]);
        const values = JSON.parse(plaintext.toString("utf8"));
        check(values && typeof values === "object" && !Array.isArray(values));
        check(Object.keys(values).length <= 256);
        for (const [key, item] of Object.entries(values)) {
          name(key);
          check(typeof item === "string");
        }
        active();
        profileGuard.remember(file);
        return values;
      } catch (error) {
        if (/^(PRIVATE_PROFILE_|PRIVACY_)/.test(error?.code)) throw error;
        throw failure("PRIVATE_STORAGE_UNREADABLE");
      } finally {
        head?.fill(0);
        tail?.fill(0);
        plaintext?.fill(0);
      }
    }
    function update(recordName, change) {
      name(recordName);
      check(typeof change === "function");
      const values = read();
      const result = change(
        Object.hasOwn(values, recordName) ? values[recordName] : null,
      );
      check(
        typeof result === "string" && Buffer.byteLength(result) <= 1024 * 1024,
        "PRIVATE_STORAGE_LIMIT",
      );
      Object.defineProperty(values, recordName, {
        value: result,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      const plaintext = Buffer.from(JSON.stringify(values));
      let committed = false;
      try {
        check(
          Object.keys(values).length <= 256 && plaintext.length <= MAX_BYTES,
          "PRIVATE_STORAGE_LIMIT",
        );
        const iv = randomBytes(12),
          cipher = createCipheriv("aes-256-gcm", secret, iv);
        cipher.setAAD(aad);
        const ciphertext = Buffer.concat([
          cipher.update(plaintext),
          cipher.final(),
        ]);
        const record = JSON.stringify({
          version: 1,
          iv: iv.toString("base64"),
          tag: cipher.getAuthTag().toString("base64"),
          ciphertext: ciphertext.toString("base64"),
        });
        active();
        canonicalDirectory(directory);
        profileGuard.assert(file);
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const temporary = `${file}.${randomBytes(16).toString("hex")}.tmp`;
        const fd = fs.openSync(temporary, "wx", 0o600);
        try {
          fs.writeFileSync(fd, record);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        active();
        fs.renameSync(temporary, file);
        committed = true;
        if (process.platform !== "win32") {
          const parent = fs.openSync(directory, "r");
          try {
            fs.fsyncSync(parent);
          } finally {
            fs.closeSync(parent);
          }
        }
        profileGuard.remember(file);
      } catch (original) {
        const error = /^(PRIVATE_|PRIVACY_)/.test(original?.code)
          ? original
          : failure("PRIVATE_STORAGE_WRITE_FAILED");
        if (committed) error.storageCommitted = true;
        throw error;
      } finally {
        plaintext.fill(0);
      }
    }
    return Object.freeze({
      async get(recordName) {
        name(recordName);
        const values = read();
        active();
        return Object.hasOwn(values, recordName) ? values[recordName] : null;
      },
      async update(recordName, change) {
        update(recordName, change);
      },
    });
  }
  return Object.freeze({ createPrivacyStorage, getPrivacyStoragePath });
}
module.exports = { createStorageHost };
