"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  createContextHost,
} = require("../examples/reference-wallet/host/context.cjs");
const { createVault } = require("../examples/reference-wallet/host/vault.cjs");
const {
  createStorageHost,
} = require("../examples/reference-wallet/host/storage.cjs");
const {
  profileId,
} = require("../examples/reference-wallet/host/inventory.cjs");
const {
  createLeaseHost,
} = require("../examples/reference-wallet/host/leases.cjs");
const {
  createJournalHost,
} = require("../examples/reference-wallet/host/journal.cjs");
const {
  transactionIntent,
} = require("../examples/reference-wallet/host/intent.cjs");
const {
  fixture: transactionFixture,
} = require("./fixtures/railgun-journal-transact-data");
async function fixture(existing, wrapStorage = (storage) => storage) {
  const profile =
    existing ||
    Object.freeze({
      id: "journal-fixture",
      userDataDir: fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "reference-journal-")),
      ),
    });
  const vault = createVault({ profile }),
    password = Buffer.from("public journal fixture password");
  try {
    if (!existing) await vault.initialize(password);
    await vault.unlock(password);
  } finally {
    password.fill(0);
  }
  const context = createContextHost();
  const scope = context.createPrivacyScope({
    profileId: profileId(profile),
    signal: vault.currentSession(),
  });
  const handle = scope.getContext({
    kind: "public-address",
    principal: `0x${"1".repeat(40)}`,
    chainId: 11155111,
    role: "transaction-rpc",
  });
  const storage = wrapStorage(createStorageHost(context), { vault, context }),
    leases = createLeaseHost(context);
  const host = createJournalHost({
    context,
    storage,
    leases,
    profiles: { getActiveProfile: () => profile },
    vault,
  });
  const journal = host.getPrivateSubmissionJournal(handle);
  return {
    profile,
    vault,
    context,
    scope,
    handle,
    host,
    journal,
    leases,
    storage,
    close: () => {
      scope.close();
      vault.lock();
    },
  };
}
const hash = `0x${"a".repeat(64)}`;
function intent() {
  return transactionIntent(
    "railgun-transact",
    transactionFixture(false).transaction(),
  );
}
test("journal cold reopen preserves unresolved attempts; snapshots never initialize", async () => {
  const f = await fixture();
  try {
    await expect(
      f.host.readExistingPrivateSubmissionSnapshot(f.handle),
    ).rejects.toThrow();
    expect(fs.readdirSync(f.profile.userDataDir).sort()).toEqual([
      "reference-inventory.json",
      "reference-vault.json",
    ]);
    await f.journal.initialize();
    await f.journal.begin(hash, 0, intent());
    const original = await f.host.readExistingPrivateSubmissionSnapshot(
      f.handle,
    );
    expect(original.records).toHaveLength(1);
    expect(Object.isFrozen(original.records[0].intent)).toBe(true);
    expect(original.records[0]).toMatchObject({
      hash,
      nonce: 0,
      state: "attempted",
    });
    f.close();
    const next = await fixture(f.profile);
    try {
      expect(
        await next.host.readExistingPrivateSubmissionSnapshot(next.handle),
      ).toEqual(original);
      await expect(next.journal.assertCanSubmit()).rejects.toMatchObject({
        code: "PRIVATE_SUBMISSION_UNRESOLVED",
      });
      await expect(next.journal.selectNonce(1)).rejects.toMatchObject({
        code: "PRIVATE_SUBMISSION_UNRESOLVED",
      });
      await expect(next.journal.begin(hash, 0, intent())).rejects.toMatchObject(
        { code: "PRIVATE_BROADCAST_ALREADY_ATTEMPTED" },
      );
      await expect(
        next.journal.begin(`0x${"b".repeat(64)}`, 1, intent()),
      ).rejects.toMatchObject({ code: "PRIVATE_RAILGUN_NULLIFIER_RESERVED" });
    } finally {
      next.close();
    }
  } finally {
    f.close();
  }
});
test("matched RPC observation is insufficient to authorize Railgun resolution", async () => {
  const f = await fixture();
  try {
    await f.journal.initialize();
    await f.journal.begin(hash, 0, intent());
    const observation = {
      status: "included",
      trust: "unverified",
      observedAt: Date.now(),
      confirmations: 12,
      blockNumber: 4,
      blockHash: `0x${"c".repeat(64)}`,
    };
    const record = await f.journal.observe(hash, observation, 0);
    await expect(
      f.journal.resolve(hash, record.revision, 12, {}),
    ).rejects.toThrow();
    await expect(f.journal.observe(hash, observation, 0)).rejects.toMatchObject(
      { code: "PRIVATE_RECONCILIATION_STALE" },
    );
    await expect(f.journal.assertCanSubmit()).rejects.toMatchObject({
      code: "PRIVATE_SUBMISSION_UNRESOLVED",
    });
    expect((await f.journal.list())[0].resolution).toBeUndefined();
  } finally {
    f.close();
  }
});
test("guarded read-only snapshot cannot adopt an unregistered encrypted journal", async () => {
  const f = await fixture();
  try {
    const marker = path.join(f.profile.userDataDir, "reference-inventory.json");
    const before = fs.readFileSync(marker);
    await f.journal.initialize();
    const registered = fs.readFileSync(marker);
    fs.writeFileSync(marker, before);
    await expect(
      f.host.readExistingPrivateSubmissionSnapshot(f.handle),
    ).rejects.toMatchObject({ code: "PRIVATE_PROFILE_INVENTORY_INVALID" });
    expect(fs.readFileSync(marker).equals(before)).toBe(true);
    // Restore the authenticated inventory after the deliberate test rollback.
    fs.writeFileSync(marker, registered);
    expect(
      await f.host.readExistingPrivateSubmissionSnapshot(f.handle),
    ).toEqual({ records: [], archive: [] });
  } finally {
    f.close();
  }
});
test("leases serialize the same account across contexts and release does not revive one", async () => {
  const f = await fixture();
  try {
    const options = {
      chainId: 11155111,
      from: `0x${"1".repeat(40)}`,
      privacyContext: f.handle,
    };
    const lease = f.leases.acquireSubmissionLease(options);
    expect(() => f.leases.acquireSubmissionLease(options)).toThrow(
      expect.objectContaining({ code: "PRIVATE_SEND_IN_PROGRESS" }),
    );
    lease.release();
    expect(() => lease.assertActive()).toThrow();
    const next = f.leases.acquireSubmissionLease(options);
    next.release();
  } finally {
    f.close();
  }
});
test("vault lock revokes journal access even when the record already exists", async () => {
  const f = await fixture();
  try {
    await f.journal.initialize();
    f.vault.lock();
    await expect(f.journal.list()).rejects.toThrow();
    await expect(
      f.host.readExistingPrivateSubmissionSnapshot(f.handle),
    ).rejects.toThrow();
  } finally {
    f.close();
  }
});
test("locking after a durable begin returns uncertainty and preserves the attempt on cold reopen", async () => {
  let lockAfterWrite = false;
  const f = await fixture(undefined, (storage, { vault }) => ({
    ...storage,
    createPrivacyStorage(options) {
      const store = storage.createPrivacyStorage(options);
      return {
        ...store,
        async update(...args) {
          const result = await store.update(...args);
          if (lockAfterWrite) vault.lock();
          return result;
        },
      };
    },
  }));
  try {
    await f.journal.initialize();
    lockAfterWrite = true;
    await expect(f.journal.begin(hash, 0, intent())).rejects.toMatchObject({
      code: "PRIVATE_BROADCAST_UNCERTAIN",
      transactionHash: hash,
    });
    const reopened = await fixture(f.profile);
    try {
      expect((await reopened.journal.list())[0]).toMatchObject({
        hash,
        state: "attempted",
      });
      await expect(reopened.journal.assertCanSubmit()).rejects.toMatchObject({
        code: "PRIVATE_SUBMISSION_UNRESOLVED",
      });
    } finally {
      reopened.close();
    }
  } finally {
    f.close();
  }
});
test("each existing-only read revokes its temporary storage context immediately", async () => {
  const stores = [];
  const f = await fixture(undefined, (storage, { context }) => ({
    ...storage,
    createPrivacyStorage(options) {
      const store = storage.createPrivacyStorage(options);
      stores.push({
        store,
        handle: options.handle,
        signal: context.getPrivacyContext(options.handle).signal,
      });
      return store;
    },
  }));
  try {
    await f.journal.initialize();
    for (let i = 0; i < 3; i++) {
      await f.host.readExistingPrivateSubmissionSnapshot(f.handle);
      const temporary = stores.at(-1);
      expect(temporary.handle).not.toBe(f.handle);
      expect(temporary.signal.aborted).toBe(true);
      expect(
        require("node:events").getEventListeners(temporary.signal, "abort"),
      ).toHaveLength(0);
      await expect(temporary.store.get("any")).rejects.toThrow();
      expect(() => f.context.getPrivacyContext(temporary.handle)).toThrow();
    }
    expect(stores[0].signal.aborted).toBe(false);
    expect(await f.journal.list()).toEqual([]);
  } finally {
    f.close();
  }
});
