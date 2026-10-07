const { AbiCoder, Interface, keccak256 } = require("ethers");
const api = require("../data.cjs");
const {
  TRANSACT_ABI,
  BOUND_PARAMS,
  validateRailgunPrivateTransaction,
} = require("../src/data/railgun-private-policy");
const { vectors } = require("./fixtures/private-capsule-vectors.json");

const abi = new Interface([TRANSACT_ABI]);
const coder = AbiCoder.defaultAbiCoder();
const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const clone = (value) => JSON.parse(JSON.stringify(value));
const bytes = (hex) => (hex.length - 2) / 2;
const maximumBytes = {
  "self-transfer": 1892,
  "foreign-transfer": 1892,
  "full-unshield": 1028,
  "partial-unshield": 1924,
};

function editTransaction(capsule, edit) {
  const tx = abi
    .decodeFunctionData("transact", capsule.preparation.transaction.data)[0][0]
    .toArray(true);
  edit(tx);
  capsule.preparation.transaction.data = abi.encodeFunctionData("transact", [
    [tx],
  ]);
  capsule.preparation.expected.boundParamsHash =
    "0x" +
    (BigInt(keccak256(coder.encode([BOUND_PARAMS], [tx[4]]))) % FIELD)
      .toString(16)
      .padStart(64, "0");
  return capsule;
}

function maximum(v) {
  return editTransaction(clone(v.input), (tx) => {
    for (const ciphertext of tx[4][6]) {
      ciphertext[3] = "0x" + "ab".repeat(256);
      ciphertext[4] = "0x" + "cd".repeat(256);
    }
  });
}

function refused(input, reader = api) {
  for (const run of [
    reader.normalizeRailgunPrivateCapsule,
    reader.digestRailgunPrivateCapsule,
  ]) {
    let error;
    try {
      run(input);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("RAILGUN_CAPSULE_DATA_REFUSED");
    expect(error.message).toBe("Railgun private capsule data refused");
    expect(Object.getOwnPropertyNames(error).sort()).toEqual([
      "code",
      "message",
      "stack",
    ]);
    expect(error.stack).not.toContain("account-linked-secret");
    expect(JSON.stringify(error)).not.toContain("account-linked-secret");
  }
}

function footprint(value, depth = 0) {
  const result = {
    nodes: 1,
    stringBytes: typeof value === "string" ? Buffer.byteLength(value) : 0,
    depth,
  };
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const child = footprint(item, depth + 1);
      result.nodes += child.nodes;
      result.stringBytes += child.stringBytes;
      result.depth = Math.max(result.depth, child.depth);
    }
  }
  return result;
}

test.each(vectors)(
  "$name largest supported dynamic fields stay within every plain-data limit",
  (v) => {
    const input = maximum(v);
    expect(bytes(input.preparation.transaction.data)).toBe(
      maximumBytes[v.name],
    );
    expect(bytes(input.preparation.transaction.data)).toBeLessThanOrEqual(4096);
    const size = footprint(input);
    expect(size.stringBytes).toBeLessThan(65536);
    expect(size.nodes).toBeLessThan(4096);
    expect(size.depth).toBeLessThan(16);
    const normalized = api.normalizeRailgunPrivateCapsule(input);
    expect(normalized.preparation.transaction.data).toBe(
      input.preparation.transaction.data,
    );
    expect(api.digestRailgunPrivateCapsule(input)).toMatch(/^[a-f0-9]{64}$/);
    input.preparation.transaction.data = "account-linked-secret";
    expect(normalized.preparation.transaction.data).not.toBe(
      input.preparation.transaction.data,
    );
  },
);

test.each(["self-transfer", "foreign-transfer", "partial-unshield"])(
  "%s rejects annotation or memo cap+1 despite valid ABI and recomputed bound hash",
  (name) => {
    const v = vectors.find((item) => item.name === name);
    for (const index of [3, 4]) {
      const input = editTransaction(maximum(v), (tx) => {
        tx[4][6][0][index] += "aa";
      });
      expect(bytes(input.preparation.transaction.data)).toBe(
        maximumBytes[name] + 32,
      );
      expect(() =>
        abi.decodeFunctionData("transact", input.preparation.transaction.data),
      ).not.toThrow();
      refused(input);
    }
  },
);

test("4096-byte calldata ceiling refuses before decode, independently of dynamic-field policy", () => {
  const make = (length) =>
    editTransaction(clone(vectors[0].input), (tx) => {
      tx[4][6][0][3] = "0x" + "ab".repeat(length);
      tx[4][6][0][4] = "0x";
    });
  const below = make(2688),
    above = make(2720);
  // ABI is a four-byte selector plus whole 32-byte words: exactly 4096 cannot occur.
  expect(bytes(below.preparation.transaction.data)).toBe(4068);
  expect(bytes(above.preparation.transaction.data)).toBe(4100);
  for (const input of [below, above])
    expect(() =>
      abi.decodeFunctionData("transact", input.preparation.transaction.data),
    ).not.toThrow();
  const decode = jest.spyOn(Interface.prototype, "decodeFunctionData");
  try {
    refused(below); // Reaches ABI decode, then fails the annotation cap.
    expect(decode).toHaveBeenCalledTimes(2);
    decode.mockClear();
    refused(above); // Rejected by the outer calldata ceiling before ABI decode.
    expect(decode).not.toHaveBeenCalled();
  } finally {
    decode.mockRestore();
  }
});

test.each(vectors)(
  "$name nonzero proof coordinates do not enlarge the fixed-width ABI",
  (v) => {
    const zero = maximum(v);
    const nonzero = editTransaction(clone(zero), (tx) => {
      const word = (1n << 256n) - 1n;
      tx[0] = [
        [word, word],
        [
          [word, word],
          [word, word],
        ],
        [word, word],
      ];
    });
    expect(bytes(nonzero.preparation.transaction.data)).toBe(
      bytes(zero.preparation.transaction.data),
    );
    expect(nonzero.preparation.expected.boundParamsHash).toBe(
      zero.preparation.expected.boundParamsHash,
    );
    const checked = validateRailgunPrivateTransaction(
      nonzero.preparation.transaction,
      nonzero.preparation.expected,
    );
    expect(checked.proofVerified).toBe(false);
    // Fixed-width nonzero coordinates are structural data, not genuine proofs;
    // persisted preparation capsules only support the zero-proof signing intent.
    refused(nonzero);
  },
);

test("ethers decode failure cannot expose raw input or a nested error cause", () => {
  const hostile = Object.assign(Error("account-linked-secret"), {
    code: "BAD_DATA",
    value: vectors[0].input,
    cause: Error("account-linked-secret"),
  });
  const decode = jest
    .spyOn(Interface.prototype, "decodeFunctionData")
    .mockImplementation(() => {
      throw hostile;
    });
  try {
    refused(clone(vectors[0].input));
    expect(decode).toHaveBeenCalledTimes(2);
  } finally {
    decode.mockRestore();
  }
});

test("actual malformed ABI is refused without returning ethers error metadata", () => {
  const input = clone(vectors[0].input);
  input.preparation.transaction.data =
    input.preparation.transaction.data.slice(0, 10) + "ff".repeat(32);
  expect(() =>
    abi.decodeFunctionData("transact", input.preparation.transaction.data),
  ).toThrow();
  refused(input);
});

test.each(["position", "tree"])(
  "negative-zero %s is refused explicitly before canonicalization",
  (key) => {
    const input = clone(vectors[0].input);
    input.selection[key] = -0;
    if (key === "tree") input.preparation.expected.tree = -0;
    expect(Object.is(input.selection[key], -0)).toBe(true);
    refused(input);
  },
);

// These isolated controls exercise only the public copy gate. The core is a
// labeled identity seam, so acceptance here is not capsule/schema acceptance.
function withCopyGate(run) {
  const reached = jest.fn((value) => value);
  jest.doMock("../src/data/railgun-private-capsule", () => ({
    normalizeRailgunPrivateCapsule: reached,
    digestRailgunPrivateCapsule: reached,
  }));
  try {
    jest.isolateModules(() => {
      run(require("../src/data/index"), reached);
    });
  } finally {
    jest.dontMock("../src/data/railgun-private-capsule");
  }
}

test("copy gate counts UTF-8 string bytes, accepting 65536 and refusing 65537 before core", () => {
  withCopyGate((reader, reached) => {
    const maximum = "é".repeat(32768);
    expect(reader.normalizeRailgunPrivateCapsule(maximum)).toBe(maximum);
    expect(reached).toHaveBeenCalledTimes(1);
    refused(maximum + "a", reader);
    expect(reached).toHaveBeenCalledTimes(1);
  });
});

test("copy gate accepts 4096 total nodes and refuses 4097 before core", () => {
  withCopyGate((reader, reached) => {
    const maximum = Array(4095).fill(null);
    expect(reader.normalizeRailgunPrivateCapsule(maximum)).toEqual(maximum);
    expect(reached).toHaveBeenCalledTimes(1);
    refused(Array(4096).fill(null), reader);
    expect(reached).toHaveBeenCalledTimes(1);
  });
});

test("copy gate accepts depth16 and refuses depth17 and negative zero before core", () => {
  withCopyGate((reader, reached) => {
    let maximum = 1;
    for (let depth = 0; depth < 16; depth++) maximum = { child: maximum };
    expect(reader.normalizeRailgunPrivateCapsule(maximum)).toEqual(maximum);
    expect(reached).toHaveBeenCalledTimes(1);
    refused({ child: maximum }, reader);
    refused(-0, reader);
    expect(reached).toHaveBeenCalledTimes(1);
  });
});
