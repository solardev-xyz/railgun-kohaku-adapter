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

test("nested validation brackets physical custody once but never caches logical currentness", () => {
  const physical = jest.fn(),
    host = createContextHost({ assertCurrent: physical });
  const signal = new AbortController().signal;
  const logical = jest.fn(() => true);
  const base = host.createPrivacyScope({
    profileId: "alice",
    signal,
    isCurrent: logical,
  });
  const first = base.getContext(subject);
  const parent = host.createPrivacyScope({
    profileId: "alice",
    signal,
    isCurrent: () => {
      host.getPrivacyContext(first);
      host.getPrivacyContext(first);
      return true;
    },
  });
  const second = parent.getContext({ ...subject, role: "protocol-rpc" });
  const child = host.createPrivacyScope({
    profileId: "alice",
    signal,
    isCurrent: () => {
      host.getPrivacyContext(second);
      host.getPrivacyContext(second);
      return true;
    },
  });
  const last = child.getContext({ ...subject, role: "transaction-rpc" });
  physical.mockClear();
  logical.mockClear();
  host.getPrivacyContext(last);
  expect(physical).toHaveBeenCalledTimes(2);
  expect(logical).toHaveBeenCalledTimes(4);
  host.getPrivacyContext(last);
  expect(physical).toHaveBeenCalledTimes(4);
  logical.mockReturnValue(false);
  expect(() => host.getPrivacyContext(last)).toThrow();
  expect(base.signal.aborted).toBe(true);
  expect(child.signal.aborted).toBe(true);
});
test("a physical custody change inside logical validation is caught before returning a handle", () => {
  let invalid = false,
    change = false;
  const host = createContextHost({
    assertCurrent: () => {
      if (invalid) throw Error("custody changed");
    },
  });
  const scope = host.createPrivacyScope({
    profileId: "alice",
    signal: new AbortController().signal,
    isCurrent: () => {
      if (change) invalid = true;
      return true;
    },
  });
  const handle = scope.getContext(subject);
  change = true;
  expect(() => host.getPrivacyContext(handle)).toThrow("custody changed");
  invalid = false;
  change = false;
  // A failed check must not leave the depth counter suppressing future checks.
  invalid = true;
  expect(() => host.getPrivacyContext(handle)).toThrow("custody changed");
});
test("physical validation is repeated after an asynchronous boundary", async () => {
  const physical = jest.fn(),
    host = createContextHost({ assertCurrent: physical });
  const scope = host.createPrivacyScope({
    profileId: "alice",
    signal: new AbortController().signal,
  });
  const handle = scope.getContext(subject);
  physical.mockClear();
  host.getPrivacyContext(handle);
  await Promise.resolve();
  physical.mockImplementation(() => {
    throw Error("replaced profile");
  });
  expect(() => host.getPrivacyContext(handle)).toThrow("replaced profile");
  expect(physical).toHaveBeenCalledTimes(3);
});

test("controlled reentrant currentness still brackets custody and detects a deepest-edge mutation", () => {
  let invalid = false,
    recurse = false,
    mutate = false,
    first,
    second;
  const physical = jest.fn(() => {
    if (invalid) throw Error("changed at deepest edge");
  });
  const host = createContextHost({ assertCurrent: physical });
  const signal = new AbortController().signal;
  const a = host.createPrivacyScope({
    profileId: "alice",
    signal,
    isCurrent: () => {
      if (recurse) {
        if (mutate) invalid = true;
        return true;
      }
      if (second) {
        recurse = true;
        try {
          host.getPrivacyContext(second);
        } finally {
          recurse = false;
        }
      }
      return true;
    },
  });
  first = a.getContext(subject);
  const b = host.createPrivacyScope({
    profileId: "alice",
    signal,
    isCurrent: () => {
      host.getPrivacyContext(first);
      return true;
    },
  });
  second = b.getContext({ ...subject, role: "protocol-rpc" });
  physical.mockClear();
  host.getPrivacyContext(first);
  expect(physical).toHaveBeenCalledTimes(2);
  physical.mockClear();
  mutate = true;
  expect(() => host.getPrivacyContext(first)).toThrow(
    "changed at deepest edge",
  );
  expect(physical).toHaveBeenCalledTimes(2);
});
