/** Restricted persisted-data reader. No stores, keys, engine, RPC or authority. */
const { isProxy } = require("util").types;
const core = require("./railgun-private-capsule");
const pins = require("../railgun-shield-pins.json");

const railgunPrivateCapsuleCompatibility = Object.freeze({
  schema: "freedom-railgun-private-capsule",
  chainId: pins.chainId,
  proxy: pins.proxy,
  policy: "freedom-sepolia-qualification",
  maxQualificationAmount: pins.maxQualificationAmount,
  digestDomains: Object.freeze([
    "freedom:railgun:private-capsule-v1\0",
    "freedom:railgun:private-capsule-v2\0",
  ]),
  unknownFields: "refused",
  maxCalldataBytes: 4096,
  supported: Object.freeze([
    Object.freeze({
      version: 1,
      kind: "railgun-private-transfer",
      recipientRelationship: "self",
    }),
    Object.freeze({
      version: 1,
      kind: "railgun-private-transfer",
      recipientRelationship: "foreign",
    }),
    Object.freeze({ version: 1, kind: "railgun-token-unshield" }),
    Object.freeze({ version: 2, kind: "railgun-partial-unshield" }),
  ]),
  engineBinding: "recorded-provenance-only",
  proofVerified: false,
  ownershipVerified: false,
  spendingEnabled: false,
});

// Read own data descriptors, not getters, toJSON methods or proxy traps. This
// narrows the public API to bounded plain data before legacy structural checks.
function copyData(input) {
  const ancestors = new Set();
  let nodes = 0;
  let stringBytes = 0;
  const refuse = () => {
    throw Error("Invalid data");
  };
  function copy(value, depth) {
    if (++nodes > 4096 || depth > 16) refuse();
    if (typeof value === "string") {
      stringBytes += Buffer.byteLength(value, "utf8");
      if (stringBytes > 65536) refuse();
      return value;
    }
    if (value === null || typeof value === "boolean") return value;
    if (
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      !Object.is(value, -0)
    )
      return value;
    if (
      !value ||
      typeof value !== "object" ||
      isProxy(value) ||
      ancestors.has(value)
    )
      refuse();
    const array = Array.isArray(value);
    if (
      Object.getPrototypeOf(value) !==
      (array ? Array.prototype : Object.prototype)
    )
      refuse();
    const keys = Reflect.ownKeys(value);
    if (keys.length > 4096 || keys.some((key) => typeof key !== "string"))
      refuse();
    const length = array
      ? Object.getOwnPropertyDescriptor(value, "length").value
      : 0;
    if (array && (length > 4096 || keys.length !== length + 1)) refuse();
    const result = array ? [] : {};
    ancestors.add(value);
    for (const key of keys) {
      if (array && key === "length") continue;
      if (array && (!/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))
        refuse();
      if (["__proto__", "prototype", "constructor"].includes(key)) refuse();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !Object.hasOwn(descriptor, "value") ||
        !descriptor.enumerable
      )
        refuse();
      result[key] = copy(descriptor.value, depth + 1);
    }
    ancestors.delete(value);
    return Object.freeze(result);
  }
  return copy(input, 0);
}

function read(method, input) {
  try {
    return core[method](copyData(input));
  } catch {
    // No raw assertion values, account-linked inputs or nested cause escapes.
    throw Object.assign(new Error("Railgun private capsule data refused"), {
      code: "RAILGUN_CAPSULE_DATA_REFUSED",
    });
  }
}

function normalizeRailgunPrivateCapsule(input) {
  return read("normalizeRailgunPrivateCapsule", input);
}
function digestRailgunPrivateCapsule(input) {
  return read("digestRailgunPrivateCapsule", input);
}

module.exports = Object.freeze({
  normalizeRailgunPrivateCapsule,
  digestRailgunPrivateCapsule,
  railgunPrivateCapsuleCompatibility,
});
