const { createHash } = require("crypto");
const { execFileSync } = require("child_process");
const path = require("path");
const api = require("../data.cjs");
const { vectors } = require("./fixtures/private-capsule-vectors.json");
const clone = (value) => JSON.parse(JSON.stringify(value));
const normalize = api.normalizeRailgunPrivateCapsule;
const digest = api.digestRailgunPrivateCapsule;

function refused(input) {
  for (const run of [normalize, digest]) {
    let error;
    try {
      run(input);
    } catch (value) {
      error = value;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("RAILGUN_CAPSULE_DATA_REFUSED");
    expect(error.message).toBe("Railgun private capsule data refused");
    expect(Object.getOwnPropertyNames(error).sort()).toEqual([
      "code",
      "message",
      "stack",
    ]);
    expect(JSON.stringify(error)).not.toContain("account-linked-secret");
  }
}

test.each(vectors)(
  "$name retains frozen Freedom bytes and digests independently",
  (v) => {
    const input = clone(v.input);
    const result = normalize(input);
    expect(JSON.stringify(result)).toBe(v.canonical);
    expect(
      createHash("sha256").update(JSON.stringify(result)).digest("hex"),
    ).toBe(v.canonicalSha256);
    expect(digest(input)).toBe(v.digest);
    const frozen = (value) => {
      if (!value || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const item of Object.values(value)) frozen(item);
    };
    frozen(result);
    input.pathElements[0] = "account-linked-secret";
    expect(JSON.stringify(result)).toBe(v.canonical);
    expect(result).not.toHaveProperty("spendingEnabled");
    expect(result).not.toHaveProperty("receipt");
  },
);

test.each([
  (v) => {
    v.version = 3;
  },
  (v) => {
    v.selection.kind = "unknown";
  },
  (v) => {
    v.selection.recipientRelationship = "unknown";
  },
  (v) => {
    v.preparation.transaction.chainId = 1;
  },
  (v) => {
    v.preparation.transaction.value = "1";
  },
  (v) => {
    v.preparation.amount = "10000000000000001";
  },
  (v) => {
    v.preparation.transaction.data += "00";
  },
  (v) => {
    v.preparation.expected.nullifier = "0x" + "ff".repeat(32);
  },
  (v) => {
    v.pathElements.pop();
  },
  (v) => {
    v.extra = "account-linked-secret";
  },
  (v) => {
    v.signature = "account-linked-secret";
  },
  (v) => {
    v.engineSha256 = "account-linked-secret";
  },
])(
  "refuses unsupported or mismatched capsule mutation %# with a closed error",
  (change) => {
    const input = clone(vectors[0].input);
    change(input);
    refused(input);
  },
);

test("a foreign marker is bound by the digest but does not prove a recipient relationship", () => {
  const v = vectors.find((v) => v.name === "foreign-transfer");
  const input = clone(v.input);
  delete input.selection.recipientRelationship;
  expect(digest(input)).not.toBe(v.digest);
  expect(api.railgunPrivateCapsuleCompatibility.ownershipVerified).toBe(false);
  expect(api.railgunPrivateCapsuleCompatibility.proofVerified).toBe(false);
  expect(api.railgunPrivateCapsuleCompatibility.spendingEnabled).toBe(false);
});

test("recorded engine identity is provenance, not a current-engine or downgrade guarantee", () => {
  const input = clone(vectors[0].input);
  input.engineSha256 = "a".repeat(64);
  expect(normalize(input).engineSha256).toBe(input.engineSha256);
  expect(digest(input)).not.toBe(vectors[0].digest);
});

test("never invokes getters, toJSON, inherited methods or proxy traps", () => {
  const call = jest.fn(() => {
    throw Error("account-linked-secret");
  });
  const getter = clone(vectors[0].input);
  Object.defineProperty(getter.preparation, "transaction", {
    enumerable: true,
    get: call,
  });
  refused(getter);
  const json = clone(vectors[0].input);
  json.toJSON = call;
  refused(json);
  const inherited = Object.create({ toJSON: call });
  Object.assign(inherited, vectors[0].input);
  refused(inherited);
  const proxy = new Proxy(vectors[0].input, {
    get: call,
    ownKeys: call,
    getPrototypeOf: call,
  });
  refused(proxy);
  expect(call).not.toHaveBeenCalled();
});

test.each([
  "cycle",
  "sparse",
  "symbol",
  "nonenumerable",
  "huge",
  "deep",
  "undefined",
  "null-prototype",
])("rejects non-plain or excessive %s data", (kind) => {
  const input = clone(vectors[0].input);
  if (kind === "cycle") input.extra = input;
  if (kind === "sparse") delete input.pathElements[0];
  if (kind === "symbol") input[Symbol("secret")] = "account-linked-secret";
  if (kind === "nonenumerable")
    Object.defineProperty(input, "secret", { value: "account-linked-secret" });
  if (kind === "huge") input.extra = "x".repeat(65537);
  if (kind === "deep") {
    let next = input;
    for (let i = 0; i < 20; i++) next = next.extra = {};
  }
  if (kind === "undefined") input.extra = undefined;
  if (kind === "null-prototype") Object.setPrototypeOf(input, null);
  refused(input);
});

test("Node consumes both package entrypoints without any Freedom import", () => {
  const output = execFileSync(
    process.execPath,
    [path.join(__dirname, "consumer/private-data.mjs")],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      timeout: 30000,
    },
  );
  expect(JSON.parse(output)).toEqual({
    vectors: 4,
    sameFunctions: true,
    internalExportRefused: true,
  });
});
