"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  createContextHost,
} = require("../examples/reference-wallet/host/context.cjs");
const {
  createStorageHost,
} = require("../examples/reference-wallet/host/storage.cjs");
const { checkStorageHost } = require("../tools/conformance/storage.cjs");
const subject = {
  kind: "private-account",
  principal: "railgun:0",
  chainId: 11155111,
  protocol: "railgun",
  deployment: "sepolia",
  role: "storage",
};
function setup() {
  const context = createContextHost();
  const createScope = () =>
    context.createPrivacyScope({
      profileId: "public-test-profile",
      signal: new AbortController().signal,
    });
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "railgun-reference-storage-")),
  );
  // Explicit inventory seam. This suite qualifies storage, not the profile guard.
  const profileGuard = { assert: jest.fn(), remember: jest.fn() };
  return {
    context,
    storage: createStorageHost(context),
    createScope,
    directory,
    profileGuard,
  };
}
test("reference storage passes shared black-box checks with real encrypted files", async () => {
  expect(await checkStorageHost(setup())).toEqual({
    encrypted: true,
    reopen: true,
    revoked: true,
    serialized: true,
    tamperRefused: true,
  });
});
test("revocation in the updater prevents a commit", async () => {
  const fixture = setup(),
    scope = fixture.createScope(),
    handle = scope.getContext(subject);
  const store = fixture.storage.createPrivacyStorage({
    ...fixture,
    handle,
    key: Buffer.alloc(32, 42),
  });
  await expect(
    store.update("value", () => {
      scope.close();
      return "late";
    }),
  ).rejects.toThrow();
  expect(fs.readdirSync(fixture.directory)).toEqual([]);
});
test("a failure after replacement is explicitly possibly committed", async () => {
  const fixture = setup(),
    scope = fixture.createScope(),
    handle = scope.getContext(subject);
  const store = fixture.storage.createPrivacyStorage({
    ...fixture,
    handle,
    key: Buffer.alloc(32, 42),
  });
  fixture.profileGuard.remember.mockImplementation(() => {
    throw Error("inventory unavailable");
  });
  try {
    await expect(
      store.update("value", () => "committed"),
    ).rejects.toMatchObject({ storageCommitted: true });
    expect(
      fs.existsSync(
        fixture.storage.getPrivacyStoragePath(handle, fixture.directory),
      ),
    ).toBe(true);
  } finally {
    scope.close();
  }
});
test("asynchronous updater refuses without committing", async () => {
  const fixture = setup(),
    scope = fixture.createScope(),
    handle = scope.getContext(subject);
  const store = fixture.storage.createPrivacyStorage({
    ...fixture,
    handle,
    key: Buffer.alloc(32, 42),
  });
  try {
    await expect(store.update("value", async () => "late")).rejects.toThrow();
    expect(await store.get("value")).toBeNull();
  } finally {
    scope.close();
  }
});
test("storage binding prevents copying ciphertext to another subject", async () => {
  const fixture = setup(),
    scope = fixture.createScope(),
    handle = scope.getContext(subject);
  const other = scope.getContext({ ...subject, principal: "railgun:1" });
  const key = Buffer.alloc(32, 42);
  const first = fixture.storage.createPrivacyStorage({
    ...fixture,
    handle,
    key,
  });
  const second = fixture.storage.createPrivacyStorage({
    ...fixture,
    handle: other,
    key,
  });
  try {
    await first.update("value", () => "bound");
    fs.copyFileSync(
      fixture.storage.getPrivacyStoragePath(handle, fixture.directory),
      fixture.storage.getPrivacyStoragePath(other, fixture.directory),
    );
    await expect(second.get("value")).rejects.toThrow();
  } finally {
    scope.close();
    key.fill(0);
  }
});
