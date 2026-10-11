"use strict";
const { reviewWindow, assertApproval, revalidationWindow, sendWindow, assertWindow } = require('../src/owners/shield-review-lifetime');
const base = { now: 1000, wall: 1000000, operationEnd: 241000, operationWallEnd: 1240000, hostExpiresAt: 1120000 };
test('the human gets60s while revalidation and send keep distinct fixed deadlines', () => {
  const w = reviewWindow(base);
  expect(w.humanEnd).toBe(61000);
  expect(w.humanExpiresAt).toBe(1060000);
  const r = revalidationWindow(w, 60999, 1059999);
  expect(r.end).toBe(95999);
  const f = sendWindow(w, 60999, 1059999);
  expect(f.end).toBe(110999);
  expect(f.end - r.end).toBeGreaterThanOrEqual(10000);
});
test('tight host or operation budgets preserve the45s floor and10s signing allocation', () => {
  for (const limit of ['hostExpiresAt', 'operationWallEnd']) {
    const minimum = limit === 'hostExpiresAt' ? 90000 : 100000;
    const w = reviewWindow({ ...base, [limit]: base.wall + minimum });
    expect(w.humanEnd - w.started).toBe(45000);
    const r = revalidationWindow(w, 45999, 1044999);
    const f = sendWindow(w, 45999, 1044999);
    expect(f.expiresAt - r.expiresAt).toBeGreaterThanOrEqual(10000);
    expect(() => reviewWindow({ ...base, [limit]: base.wall + minimum - 1 })).toThrow();
  }
  expect(() => reviewWindow({ ...base, operationEnd: base.now + 99999 })).toThrow();
});
test('approval expiry, wall rollback and monotonic rollback cannot renew a window', () => {
  const w = reviewWindow(base);
  expect(() => assertApproval(w, w.humanEnd, w.humanExpiresAt - 1)).toThrow();
  expect(() => assertApproval(w, w.humanEnd - 1, w.humanExpiresAt)).toThrow();
  expect(() => assertApproval(w, base.now - 1, base.wall)).toThrow();
  expect(() => assertApproval(w, base.now, base.wall - 1)).toThrow();
  expect(() => revalidationWindow(w, w.humanEnd, w.humanExpiresAt)).toThrow();
});
test('timers are not authority: exact deadlines and delayed callback results refuse', () => {
  const w = reviewWindow(base), r = revalidationWindow(w, 2000, 1001000);
  expect(() => assertWindow(r, r.end - 1, r.expiresAt - 1)).not.toThrow();
  for (const [now, wall] of [[r.end, r.expiresAt - 1], [r.end - 1, r.expiresAt], [r.started - 1, r.wallStarted], [NaN, r.wallStarted]])
    expect(() => assertWindow(r, now, wall)).toThrow();
});
