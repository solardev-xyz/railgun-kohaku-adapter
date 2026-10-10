"use strict";
const {
  createContextHost,
} = require("../examples/reference-wallet/host/context.cjs");
const {
  createSessionHost,
} = require("../examples/reference-wallet/host/sessions.cjs");
const subject = {
  kind: "private-account",
  principal: "railgun:0",
  chainId: 11155111,
  protocol: "railgun",
  deployment: "sepolia",
  role: "storage",
};
function setup() {
  const context = createContextHost(),
    lifetime = new AbortController();
  let profile = { id: "alice", userDataDir: "/disposable/alice" },
    vault = new AbortController();
  const host = createSessionHost({
    context,
    lifetime: lifetime.signal,
    profiles: { getActiveProfile: () => profile },
    credentials: { currentSession: () => vault.signal },
  });
  return {
    context,
    lifetime,
    host,
    replaceVault: () => {
      vault = new AbortController();
    },
    lock: () => vault.abort(),
    changeProfile: () => {
      profile = { id: "bob", userDataDir: "/disposable/bob" };
    },
  };
}
test("same profile and unlock reuse one parent; shutdown is permanent", () => {
  const { host } = setup();
  const session = host.sessions.openPrivacySession();
  expect(host.sessions.openPrivacySession()).toBe(session);
  host.close();
  expect(session.signal.aborted).toBe(true);
  expect(() => host.sessions.openPrivacySession()).toThrow();
});
test.each(["lock", "replaceVault", "changeProfile"])(
  "%s revokes previous context",
  (action) => {
    const fixture = setup();
    const session = fixture.host.sessions.openPrivacySession(),
      handle = session.getContext(subject);
    fixture[action]();
    try {
      expect(() => fixture.context.getPrivacyContext(handle)).toThrow();
      expect(session.signal.aborted).toBe(true);
      if (action === "lock")
        expect(() => fixture.host.sessions.openPrivacySession()).toThrow();
      else expect(fixture.host.sessions.openPrivacySession()).not.toBe(session);
    } finally {
      fixture.host.close();
    }
  },
);
test("application exit revokes even when vault signal has not aborted", () => {
  const fixture = setup();
  const session = fixture.host.sessions.openPrivacySession();
  fixture.lifetime.abort();
  expect(session.signal.aborted).toBe(true);
  expect(() => fixture.host.sessions.openPrivacySession()).toThrow();
  fixture.host.close();
});
