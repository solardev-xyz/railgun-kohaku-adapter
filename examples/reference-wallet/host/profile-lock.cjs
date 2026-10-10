"use strict";
const { acquireLock, assertProfileLock } = require("./profile-lock-core.cjs");
/** Fixed per-user namespace. No caller-selected lock directory in the app. */
function acquireProfileLock({ root, onCompromised }) {
  const { app } = require("electron");
  if (process.type !== "browser" || app.isReady())
    throw new Error("Profile lock must precede application readiness");
  const lock = acquireLock({
    root,
    appData: app.getPath("appData"),
    onCompromised,
  });
  app.setPath("userData", lock.directory);
  // Chromium ProcessSingleton can kill a blocked owner. Never invoke it for
  // wallet custody. SQLite retains the OS lock until original process exit.
  return lock;
}
module.exports = { acquireProfileLock, assertProfileLock };
