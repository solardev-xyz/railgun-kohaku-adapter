/** Harness controls only. Real host conformance lives in the adopting wallet tests. */
"use strict";
const {
  checkCredentialRow,
  checkStorageRootDrain,
  PURPOSES,
} = require("../tools/conformance/credentials.cjs");
const vectors = require("./conformance/credential-vectors.json");
function fixture(change = {}) {
  const vault = new AbortController(),
    closed = [];
  const host = {
    currentSession: () => vault.signal,
    async withMaterial(request, consume) {
      const expected =
        request.purpose === "viewing"
          ? vectors.rows[0].viewingHex
          : request.purpose === "storage-root"
            ? vectors.rows[0].storageRootHex
            : vectors.rows[0].spendingHex;
      const bytes = new Uint8Array(32);
      bytes.set(Buffer.from(expected, "hex"));
      if (change.wrongBytes) bytes[0] ^= 1;
      const wipe = () => {
        if (!change.noAbortWipe) bytes.fill(0);
      };
      request.signal.addEventListener("abort", wipe, { once: true });
      try {
        const original = consume(
          Object.freeze(
            request.purpose === "storage-root"
              ? { bytes, profileGuard: guard }
              : { bytes },
          ),
        );
        if (!change.early)
          await new Promise((resolve, reject) =>
            Promise.prototype.then.call(original, resolve, reject),
          );
        if (change.refuseDrain && request.signal.aborted)
          throw Error("revoked drain");
      } finally {
        request.signal.removeEventListener("abort", wipe);
        if (!change.noWipe) bytes.fill(0);
      }
    },
  };
  const guard = Object.freeze({});
  const createContext = (row, purpose) => {
    const operation = new AbortController();
    let done = false;
    return {
      request: {
        handle: Object.freeze({}),
        vaultSession: vault.signal,
        accountIndex: row.accountIndex,
        purpose,
        signal: operation.signal,
      },
      assertProfileGuard: (value) => {
        if (value !== guard) throw Error("foreign guard");
      },
      close: () => {
        operation.abort();
        if (!done) closed.push(purpose);
        done = true;
      },
    };
  };
  return { host, createContext, closed, row: vectors.rows[0] };
}
test("normative public fixture pin and account/profile domain coverage", () => {
  const fs = require("fs"),
    { createHash } = require("crypto");
  expect(
    createHash("sha256")
      .update(
        fs.readFileSync(
          require.resolve("./conformance/credential-vectors.json"),
        ),
      )
      .digest("hex"),
  ).toBe("b8a307b09928447bded772da46de8826e597ce013d80e4a51458a1d9946cd1af");
  expect(vectors.rows.map((row) => row.accountIndex)).toEqual([
    0, 1, 65535, 0, 1, 65535,
  ]);
  for (let i = 0; i < 3; i++) {
    expect(vectors.rows[i].spendingHex).toBe(vectors.rows[i + 3].spendingHex);
    expect(vectors.rows[i].viewingHex).toBe(vectors.rows[i + 3].viewingHex);
    expect(vectors.rows[i].storageRootHex).not.toBe(
      vectors.rows[i + 3].storageRootHex,
    );
  }
});
test("checker retains original callbacks, accepts all four purposes and closes contexts", async () => {
  const f = fixture();
  const result = await checkCredentialRow(f);
  expect(result.map((row) => row.purpose)).toEqual(PURPOSES);
  expect(f.closed).toEqual(PURPOSES);
});
test.each(["wrongBytes", "noWipe", "early"])(
  "checker distinguishes a nonconforming %s host",
  async (kind) => {
    const f = fixture({ [kind]: true });
    await expect(checkCredentialRow(f)).rejects.toThrow();
    expect(f.closed).toEqual(["spending-public"]);
  },
);

test("storage-root revocation wipes immediately and permits only original void drain", async () => {
  const f = fixture();
  await expect(checkStorageRootDrain(f)).resolves.toHaveLength(1);
  expect(f.closed).toEqual(["storage-root"]);
});
test.each(["noAbortWipe", "refuseDrain", "early"])(
  "root-drain checker rejects %s",
  async (kind) => {
    await expect(
      checkStorageRootDrain(fixture({ [kind]: true })),
    ).rejects.toThrow();
  },
);
