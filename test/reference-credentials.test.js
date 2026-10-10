"use strict";
const { pbkdf2Sync } = require("node:crypto");
const {
  createContextHost,
} = require("../examples/reference-wallet/host/context.cjs");
const {
  checkCredentialRow,
  checkStorageRootDrain,
} = require("../tools/conformance/credentials.cjs");
const vectors = require("./conformance/credential-vectors.json");
jest.mock("../examples/reference-wallet/host/inventory.cjs", () => ({
  ...jest.requireActual("../examples/reference-wallet/host/inventory.cjs"),
  // Public vectors name fictitious paths. Actual encrypted inventory is tested
  // separately, and in the combined vault/credential integration case.
  createInventoryGuard: jest.fn(() => Object.freeze({ fixtureGuard: true })),
}));
const {
  createCredentialHost,
} = require("../examples/reference-wallet/host/credentials.cjs");
function setup(row = vectors.rows[0]) {
  const context = createContextHost();
  let profile = row.profile,
    vaultSession = new AbortController();
  const vault = {
    profile: Object.freeze({ ...row.profile }),
    currentSession: () => vaultSession.signal,
    lock: () => vaultSession.abort(),
    withSeed(consume) {
      const seed = pbkdf2Sync(vectors.mnemonic, "mnemonic", 2048, 64, "sha512");
      try {
        consume(seed);
      } finally {
        seed.fill(0);
      }
    },
  };
  const host = createCredentialHost({
    context,
    vault,
    profiles: { getActiveProfile: () => profile },
  });
  function createContext(row, purpose) {
    const requestLifetime = new AbortController();
    const scope = context.createPrivacyScope({
      profileId: row.profileId,
      signal: vaultSession.signal,
    });
    const handle = scope.getContext({
      kind: "private-account",
      principal: `railgun:${row.accountIndex}`,
      chainId: 11155111,
      protocol: "railgun",
      deployment: "sepolia",
      role: purpose === "storage-root" ? "storage" : "keystore",
      operation:
        purpose === "storage-root"
          ? "railgun-account-enrollment-v1"
          : purpose === "viewing"
            ? "viewing-identity"
            : purpose,
    });
    return {
      request: {
        handle,
        vaultSession: vaultSession.signal,
        accountIndex: row.accountIndex,
        purpose,
        signal: requestLifetime.signal,
      },
      assertProfileGuard: (guard) =>
        expect(guard).toEqual({ fixtureGuard: true }),
      close() {
        requestLifetime.abort();
        scope.close();
      },
      revokeRequest: () => requestLifetime.abort(),
      revokeContext: () => scope.close(),
    };
  }
  return {
    host,
    createContext,
    vault,
    replaceVault: () => {
      vaultSession = new AbortController();
    },
    changeProfile: () => {
      profile = vectors.rows[3].profile;
    },
  };
}
test.each(vectors.rows)(
  "all purpose vectors for $profile.id / $accountIndex",
  async (row) => {
    const fixture = setup(row);
    expect(await checkCredentialRow({ ...fixture, row })).toHaveLength(4);
  },
);
test("revoked root loan drains only after its original callback settles", async () => {
  const fixture = setup();
  expect(
    await checkStorageRootDrain({ ...fixture, row: vectors.rows[0] }),
  ).toHaveLength(1);
});
test.each(["replaceVault", "changeProfile"])(
  "%s refuses before key delivery",
  async (action) => {
    const fixture = setup(),
      loan = fixture.createContext(vectors.rows[0], "viewing"),
      consume = jest.fn();
    fixture[action]();
    try {
      await expect(
        fixture.host.withMaterial(loan.request, consume),
      ).rejects.toThrow();
      expect(consume).not.toHaveBeenCalled();
    } finally {
      loan.close();
    }
  },
);
test("request accessors and proxies refuse without invoking traps", async () => {
  const fixture = setup(),
    loan = fixture.createContext(vectors.rows[0], "viewing"),
    trap = jest.fn();
  const accessor = { ...loan.request };
  Object.defineProperty(accessor, "purpose", { get: trap });
  try {
    await expect(
      fixture.host.withMaterial(accessor, async () => {}),
    ).rejects.toThrow();
    await expect(
      fixture.host.withMaterial(
        new Proxy(loan.request, { ownKeys: trap }),
        async () => {},
      ),
    ).rejects.toThrow();
    expect(trap).not.toHaveBeenCalled();
  } finally {
    loan.close();
  }
});
test("foreign context and wrong purpose cannot borrow", async () => {
  const fixture = setup(),
    loan = fixture.createContext(vectors.rows[0], "viewing"),
    consume = jest.fn();
  try {
    await expect(
      fixture.host.withMaterial({ ...loan.request, handle: {} }, consume),
    ).rejects.toThrow();
    await expect(
      fixture.host.withMaterial(
        { ...loan.request, purpose: "spending-sign" },
        consume,
      ),
    ).rejects.toThrow();
    expect(consume).not.toHaveBeenCalled();
  } finally {
    loan.close();
  }
});
test.each(["revokeRequest", "revokeContext"])(
  "one-sided root abort (%s) is not successful drain",
  async (action) => {
    const fixture = setup(),
      loan = fixture.createContext(vectors.rows[0], "storage-root");
    let release, borrowed;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const work = fixture.host.withMaterial(loan.request, (value) => {
      borrowed = value.bytes;
      return pending;
    });
    loan[action]();
    expect(borrowed.every((byte) => byte === 0)).toBe(true);
    release();
    try {
      await expect(work).rejects.toThrow();
    } finally {
      loan.close();
    }
  },
);
test("thenable callbacks are never adopted and quarantine further loans", async () => {
  const fixture = setup(),
    loan = fixture.createContext(vectors.rows[0], "viewing"),
    then = jest.fn();
  let borrowed;
  try {
    await expect(
      fixture.host.withMaterial(loan.request, (value) => {
        borrowed = value.bytes;
        return { then };
      }),
    ).rejects.toThrow();
    expect(then).not.toHaveBeenCalled();
    expect(borrowed.every((byte) => byte === 0)).toBe(true);
    expect(() => fixture.host.currentSession()).toThrow();
  } finally {
    loan.close();
  }
});
test("callback rejection is retained, with wiped bytes", async () => {
  const fixture = setup(),
    loan = fixture.createContext(vectors.rows[0], "spending-sign");
  const error = Error("original");
  let borrowed;
  try {
    await expect(
      fixture.host.withMaterial(loan.request, (value) => {
        borrowed = value.bytes;
        return Promise.reject(error);
      }),
    ).rejects.toBe(error);
    expect(borrowed.every((byte) => byte === 0)).toBe(true);
  } finally {
    loan.close();
  }
});
