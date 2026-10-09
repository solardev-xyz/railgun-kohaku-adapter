/** The qualification host's one bounded vault-lifetime override, authorized by
 * the user for the live public rescan only: a `live-rebuild` or the upgrade
 * link's `live-upgrade-rebuild` process sets the
 * unlocked vault's auto-lock to 60 minutes, once, right after its explicit
 * unlock. Every other mode keeps the host default (15 minutes). Nothing is
 * persisted; there is no periodic renewal or synthetic activity; the process
 * still locks the vault on close, and the timer still locks it on expiry.
 */
'use strict';
const assert = require('assert/strict');
const DEFAULT_MS = 15 * 60 * 1000;
const REBUILD_MS = 60 * 60 * 1000;
// The scan stops starting windows this long before the vault would lock.
const pauseMargin = (lifetimeMs) => Math.min(5 * 60 * 1000, Math.floor(lifetimeMs / 4));
function applyRebuildUnlock(identity, { mode, synthetic, params }) {
  assert.equal(identity.isUnlocked(), true);
  // Synthetic only: a short lifetime, to exercise expiry and the clean pause.
  const syntheticMs = synthetic && Number.isSafeInteger(params?.unlockMs) ? params.unlockMs : null;
  if (!synthetic) assert.equal(Object.hasOwn(params ?? {}, 'unlockMs'), false);
  if (!['live-rebuild', 'live-upgrade-rebuild'].includes(mode)) return Object.freeze({ lifetimeMs: DEFAULT_MS, overridden: false });
  const lifetimeMs = syntheticMs ?? REBUILD_MS;
  assert.ok(lifetimeMs > 0 && lifetimeMs <= REBUILD_MS);
  identity.resetAutoLockTimer(lifetimeMs);
  return Object.freeze({ lifetimeMs, overridden: true });
}
module.exports = { applyRebuildUnlock, pauseMargin, DEFAULT_MS, REBUILD_MS };
