"use strict";
const { LEGACY_MAX, NOTE_MAX } = require("../src/amount-bounds");
const {
  capsuleFormat, selectCapsuleFormat, assertCapsuleFormat,
  selectTransactFormat, selectShieldFormat,
} = require("../src/operation-formats");
const TRANSFER = "railgun-private-transfer";
const FULL = "railgun-token-unshield";
const PARTIAL = "railgun-partial-unshield";
const amounts = ["1", String(LEGACY_MAX), String(LEGACY_MAX + 1n), String(NOTE_MAX)];

test.each([TRANSFER, FULL, PARTIAL])("capsule %s chooses one immutable format from the input", kind => {
  for (const amount of amounts) {
    const version = (kind === PARTIAL ? 2 : 1) + (BigInt(amount) > LEGACY_MAX ? 2 : 0);
    const format = selectCapsuleFormat(kind, amount);
    expect(format).toEqual({ version, partial: kind === PARTIAL,
      maximum: version < 3 ? LEGACY_MAX : NOTE_MAX,
      domain: `freedom:railgun:private-capsule-v${version}\0` });
    expect(assertCapsuleFormat(version, kind, amount)).toBe(format);
    expect(Object.isFrozen(format)).toBe(true);
    // Versions are canonical, not caller-selected capacity hints. A legacy
    // amount cannot be repackaged as a new format, nor a wide amount downgraded.
    for (const other of [1, 2, 3, 4].filter(v => v !== version))
      expect(() => assertCapsuleFormat(other, kind, amount)).toThrow();
  }
});

test("transfer journal never derives a version from the private input amount", () => {
  const format = selectTransactFormat(TRANSFER);
  expect(format).toEqual({ version: 1, versionField: null,
    maximum: LEGACY_MAX, domain: "railgun-transact" });
  for (const amount of [...amounts, null, 0, 1n])
    expect(() => selectTransactFormat(TRANSFER, amount)).toThrow();
});

test.each([FULL, PARTIAL])("%s journal selects only from the public unshield amount", kind => {
  for (const amount of amounts) {
    const version = (kind === PARTIAL ? 2 : 1) + (BigInt(amount) > LEGACY_MAX ? 2 : 0);
    expect(selectTransactFormat(kind, amount)).toEqual({ version,
      versionField: version === 1 ? null : version,
      maximum: version < 3 ? LEGACY_MAX : NOTE_MAX,
      domain: version === 1 ? "railgun-transact" : `railgun-transact-v${version}` });
  }
  // Wide private input plus small public unshield: capsule v4, journal v2.
  expect(selectCapsuleFormat(PARTIAL, String(NOTE_MAX)).version).toBe(4);
  expect(selectTransactFormat(PARTIAL, "1").version).toBe(2);
});

test("shield leaves the historical shape unversioned and versions wider gross amounts", () => {
  for (const amount of amounts) {
    const wide = BigInt(amount) > LEGACY_MAX;
    expect(selectShieldFormat(amount)).toEqual({ version: wide ? 2 : 1,
      versionField: wide ? 2 : null, maximum: wide ? NOTE_MAX : LEGACY_MAX });
  }
});

test.each([undefined, null, 0, -1, 1.5, "1", 5, 256, NaN, Infinity])("refuses invalid stored version %p", version => {
  expect(() => capsuleFormat(version)).toThrow("Railgun operation format unavailable");
});

test.each(["0", "01", "-1", "+1", "1.0", "1e16", String(NOTE_MAX + 1n), "1".repeat(38), 1n, 1, null, undefined])(
  "refuses noncanonical or out-of-format amount %p", amount => {
    for (const kind of [TRANSFER, FULL, PARTIAL])
      expect(() => selectCapsuleFormat(kind, amount)).toThrow();
    for (const kind of [FULL, PARTIAL])
      expect(() => selectTransactFormat(kind, amount)).toThrow();
    expect(() => selectShieldFormat(amount)).toThrow();
  });

test("unsupported kinds and hostile scalar inputs never coerce", () => {
  const trap = jest.fn(() => { throw Error("must not coerce"); });
  const hostile = new Proxy({}, { get: trap, getPrototypeOf: trap });
  for (const kind of [undefined, null, "railgun-native-shield", "transfer", hostile]) {
    expect(() => selectCapsuleFormat(kind, "1")).toThrow();
    expect(() => selectTransactFormat(kind, "1")).toThrow();
  }
  expect(() => capsuleFormat(hostile)).toThrow();
  expect(() => selectShieldFormat(hostile)).toThrow();
  expect(trap).not.toHaveBeenCalled();
  expect(Object.isFrozen(require("../src/operation-formats"))).toBe(true);
});


test("digest domain table is closed and explicit", () => {
  expect([1, 2, 3, 4].map(v => capsuleFormat(v).domain)).toEqual([
    "freedom:railgun:private-capsule-v1\0", "freedom:railgun:private-capsule-v2\0",
    "freedom:railgun:private-capsule-v3\0", "freedom:railgun:private-capsule-v4\0",
  ]);
});
