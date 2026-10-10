"use strict";
const { createHash } = require("node:crypto");

function createSessionHost({ context, profiles, credentials, lifetime }) {
  let active = null;
  const shutdown = new AbortController();
  function profileIdentity() {
    const profile = profiles.getActiveProfile();
    if (!profile?.id || !profile.userDataDir)
      throw Object.assign(Error("Reference profile unavailable"), {
        code: "PRIVACY_PROFILE_UNAVAILABLE",
      });
    return createHash("sha256")
      .update(JSON.stringify([profile.id, profile.userDataDir]))
      .digest("hex");
  }
  function openPrivacySession() {
    const vaultSession = credentials.currentSession();
    if (shutdown.signal.aborted || lifetime.aborted)
      throw Object.assign(Error("Reference session unavailable"), {
        code: "PRIVACY_CONTEXT_REVOKED",
      });
    if (vaultSession.aborted)
      throw Object.assign(Error("Reference vault locked"), {
        code: "PRIVACY_VAULT_LOCKED",
      });
    const profileId = profileIdentity();
    if (
      active?.profileId === profileId &&
      active.vaultSession === vaultSession &&
      !active.scope.signal.aborted
    )
      return active.scope;
    active?.scope.close();
    const scope = context.createPrivacyScope({
      profileId,
      signal: AbortSignal.any([vaultSession, lifetime, shutdown.signal]),
      isCurrent: () =>
        profileIdentity() === profileId &&
        credentials.currentSession() === vaultSession,
    });
    active = { profileId, vaultSession, scope };
    return scope;
  }
  return Object.freeze({
    sessions: Object.freeze({ openPrivacySession }),
    close() {
      shutdown.abort();
      active?.scope.close();
    },
  });
}
module.exports = { createSessionHost };
