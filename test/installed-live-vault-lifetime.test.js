"use strict";
const {
  applyRebuildUnlock,
  pauseMargin,
  DEFAULT_MS,
  REBUILD_MS,
} = require("../tools/qualification/installed-live/vault-lifetime.cjs");
const identity = () => ({
  isUnlocked: jest.fn(() => true),
  resetAutoLockTimer: jest.fn(),
});
test("only a live rebuild sets the vault lifetime to 60 minutes, once", () => {
  const vault = identity();
  expect(
    applyRebuildUnlock(vault, {
      mode: "live-rebuild",
      synthetic: false,
      params: {},
    }),
  ).toEqual({
    lifetimeMs: REBUILD_MS,
    overridden: true,
  });
  expect(vault.resetAutoLockTimer).toHaveBeenCalledTimes(1);
  expect(vault.resetAutoLockTimer).toHaveBeenCalledWith(60 * 60 * 1000);
  for (const mode of [
    "live-submit",
    "live-observe",
    "live-poi",
    "live-poi-status",
    "live-unshield",
    "live-summary",
    "live-reconcile",
  ]) {
    const other = identity();
    expect(
      applyRebuildUnlock(other, { mode, synthetic: false, params: {} }),
    ).toEqual({ lifetimeMs: DEFAULT_MS, overridden: false });
    expect(other.resetAutoLockTimer).not.toHaveBeenCalled();
  }
});
test("a short lifetime is synthetic only, and a locked vault is never extended", () => {
  const vault = identity();
  expect(
    applyRebuildUnlock(vault, {
      mode: "live-rebuild",
      synthetic: true,
      params: { unlockMs: 60000 },
    }).lifetimeMs,
  ).toBe(60000);
  expect(() =>
    applyRebuildUnlock(identity(), {
      mode: "live-rebuild",
      synthetic: false,
      params: { unlockMs: 60000 },
    }),
  ).toThrow();
  const locked = identity();
  locked.isUnlocked.mockReturnValue(false);
  expect(() =>
    applyRebuildUnlock(locked, {
      mode: "live-rebuild",
      synthetic: false,
      params: {},
    }),
  ).toThrow();
  expect(locked.resetAutoLockTimer).not.toHaveBeenCalled();
  expect(pauseMargin(REBUILD_MS)).toBe(5 * 60 * 1000);
  expect(pauseMargin(60000)).toBe(15000);
});
