/** Controlled storage/catalog/fence ports with the copied original context
 * issuer. No real profile, SQLite lock, encrypted-store or native evidence. */
const fs = require("fs"),
  path = require("path"),
  os = require("os");
const { createHmac } = require("crypto");
let state;
jest.mock("../src/owners/context-bindings", () =>
  require("./fixtures/owner-privacy-context"),
);
jest.mock("../src/owners/host-bindings", () => ({
  profiles: { getActiveProfile: () => state.profile },
  sessions: { openPrivacySession: () => state.parent },
  credentials: {
    currentSession: () => state.controller.signal,
    withMaterial: async (request, consume) => {
      const current = state;
      const context =
        require("./fixtures/owner-privacy-context").getPrivacyContext(
          request.handle,
        );
      expect(request.purpose).toBe("storage-root");
      expect(context.subject.operation).toBe("railgun-account-enrollment-v1");
      expect(context.subject.role).toBe("storage");
      expect(request.vaultSession).toBe(current.controller.signal);
      const bytes = Buffer.alloc(32, 9);
      current.root = bytes;
      current.requests.push(request);
      const wipe = () => bytes.fill(0);
      request.signal.addEventListener("abort", wipe, { once: true });
      const guard = Object.freeze({
        assert: () =>
          require("./fixtures/owner-privacy-context").getPrivacyContext(
            request.handle,
          ),
      });
      current.guard = guard;
      try {
        if (current.before) await current.before;
        await consume(Object.freeze({ bytes, profileGuard: guard }));
        current.callbackSettled = true;
        if (current.after) await current.after;
        if (request.signal.aborted) throw Error("original host revoked");
      } finally {
        wipe();
        request.signal.removeEventListener("abort", wipe);
        current.hostSettled = true;
      }
    },
  },
  storage: {
    getPrivacyStoragePath: (_handle, directory) =>
      require("path").join(directory, "test-storage.json"),
    createPrivacyStorage: ({ key, profileGuard }) => {
      state.manifestKey = Buffer.from(key);
      expect(profileGuard).toBe(state.guard);
      return {
        get: async (name) => state.records.get(name) ?? null,
        update: async (name, callback) => {
          state.records.set(name, callback(state.records.get(name) ?? null));
        },
      };
    },
  },
}));
jest.mock("../src/owners/railgun-identity", () => ({
  assertRailgunIdentity: (identity) => {
    if (identity !== state.identity || identity.signal.aborted)
      throw Error("identity");
    return identity.descriptor;
  },
  quarantineRailgunIdentityCredentials: jest.fn(),
}));
jest.mock("../src/owners/railgun-wallet-catalog", () => ({
  createRailgunWalletCatalog: async (options) => {
    state.catalogKey = Buffer.from(options.key);
    expect(options.profileGuard).toBe(state.guard);
    if (state.catalogFailure) throw state.catalogFailure;
    return state.catalog;
  },
}));
jest.mock("../src/owners/railgun-public-catalog", () => ({}));
jest.mock("../src/owners/railgun-private-reservations", () => ({}));
jest.mock("../src/owners/railgun-private-capsule-store", () => ({}));
jest.mock("../src/owners/railgun-poi-intent-store", () => ({}));
jest.mock("../src/owners/railgun-account-fence", () => ({
  openRailgunAccountFence: () => state.fence,
}));
const context = require("./fixtures/owner-privacy-context");
const enrollment = require("../src/owners/railgun-account-enrollment");
const defer = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
beforeEach(() => {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "owner-enrollment-public-test-")),
  );
  const controller = new AbortController();
  state = {
    profile: { id: "public-test", userDataDir: directory },
    controller,
    parent: context.createPrivacyScope({
      profileId: "public-test",
      signal: controller.signal,
    }),
    identity: {
      descriptor: { walletId: "1".repeat(64), accountIndex: 0 },
      signal: controller.signal,
    },
    records: new Map(),
    requests: [],
    catalog: { close: jest.fn() },
    fence: { assertCurrent: jest.fn(), retainUntilExit: jest.fn() },
  };
});
afterEach(async () => {
  state.controller.abort();
  await tick();
});
const open = (cooperative = false) =>
  enrollment[
    cooperative
      ? "openRailgunCooperativeAccountEnrollment"
      : "openRailgunAccountEnrollment"
  ]({ identity: state.identity, create: true });

test("root callback stays held; child key domains and private same-instance access retain exact bytes", async () => {
  const owner = await open();
  expect(state.requests).toHaveLength(1);
  expect(state.callbackSettled).toBeUndefined();
  expect(state.hostSettled).toBeUndefined();
  expect(owner.profileGuard).toBe(state.guard);
  expect(owner.profileGuard.assert()).toBeTruthy();
  const derived = (purpose) =>
    createHmac("sha256", Buffer.alloc(32, 9))
      .update(JSON.stringify([1, purpose, null]))
      .digest();
  expect(state.manifestKey).toEqual(derived("account-manifest"));
  expect(state.catalogKey).toEqual(derived("wallet-catalog"));
  expect(Object.keys(owner).some((name) => name.startsWith("with"))).toBe(
    false,
  );
  let captured;
  await enrollment.withRailgunEnrollmentPublicCatalogKey(
    owner,
    async (keys) => {
      captured = keys;
    },
  );
  expect(captured).toBeDefined();
  expect(() =>
    enrollment.withRailgunEnrollmentPublicCatalogKey({ ...owner }, () => {}),
  ).toThrow();
  owner.close();
  expect(state.root.equals(Buffer.alloc(32))).toBe(true);
  expect(() => owner.profileGuard.assert()).toThrow();
  await tick();
  expect(state.hostSettled).toBe(true);
});

test("close is synchronous revocation, and legacy reopen refuses until the original root loan settles", async () => {
  const owner = await open(),
    hold = defer();
  state.after = hold.promise;
  expect(owner.close()).toBeUndefined();
  expect(state.hostSettled).toBeUndefined();
  await expect(
    enrollment.openRailgunAccountEnrollment({ identity: state.identity }),
  ).rejects.toThrow();
  hold.resolve();
  await tick();
  expect(state.hostSettled).toBe(true);
  // The controlled catalog does not write an on-disk file; existing account
  // directory and manifest still belong to the same retained synthetic state.
  const next = await enrollment.openRailgunAccountEnrollment({
    identity: state.identity,
  });
  next.close();
});

test("marked close retains fence and revokes guard before host callback drainage", async () => {
  const owner = await open(true),
    hold = defer();
  state.after = hold.promise;
  enrollment.assertRailgunFencedAccountEnrollment(owner);
  owner.close();
  expect(state.fence.retainUntilExit).toHaveBeenCalledTimes(1);
  expect(() =>
    enrollment.assertRailgunFencedAccountEnrollment(owner),
  ).toThrow();
  expect(state.root.equals(Buffer.alloc(32))).toBe(true);
  expect(state.hostSettled).toBeUndefined();
  hold.resolve();
  await tick();
});

test("throwing catalog close cannot skip guard revocation, root wipe or original callback release", async () => {
  const owner = await open();
  state.catalog.close.mockImplementation(() => {
    throw Error("catalog close");
  });
  expect(() => owner.close()).toThrow("catalog close");
  expect(() => state.guard.assert()).toThrow();
  expect(state.root.equals(Buffer.alloc(32))).toBe(true);
  await tick();
  expect(state.hostSettled).toBe(true);
});

test("failed opening revokes the original root guard and drains its host callback", async () => {
  state.catalogFailure = new Error("catalog construction");
  await expect(open()).rejects.toThrow();
  await tick();
  expect(() => state.guard.assert()).toThrow();
  expect(state.root.equals(Buffer.alloc(32))).toBe(true);
  expect(state.hostSettled).toBe(true);
});

test("late storage-root material after revocation is wiped and never opens a manifest", async () => {
  const hold = defer();
  state.before = hold.promise;
  const work = open();
  state.controller.abort();
  hold.resolve();
  await expect(work).rejects.toThrow();
  await tick();
  expect(state.manifestKey).toBeUndefined();
  expect(state.root.equals(Buffer.alloc(32))).toBe(true);
  expect(state.hostSettled).toBe(true);
  expect(() => state.guard.assert()).toThrow();
});

test("private closure observer retains the exact original loan barrier after revocation", async () => {
  const owner = await open(),
    hold = defer();
  state.after = hold.promise;
  const original = enrollment.observeRailgunEnrollmentClosure(owner);
  expect(enrollment.observeRailgunEnrollmentClosure(owner)).toBe(original);
  expect(() =>
    enrollment.observeRailgunEnrollmentClosure({ ...owner }),
  ).toThrow();
  expect(owner).not.toHaveProperty("closed");
  let settled = false;
  original.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  owner.close();
  expect(enrollment.observeRailgunEnrollmentClosure(owner)).toBe(original);
  await tick();
  expect(settled).toBe(false);
  hold.resolve();
  await Promise.allSettled([original]);
  expect(settled).toBe(true);
});
test("failed enrollment opening cannot settle before its original host callback", async () => {
  const hold = defer();
  state.after = hold.promise;
  state.catalogFailure = new Error("catalog construction");
  let settled = false;
  const work = open();
  work.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await tick();
  expect(settled).toBe(false);
  expect(state.callbackSettled).toBe(true);
  hold.resolve();
  await expect(work).rejects.toThrow();
  expect(state.hostSettled).toBe(true);
});
