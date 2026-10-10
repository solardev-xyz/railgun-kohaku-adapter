"use strict";
const {
  createContextHost,
} = require("../examples/reference-wallet/host/context.cjs");
const {
  checkContextHost,
  checkContextTasks,
} = require("../tools/conformance/context.cjs");
const subject = {
  kind: "private-account",
  principal: "railgun:0",
  chainId: 11155111,
  protocol: "railgun",
  deployment: "sepolia",
  role: "storage",
};

test("reference host passes the shared context contract", () => {
  expect(checkContextHost(createContextHost()).revocationPermanent).toBe(true);
});
test("broker tasks obey ownership, limits and cancellation", async () => {
  expect((await checkContextTasks(createContextHost())).lateResultRefused).toBe(
    true,
  );
});
test("separate hosts cannot authenticate each other's handles", () => {
  const alice = createContextHost(),
    bob = createContextHost();
  const scope = alice.createPrivacyScope({
    profileId: "alice",
    signal: new AbortController().signal,
  });
  try {
    expect(() => bob.getPrivacyContext(scope.getContext(subject))).toThrow();
  } finally {
    scope.close();
  }
});
test("a failed currentness check revokes already-issued handles", () => {
  const host = createContextHost();
  let failed = false;
  const scope = host.createPrivacyScope({
    profileId: "alice",
    signal: new AbortController().signal,
    isCurrent() {
      if (failed) throw Error("profile unavailable");
      return true;
    },
  });
  const handle = scope.getContext(subject);
  failed = true;
  expect(() => host.getPrivacyContext(handle)).toThrow();
  expect(scope.signal.aborted).toBe(true);
});
test.each([
  { ...subject, kind: "unknown" },
  { ...subject, chainId: 0 },
  { ...subject, protocol: undefined },
  { ...subject, principal: "" },
])("invalid subject is refused", (input) => {
  const host = createContextHost();
  const scope = host.createPrivacyScope({
    profileId: "alice",
    signal: new AbortController().signal,
  });
  try {
    expect(() => scope.getContext(input)).toThrow();
  } finally {
    scope.close();
  }
});
test("unsupported requirements refuse instead of weakening privacy", () => {
  const host = createContextHost();
  const scope = host.createPrivacyScope({
    profileId: "alice",
    signal: new AbortController().signal,
  });
  try {
    for (const policy of [
      { origin: "direct" },
      { content: "unknown" },
      { correctness: "trusted" },
      { maxAgeMs: -1 },
      { extra: true },
    ])
      expect(() => scope.getContext(subject, policy)).toThrow();
  } finally {
    scope.close();
  }
});
test("contract checker detects a host which ignores chain binding", () => {
  const real = createContextHost();
  const broken = {
    ...real,
    getPrivacyContext: (handle) => real.getPrivacyContext(handle),
  };
  expect(() => checkContextHost(broken)).toThrow();
});
