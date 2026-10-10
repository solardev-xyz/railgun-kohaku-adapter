"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { createVault } = require("../examples/reference-wallet/host/vault.cjs");
const {
  createApplicationState,
} = require("../examples/reference-wallet/host/application-state.cjs");
test("command progress survives cold reopen through real encrypted guarded storage", async () => {
  const profile = {
    id: "public-application-fixture",
    userDataDir: fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "reference-app-state-")),
    ),
  };
  const password = Buffer.from("public application fixture password");
  const vault = createVault({ profile });
  let state, next, reopened;
  try {
    await vault.initialize(password);
    await vault.unlock(password);
    state = createApplicationState({ profile, vault });
    expect(await state.get("scan")).toBeNull();
    await state.update("scan", () => ({
      checkpoint: 99,
      privateFixtureLabel: "not-visible-in-ciphertext",
    }));
    const inventory = JSON.parse(
      fs.readFileSync(
        path.join(profile.userDataDir, "reference-inventory.json"),
      ),
    );
    expect(inventory.state.files).toHaveLength(1);
    expect(
      fs.readFileSync(
        path.join(profile.userDataDir, inventory.state.files[0]),
        "utf8",
      ),
    ).not.toContain("not-visible-in-ciphertext");
    state.close();
    vault.lock();
    await expect(state.get("scan")).rejects.toThrow();
    next = createVault({ profile });
    await next.unlock(password);
    reopened = createApplicationState({ profile, vault: next });
    expect(await reopened.get("scan")).toEqual({
      checkpoint: 99,
      privateFixtureLabel: "not-visible-in-ciphertext",
    });
    next.lock();
    await expect(reopened.update("scan", () => ({}))).rejects.toThrow();
  } finally {
    state?.close();
    reopened?.close();
    vault.lock();
    next?.lock();
    password.fill(0);
  }
});
