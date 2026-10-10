"use strict";
const { LEGACY_MAX, NOTE_MAX, RELAY_FEE_MAX, RELAY_INPUT_MAX, parseAmount } = require("../src/amount-bounds");
test("legacy and relay bounds keep their meanings independently of uint120", () => {
  expect(LEGACY_MAX).toBe(10000000000000000n);
  expect(RELAY_FEE_MAX).toBe(10000000000000000n);
  expect(RELAY_INPUT_MAX).toBe(10000000000000000n);
  expect(NOTE_MAX).toBe(1329227995784915872903807060280344575n);
  expect(Object.isFrozen(require("../src/amount-bounds"))).toBe(true);
});
test("canonical decimal values respect their explicit format bound", () => {
  expect(parseAmount("1", LEGACY_MAX)).toBe(1n);
  expect(parseAmount(String(LEGACY_MAX), LEGACY_MAX)).toBe(LEGACY_MAX);
  expect(() => parseAmount(String(LEGACY_MAX + 1n), LEGACY_MAX)).toThrow();
  expect(parseAmount(String(LEGACY_MAX + 1n), NOTE_MAX)).toBe(LEGACY_MAX + 1n);
  expect(parseAmount(String(NOTE_MAX), NOTE_MAX)).toBe(NOTE_MAX);
  expect(() => parseAmount(String(NOTE_MAX + 1n), NOTE_MAX)).toThrow();
  expect(() => parseAmount("0", NOTE_MAX)).toThrow();
  expect(parseAmount("0", NOTE_MAX, true)).toBe(0n);
});
test.each(["", "00", "01", "-1", "+1", " 1", "1 ", "1.0", "1e2", "0x1", "1\n", "1".repeat(38), 1, 1n, null, undefined])(
  "refuses noncanonical or nonstring input %p", value => {
    expect(() => parseAmount(value, NOTE_MAX, true)).toThrow("Railgun amount format unavailable");
  });
test("never coerces caller objects or accepts an unbounded parser", () => {
  const trap = jest.fn(() => { throw Error("unexpected coercion"); });
  const value = new Proxy({}, { get: trap, getPrototypeOf: trap });
  expect(() => parseAmount(value, NOTE_MAX)).toThrow();
  expect(() => parseAmount("1", value)).toThrow();
  expect(() => parseAmount("1", NOTE_MAX, value)).toThrow();
  expect(trap).not.toHaveBeenCalled();
  for (const maximum of [0n, -1n, NOTE_MAX + 1n, 1, undefined])
    expect(() => parseAmount("1", maximum)).toThrow();
});
