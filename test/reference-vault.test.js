"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  createVault,
  readVaultProfile,
} = require("../examples/reference-wallet/host/vault.cjs");
function setup() {
  const profile = {
    id: "public-disposable-profile",
    userDataDir: fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "railgun-reference-vault-")),
    ),
  };
  const password = Buffer.from("public example test password");
  return { profile, password, vault: createVault({ profile }) };
}
test("encrypted vault reopens with the same seed and permanently revokes old sessions", async () => {
  const { profile, password, vault } = setup();
  let first, borrowed;
  try {
    await vault.initialize(password);
    expect(vault.currentSession().aborted).toBe(true);
    await vault.unlock(password);
    const old = vault.currentSession();
    vault.withSeed((seed) => {
      borrowed = seed;
      first = Buffer.from(seed);
    });
    expect(borrowed.every((byte) => byte === 0)).toBe(true);
    vault.lock();
    expect(old.aborted).toBe(true);
    const cold = createVault({ profile });
    try {
      await cold.unlock(password);
      cold.withSeed((seed) => {
        expect(seed.equals(first)).toBe(true);
      });
      expect(cold.currentSession()).not.toBe(old);
      expect(
        fs
          .readFileSync(path.join(profile.userDataDir, "reference-vault.json"))
          .includes(first),
      ).toBe(false);
    } finally {
      cold.lock();
    }
  } finally {
    first?.fill(0);
    password.fill(0);
    vault.lock();
  }
});
test("wrong password, overwrite and an in-flight unlock cancelled by lock refuse", async () => {
  const { password, vault } = setup();
  try {
    await vault.initialize(password);
    await expect(vault.initialize(password)).rejects.toThrow();
    await expect(
      vault.unlock(Buffer.from("different public password")),
    ).rejects.toThrow();
    expect(vault.currentSession().aborted).toBe(true);
    const pending = vault.unlock(password);
    vault.lock();
    await expect(pending).rejects.toThrow();
    expect(() => vault.withSeed(() => {})).toThrow();
    await vault.unlock(password);
    expect(vault.currentSession().aborted).toBe(false);
  } finally {
    password.fill(0);
    vault.lock();
  }
});
test("a changed profile cannot decrypt the vault", async () => {
  const { profile, password, vault } = setup();
  try {
    await vault.initialize(password);
    const wrong = createVault({ profile: { ...profile, id: "another" } });
    await expect(wrong.unlock(password)).rejects.toThrow();
    wrong.lock();
  } finally {
    password.fill(0);
    vault.lock();
  }
});
test("a moved vault can recover its seed into a fresh profile without adopting old stores", async () => {
  const { profile, password, vault } = setup();
  const restored = setup();
  let phrase, borrowed, originalSeed;
  try {
    await vault.initialize(password);
    await vault.unlock(password);
    vault.withSeed((seed) => {
      originalSeed = Buffer.from(seed);
    });
    vault.lock();
    const movedRoot = `${profile.userDataDir}-moved`;
    fs.renameSync(profile.userDataDir, movedRoot);
    const moved = createVault({ profile: readVaultProfile(movedRoot) });
    await moved.exportRecovery(password, (value) => {
      borrowed = value;
      phrase = Buffer.from(value);
    });
    expect(borrowed.every((byte) => byte === 0)).toBe(true);
    await restored.vault.initialize(restored.password, phrase);
    await restored.vault.unlock(restored.password);
    restored.vault.withSeed((seed) => {
      expect(seed.equals(originalSeed)).toBe(true);
    });
    const first = JSON.parse(
      fs.readFileSync(path.join(movedRoot, "reference-vault.json")),
    );
    const second = JSON.parse(
      fs.readFileSync(
        path.join(restored.profile.userDataDir, "reference-vault.json"),
      ),
    );
    expect(first.vaultId).not.toBe(second.vaultId);
    expect(second.profileId).toBe(restored.profile.id);
    expect(fs.readdirSync(restored.profile.userDataDir).sort()).toEqual([
      "reference-inventory.json",
      "reference-vault.json",
    ]);
    moved.lock();
  } finally {
    phrase?.fill(0);
    originalSeed?.fill(0);
    password.fill(0);
    restored.password.fill(0);
    vault.lock();
    restored.vault.lock();
  }
});
test("invalid recovery phrase does not write or wedge a fresh vault; recovery requires password", async () => {
  const { profile, password, vault } = setup();
  const consume = jest.fn();
  try {
    await expect(
      vault.initialize(password, Buffer.from("invalid public recovery phrase")),
    ).rejects.toThrow();
    expect(fs.readdirSync(profile.userDataDir)).toEqual([]);
    await vault.initialize(password);
    await expect(
      vault.exportRecovery(Buffer.from("wrong public password"), consume),
    ).rejects.toThrow();
    expect(consume).not.toHaveBeenCalled();
    await vault.unlock(password);
  } finally {
    password.fill(0);
    vault.lock();
  }
});
