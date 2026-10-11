"use strict";
// Clock arithmetic only, never an authority receipt. The Shield owner retains
// these values and checks both clocks at each phase boundary and admission.
const HUMAN_MS = 60000, MIN_HUMAN_MS = 45000, REVALIDATE_MS = 35000, SIGNING_MS = 10000, SEND_MS = 10000;
const fail = () => Object.assign(new Error("Shield review lifetime unavailable"), { code: "RAILGUN_SHIELD_REVIEW_REFUSED" });
function check(value) { if (!value) throw fail(); }
function reviewWindow({ now, wall, operationEnd, operationWallEnd, hostExpiresAt }) {
  check([now, wall, operationEnd, operationWallEnd, hostExpiresAt].every(Number.isFinite));
  check(Number.isSafeInteger(wall) && Number.isSafeInteger(hostExpiresAt));
  const hostEnd = now + hostExpiresAt - wall;
  const duration = Math.floor(Math.min(HUMAN_MS,
    operationEnd - now - REVALIDATE_MS - SIGNING_MS - SEND_MS,
    operationWallEnd - wall - REVALIDATE_MS - SIGNING_MS - SEND_MS,
    hostExpiresAt - wall - REVALIDATE_MS - SIGNING_MS));
  check(duration >= MIN_HUMAN_MS);
  return Object.freeze({ started: now, wallStarted: wall, humanEnd: now + duration,
    humanExpiresAt: wall + duration, operationEnd, operationWallEnd, hostEnd, hostExpiresAt });
}
function assertApproval(window, now, wall) {
  check(now >= window.started && now < window.humanEnd &&
    wall >= window.wallStarted && wall < window.humanExpiresAt);
}
function revalidationWindow(window, now, wall) {
  assertApproval(window, now, wall);
  const end = Math.min(now + REVALIDATE_MS, window.operationEnd - SIGNING_MS - SEND_MS, window.hostEnd - SIGNING_MS);
  const expiresAt = Math.min(wall + REVALIDATE_MS, window.operationWallEnd - SIGNING_MS - SEND_MS, window.hostExpiresAt - SIGNING_MS);
  check(end > now && expiresAt > wall);
  return Object.freeze({ started: now, wallStarted: wall, end, expiresAt });
}
function sendWindow(window, preflightStart, preflightWall) {
  // Signing and a timely admitted send each get a distinct10s allocation.
  // Admission ends before owner closure; a prompt response may arrive after F.
  // The host clears its signing timer and never cancels an admitted send at E.
  return Object.freeze({ started: preflightStart, wallStarted: preflightWall,
    end: Math.min(preflightStart + 50000, window.operationEnd - SEND_MS, window.hostEnd),
    expiresAt: Math.min(preflightWall + 50000, window.operationWallEnd - SEND_MS, window.hostExpiresAt),
    closeAt: Math.min(preflightStart + 60000, window.operationEnd) });
}
function assertWindow(window, now, wall) {
  check(Number.isFinite(now) && Number.isFinite(wall) && now >= window.started &&
    wall >= window.wallStarted && now < window.end && wall < window.expiresAt);
}
module.exports = { reviewWindow, assertApproval, revalidationWindow, sendWindow, assertWindow };
