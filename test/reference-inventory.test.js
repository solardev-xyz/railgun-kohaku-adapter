"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { randomBytes } = require("node:crypto");
const {
  createContextHost,
} = require("../examples/reference-wallet/host/context.cjs");
const {
  createStorageHost,
} = require("../examples/reference-wallet/host/storage.cjs");
const {
  initializeInventory,
  createInventoryGuard,
  profileId,
} = require("../examples/reference-wallet/host/inventory.cjs");
function setup() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "railgun-reference-inventory-")),
  );
  const profile = { id: "public-conformance", userDataDir: root },
    seed = randomBytes(64);
  const context = createContextHost(),
    scope = context.createPrivacyScope({
      profileId: profileId(profile),
      signal: new AbortController().signal,
    });
  const handle = scope.getContext({
    kind: "private-account",
    principal: "railgun:0",
    chainId: 11155111,
    protocol: "railgun",
    deployment: "sepolia",
    role: "storage",
    operation: "railgun-account-enrollment-v1",
  });
  const close = () => {
    scope.close();
    seed.fill(0);
  };
  return { root, profile, seed, context, scope, handle, close };
}
test("genuine inventory and encrypted store survive a new context", async () => {
  const fixture = setup();
  const key = randomBytes(32);
  try {
    initializeInventory(fixture);
    const guard = createInventoryGuard(fixture),
      storage = createStorageHost(fixture.context);
    const directory = path.join(fixture.root, "wallet-railgun-accounts");
    const file = storage.getPrivacyStoragePath(fixture.handle, directory);
    expect(() => guard.assertRegistered(file)).toThrow();
    const store = storage.createPrivacyStorage({
      ...fixture,
      directory,
      key,
      profileGuard: guard,
    });
    await store.update("record", () => "authenticated");
    expect(() => guard.assertRegistered(file)).not.toThrow();
    const next = fixture.context.createPrivacyScope({
      profileId: profileId(fixture.profile),
      signal: new AbortController().signal,
    });
    const handle = next.getContext(
      fixture.context.getPrivacyContext(fixture.handle).subject,
    );
    // Normalized subject includes null; callers construct the equivalent input.
    try {
      const other = createInventoryGuard({ ...fixture, handle });
      expect(() => other.assertRegistered(file)).not.toThrow();
    } finally {
      next.close();
    }
  } finally {
    key.fill(0);
    fixture.close();
  }
});
test("opening without an inventory never initializes one", () => {
  const fixture = setup();
  try {
    expect(() => createInventoryGuard(fixture)).toThrow();
    expect(fs.readdirSync(fixture.root)).toEqual([]);
  } finally {
    fixture.close();
  }
});
test("reinitialization and an altered MAC are refused", () => {
  const fixture = setup();
  try {
    initializeInventory(fixture);
    expect(() => initializeInventory(fixture)).toThrow();
    const marker = path.join(fixture.root, "reference-inventory.json");
    const value = JSON.parse(fs.readFileSync(marker));
    value.mac = "0".repeat(64);
    fs.writeFileSync(marker, JSON.stringify(value));
    expect(() => createInventoryGuard(fixture)).toThrow();
  } finally {
    fixture.close();
  }
});
test("missing registered file refuses rather than silently resetting", () => {
  const fixture = setup();
  try {
    initializeInventory(fixture);
    const guard = createInventoryGuard(fixture),
      directory = path.join(fixture.root, "wallet-railgun-accounts");
    fs.mkdirSync(directory);
    const file = path.join(directory, `${"a".repeat(64)}.json`);
    fs.writeFileSync(file, "public test placeholder");
    guard.remember(file);
    fs.renameSync(file, `${file}.preserved`);
    expect(() => guard.assert(file)).toThrow();
  } finally {
    fixture.close();
  }
});
test("profile movement and paths outside the inventory are refused", () => {
  const fixture = setup();
  try {
    initializeInventory(fixture);
    const guard = createInventoryGuard(fixture);
    expect(() =>
      guard.assert(path.join(fixture.root, "outside.json")),
    ).toThrow();
    expect(() =>
      createInventoryGuard({
        ...fixture,
        profile: { ...fixture.profile, id: "other" },
      }),
    ).toThrow();
    fixture.scope.close();
    expect(() =>
      guard.assert(
        path.join(
          fixture.root,
          "wallet-railgun-accounts",
          `${"a".repeat(64)}.json`,
        ),
      ),
    ).toThrow();
  } finally {
    fixture.close();
  }
});
test("guard path failures retain the profile error vocabulary", () => {
  const fixture = setup();
  try {
    initializeInventory(fixture);
    const guard = createInventoryGuard(fixture);
    const directory = path.join(fixture.root, "wallet-railgun-accounts");
    fs.mkdirSync(directory);
    const file = path.join(directory, `${"b".repeat(64)}.json`);
    fs.symlinkSync(path.join(fixture.root, "reference-inventory.json"), file);
    for (const method of ["assert", "assertRegistered", "remember"])
      expect(() => guard[method](file)).toThrow(
        expect.objectContaining({ code: "PRIVATE_PROFILE_INVENTORY_INVALID" }),
      );
  } finally {
    fixture.close();
  }
});
test("an authenticated inventory at a different root is MOVED; a forged root is INVALID", () => {
  const fixture = setup(),
    moved = setup();
  try {
    initializeInventory(fixture);
    const marker = path.join(moved.root, "reference-inventory.json");
    fs.copyFileSync(
      path.join(fixture.root, "reference-inventory.json"),
      marker,
    );
    expect(() =>
      createInventoryGuard({ ...moved, seed: fixture.seed }),
    ).toThrow(expect.objectContaining({ code: "PRIVATE_PROFILE_MOVED" }));
    const record = JSON.parse(fs.readFileSync(marker));
    record.state.profileId = profileId(moved.profile);
    fs.writeFileSync(marker, JSON.stringify(record));
    expect(() =>
      createInventoryGuard({ ...moved, seed: fixture.seed }),
    ).toThrow(
      expect.objectContaining({ code: "PRIVATE_PROFILE_INVENTORY_INVALID" }),
    );
  } finally {
    fixture.close();
    moved.close();
  }
});
