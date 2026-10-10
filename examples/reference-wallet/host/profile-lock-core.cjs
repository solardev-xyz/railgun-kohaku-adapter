"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const { createHash } = require("node:crypto");
const { assertRoot, assertPath } = require("./files.cjs");
const locks = new Map();
function failure(code) {
  return Object.assign(Error("Reference profile lock unavailable"), { code });
}
function identity(stat) {
  return `${stat.dev}:${stat.ino}`;
}
/** Main-process-only core. Node conformance may supply a disposable appData.
 * Roots and lock files must be on a local filesystem (not NFS/SMB).
 * Never open/read/backup this lock file elsewhere in the holder process:
 * POSIX close of ANY descriptor for its inode releases fcntl locks. Only
 * lstat/chmod below are safe. Keep this directory outside custody inventories.
 * No stale-file deletion, heartbeat takeover or early release exists. */
function acquireLock({ root, appData, onCompromised = () => {} }) {
  assertRoot(root);
  assertRoot(appData);
  if (locks.has(root)) throw failure("REFERENCE_PROFILE_BUSY");
  const lockDirectory = path.join(appData, "railgun-reference-wallet", "locks");
  fs.mkdirSync(lockDirectory, { recursive: true, mode: 0o700 });
  assertRoot(lockDirectory);
  fs.chmodSync(lockDirectory, 0o700);
  const directory = path.join(
    lockDirectory,
    createHash("sha256").update(root).digest("hex"),
  );
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertRoot(directory);
  fs.chmodSync(directory, 0o700);
  const filename = path.join(directory, "profile-lock.sqlite");
  assertPath(directory, filename, true);
  // Precreate before SQLite acquires any lock, then retain inode identity.
  try {
    fs.closeSync(fs.openSync(filename, "wx", 0o600));
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const inode = identity(assertPath(directory, filename));
  const parent = identity(fs.lstatSync(directory));
  const wallet = identity(fs.lstatSync(root));
  let database,
    compromised = false;
  function verify() {
    try {
      assertRoot(root);
      assertRoot(directory);
      if (
        compromised ||
        identity(assertPath(directory, filename)) !== inode ||
        identity(fs.lstatSync(directory)) !== parent ||
        identity(fs.lstatSync(root)) !== wallet
      )
        throw failure("REFERENCE_LOCK_COMPROMISED");
    } catch {
      compromised = true;
      onCompromised();
      throw failure("REFERENCE_LOCK_COMPROMISED");
    }
  }
  try {
    database = new (require("better-sqlite3"))(filename, { timeout: 0 });
    fs.chmodSync(filename, 0o600);
    database.pragma("locking_mode = EXCLUSIVE");
    database.exec("BEGIN EXCLUSIVE");
    verify();
  } catch (error) {
    database?.close();
    throw failure(
      error?.code === "SQLITE_BUSY"
        ? "REFERENCE_PROFILE_BUSY"
        : error?.code === "REFERENCE_LOCK_COMPROMISED"
          ? error.code
          : "REFERENCE_LOCK_UNAVAILABLE",
    );
  }
  // Strong reference is essential: GC/finalization must never close the DB.
  locks.set(root, { database, verify });
  process.once("exit", () => {
    try {
      database.close();
    } catch {
      /* OS releases locks. */
    }
  });
  return Object.freeze({ root, directory, verify });
}
function assertProfileLock(root) {
  const lock = locks.get(root);
  if (!lock) throw failure("REFERENCE_LOCK_REQUIRED");
  lock.verify();
}
module.exports = { acquireLock, assertProfileLock };
