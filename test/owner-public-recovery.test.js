/** Actual authenticated catalog and public owner; store/scan work is controlled. */
require("../tools/owner-test-staging/context-host.cjs");
let mockEnrollment,
  mockCreateCoordinator,
  mockSource,
  mockJobs,
  mockPolicy,
  mockCursor,
  mockSnapshotFailure,
  mockRecovery;
const mockOpen = jest.fn(),
  mockAuthorities = new WeakSet();
jest.mock("../src/owners/railgun-account-enrollment.js", () => ({
  isRailgunAccountEnrollment: (v) => v === mockEnrollment,
  withRailgunEnrollmentPublicKeys: (enrollment, ...args) => {
    if (enrollment !== mockEnrollment) throw Error("enrollment");
    return mockEnrollment.withPublicKeys(...args);
  },
  withRailgunEnrollmentPublicCatalogKey: (enrollment, ...args) => {
    if (enrollment !== mockEnrollment) throw Error("enrollment");
    return mockEnrollment.withPublicCatalogKey(...args);
  },
  withRailgunEnrollmentPublicGenerationKeys: (enrollment, ...args) => {
    if (enrollment !== mockEnrollment) throw Error("enrollment");
    return mockEnrollment.withPublicGenerationKeys(...args);
  },
  withRailgunEnrollmentTxidGenerationKeys: (enrollment, ...args) => {
    if (enrollment !== mockEnrollment) throw Error("enrollment");
    return mockEnrollment.withTxidGenerationKeys(...args);
  },
}));
jest.mock("../src/owners/railgun-account-store.js", () => ({
  openRailgunAccountStore: (...args) => mockOpen(...args),
}));
jest.mock("../src/owners/railgun-public-policy.js", () => ({
  getRailgunPublicPolicy: () => mockPolicy,
}));
jest.mock("../src/owners/railgun-public-run.js", () => ({
  createRailgunPublicJobs: () => mockJobs,
}));
jest.mock("../src/owners/railgun-scan-source.js", () => ({
  createRailgunScanSource: (options) => {
    mockSource = {
      ...options,
      ledgerId: "1".repeat(64),
      close: jest.fn(),
      signal: options.ledger.signal,
    };
    return mockSource;
  },
}));
jest.mock("../src/owners/railgun-scan-coordinator.js", () => ({
  createRailgunScanCoordinator: (...args) => mockCreateCoordinator(...args),
  assertRailgunScanCoordinator: (v) => {
    if (!mockAuthorities.has(v) || v.signal.aborted) throw Error("coordinator");
  },
}));
const fs = require("fs"),
  os = require("os"),
  path = require("path");
const { createPrivacyScope } = require("../src/owners/context-bindings.js");
const {
  getPrivacyStoragePath,
} = require("../tools/owner-test-staging/fixtures/host/src/main/wallet/privacy-storage.js");
const {
  openRailgunAccountPublic,
  assertRailgunAccountPublic,
} = require("../src/owners/railgun-account-public.js");
let scope,
  stores,
  controllers,
  opened,
  metadata,
  publicRecords,
  journalPath;
beforeEach(() => {
  jest.clearAllMocks();
  mockPolicy = "a".repeat(64);
  mockCursor = 10;
  mockSnapshotFailure = 0;
  mockRecovery = null;
  stores = [];
  controllers = [];
  opened = [];
  metadata = 0;
  publicRecords = 0;
  scope = createPrivacyScope({
    profileId: "account-public-test",
    signal: new AbortController().signal,
  });
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "railgun-account-public-")),
  );
  mockEnrollment = {
    directory,
    binding: "b".repeat(64),
    signal: scope.signal,
    getContext: (role, operation) =>
      scope.getContext({
        kind: "private-account",
        principal: "railgun:0",
        protocol: "railgun",
        deployment: "sepolia",
        chainId: 11155111,
        role,
        ...(operation ? { operation } : {}),
      }),
    profileGuard: { assert: jest.fn(), remember: jest.fn() },
    withPublicCatalogKey: async (use) =>
      use({ "public-catalog": Buffer.alloc(32, 6) }),
    withPublicGenerationKeys: async (_catalog, _id, use) =>
      mockEnrollment.withPublicKeys(use),
    withTxidGenerationKeys: jest.fn(async (_catalog, _id, _policy, use) => {
      const key = Buffer.alloc(32, 7);
      try {
        return await use({ "txid-journal": key });
      } finally {
        key.fill(0);
      }
    }),
    withPublicKeys: async (use) => {
      const key = Buffer.alloc(32, 5);
      try {
        return await use({ "scan-journal": key });
      } finally {
        key.fill(0);
      }
    },
  };
  journalPath = getPrivacyStoragePath(
    mockEnrollment.getContext("storage", "railgun-scan-v1"),
    directory,
  );
  mockOpen.mockImplementation(async ({ kind, create, generationId }) => {
    const filename = path.join(
      directory,
      "railgun-public-" + generationId,
      kind + ".sqlite",
    );
    if (create) fs.writeFileSync(filename, "fixture");
    const controller = new AbortController();
    controllers.push(controller);
    let done;
    const closed = new Promise((resolve) => {
      done = resolve;
    });
    const session = {
      signal: controller.signal,
      closed,
      close: jest.fn(() => {
        controller.abort();
        done();
      }),
      inspectWalletState: async () => ({
        count: publicRecords,
        bytes: publicRecords,
      }),
      assertFresh: jest.fn(),
    };
    const ledger = {
      signal: controller.signal,
      assertEmpty: () => {
        if (metadata) throw Error("nonempty ledger");
      },
      close: () => session.close(),
    };
    const value = {
      session,
      ledger,
      storeId: (kind === "source" ? "1" : "2").repeat(64),
    };
    stores.push(value);
    return value;
  });
  mockJobs = {
    project: jest.fn(async () => ({})),
    apply: jest.fn(async () => ({})),
  };
  mockCreateCoordinator = jest.fn(async (options) => {
    journalPath = getPrivacyStoragePath(
      mockEnrollment.getContext("storage", "railgun-scan-v1"),
      options.journalStorage.directory,
    );
    fs.writeFileSync(journalPath, "fixture");
    const controller = new AbortController();
    controllers.push(controller);
    const plan = {
      to: { number: mockCursor, hash: "0x" + "a".repeat(64) },
      source: { ledgerId: "1".repeat(64) },
      state: { storeId: "2".repeat(64) },
    };
    let attestations = 0;
    const coordinator = {
      identity: { ...options.journalStorage, ledgerId: "1".repeat(64) },
      advance: async () => ({ to: plan.to }),
      recover: jest.fn(async () => {
        if (mockRecovery) return mockRecovery();
        return Object.freeze({
          status: mockCursor === null ? "unscanned" : "applied-unverified",
          to: mockCursor === null ? null : plan.to,
        });
      }),
      inspect: () => ({ to: plan.to }),
      withPublicSnapshot: async (run) => ({ value: await run(), evidence: {} }),
      assertSnapshot: () => {
        if (++attestations === mockSnapshotFailure)
          throw Error("publication attestation failed");
        return plan;
      },
      signal: controller.signal,
      close: () => {
        controller.abort();
        options.storeSession.close();
      },
    };
    mockAuthorities.add(coordinator);
    return coordinator;
  });
});
afterEach(async () => {
  await Promise.all(opened.map((v) => v.close()));
  scope.close();
});
async function open(create = false, mode) {
  const result = await openRailgunAccountPublic({
    enrollment: mockEnrollment,
    archive: "/engine.asar",
    create,
    ...(mode ? { mode } : {}),
  });
  opened.push(result);
  return result;
}

function retainedFiles(directory) {
  return fs.readdirSync(directory, { recursive: true }).sort();
}
test("recover selects an existing pending generation and authenticates before publication", async () => {
  const first = await open(true),
    id = first.generationId;
  await first.close();
  const files = retainedFiles(mockEnrollment.directory);
  const recovered = await open(false, "recover");
  expect(recovered.generationId).toBe(id);
  expect(retainedFiles(mockEnrollment.directory)).toEqual(files);
  expect(() =>
    assertRailgunAccountPublic(recovered.coordinator, mockEnrollment),
  ).toThrow();
  expect(await recovered.recover()).toMatchObject({
    status: "applied-unverified",
    to: { number: 10 },
  });
  expect(
    assertRailgunAccountPublic(recovered.coordinator, mockEnrollment),
  ).toBe(mockPolicy);
  expect(recovered.coordinator.recover).toHaveBeenCalledTimes(1);
});
test("active-only recover selects the same generation, never starts another", async () => {
  const first = await open(true);
  await first.publish();
  const id = first.generationId;
  await first.close();
  const files = retainedFiles(mockEnrollment.directory);
  const active = await open(false, "recover");
  expect(active.generationId).toBe(id);
  await active.recover();
  expect(retainedFiles(mockEnrollment.directory)).toEqual(files);
  expect(assertRailgunAccountPublic(active.coordinator, mockEnrollment)).toBe(
    mockPolicy,
  );
});
test("wrong-policy pending is never bypassed in favor of a same-policy active generation", async () => {
  const first = await open(true);
  await first.publish();
  await first.close();
  mockPolicy = "b".repeat(64);
  const pending = await open(false, "new");
  await pending.close();
  const files = retainedFiles(mockEnrollment.directory),
    calls = mockOpen.mock.calls.length;
  mockPolicy = "a".repeat(64);
  await expect(open(false, "recover")).rejects.toThrow();
  expect(mockOpen.mock.calls).toHaveLength(calls);
  expect(retainedFiles(mockEnrollment.directory)).toEqual(files);
});
test("absent catalog and create+recover refuse without any file or store creation", async () => {
  await expect(open(false, "recover")).rejects.toThrow();
  await expect(open(true, "recover")).rejects.toThrow();
  expect(fs.readdirSync(mockEnrollment.directory)).toEqual([]);
  expect(mockOpen).not.toHaveBeenCalled();
});
test("pending below the retained high-water mark remains pending", async () => {
  mockCursor = 100;
  const first = await open(true);
  await first.publish();
  await first.close();
  mockCursor = 20;
  const pending = await open(false, "new");
  await pending.close();
  const recovered = await open(false, "recover");
  expect(await recovered.recover()).toMatchObject({ to: { number: 20 } });
  expect(() =>
    assertRailgunAccountPublic(recovered.coordinator, mockEnrollment),
  ).toThrow();
});
test("an empty candidate returns unscanned and cannot publish", async () => {
  const first = await open(true);
  await first.close();
  mockCursor = null;
  const recovered = await open(false, "recover");
  expect(await recovered.recover()).toEqual({ status: "unscanned", to: null });
  expect(() =>
    assertRailgunAccountPublic(recovered.coordinator, mockEnrollment),
  ).toThrow();
});
test.each([2, 3])(
  "publication failure at attestation %s recovers the same generation deterministically",
  async (failure) => {
    const first = await open(true),
      id = first.generationId;
    await first.close();
    mockSnapshotFailure = failure;
    const interrupted = await open(false, "recover");
    await expect(interrupted.recover()).rejects.toThrow(
      "publication attestation failed",
    );
    await interrupted.close();
    mockSnapshotFailure = 0;
    const reopened = await open(false, "recover");
    expect(reopened.generationId).toBe(id);
    if (failure === 3)
      expect(
        assertRailgunAccountPublic(reopened.coordinator, mockEnrollment),
      ).toBe(mockPolicy);
    else
      expect(() =>
        assertRailgunAccountPublic(reopened.coordinator, mockEnrollment),
      ).toThrow();
    await reopened.recover();
    expect(
      assertRailgunAccountPublic(reopened.coordinator, mockEnrollment),
    ).toBe(mockPolicy);
  },
);
test("recovery failure stays unknown and does not create or publish another generation", async () => {
  const first = await open(true);
  await first.close();
  const recovered = await open(false, "recover"),
    error = Error("source unknown");
  mockRecovery = async () => {
    throw error;
  };
  await expect(recovered.recover()).rejects.toBe(error);
  expect(() =>
    assertRailgunAccountPublic(recovered.coordinator, mockEnrollment),
  ).toThrow();
});

// The real encrypted catalog selects generations. Only the public apply/source
// and runtime verification are controlled by this test's existing fixture.
function policyDomain(version) {
  const vm = require("node:vm");
  const module = {exports: {}};
  let text = fs.readFileSync(path.join(__dirname, "../src/owners/railgun-public-policy.js"), "utf8");
  if (version === 1) text = text.replace("public-policy-v2", "public-policy-v1")
    .replaceAll("readRailgunCacheSourceIdentity", "readRailgunPolicySourceIdentity")
    .replace("readRailgunPolicySourceIdentity('public')", "readRailgunPolicySourceIdentity()");
  vm.runInNewContext(text, {module, require(name) {
    if (name === "../deployment") return require("../src/deployment");
    if (name.includes("railgun-engine-runtime")) return {verifyRailgunEngineRuntime() {}};
    if (name.includes("railgun-engine-manifest")) return require("../src/execution/railgun-engine-manifest.json");
    if (name === "./source-files.json") return require("../src/owners/source-files.json");
    if (name === "./source-identity") return {
      readRailgunPolicySourceIdentity: () => ({layout: "sources-v2", packageDigest: "c".repeat(64), hostDigest: "d".repeat(64)}),
      readRailgunCacheSourceIdentity: kind => ({layout: "cache-sources-v1", kind, packageDigest: "e".repeat(64), hostDigest: "d".repeat(64)}),
    };
    return require(name);
  }});
  return module.exports.getRailgunPublicPolicy("/fixture.asar");
}
test.each(["active", "pending"])("v1 %s generation cannot silently open under v2", async (state) => {
  mockPolicy = policyDomain(1);
  const prior = await open(true), oldId = prior.generationId;
  if (state === "active") await prior.publish();
  await prior.close();
  mockPolicy = policyDomain(2);
  const files = retainedFiles(mockEnrollment.directory), calls = mockOpen.mock.calls.length;
  for (const mode of [undefined, "recover", "pending"])
    await expect(open(false, mode)).rejects.toThrow();
  expect(mockOpen.mock.calls).toHaveLength(calls);
  expect(retainedFiles(mockEnrollment.directory)).toEqual(files);
  const fresh = await open(false, "new");
  expect(fresh.generationId).not.toBe(oldId);
});
