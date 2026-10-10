"use strict";
const { SEPOLIA, selectRailgunDeployment } = require("../src/deployment");
const pins = require("../src/railgun-shield-pins.json");
test("closed deployment retains qualified contracts and persisted identity", () => {
  expect(selectRailgunDeployment("sepolia")).toBe(SEPOLIA);
  expect(SEPOLIA.chainId).toBe(11155111);
  expect(SEPOLIA.persistedNetwork).toBe("sepolia");
  for (const key of Object.keys(SEPOLIA.contracts)) expect(SEPOLIA.contracts[key]).toBe(pins[key]);
  expect(SEPOLIA.codeHashes).toEqual(pins.codeHashes);
  expect(SEPOLIA.fees).toEqual({ shieldBps: 25, unshieldBps: 25 });
  expect(SEPOLIA).not.toHaveProperty("maxQualificationAmount");
  for (const value of [SEPOLIA, SEPOLIA.contracts, SEPOLIA.codeHashes, SEPOLIA.fees, SEPOLIA.services, SEPOLIA.qualification])
    expect(Object.isFrozen(value)).toBe(true);
});
test.each([undefined, null, 11155111, "mainnet", "SEPOLIA", {}, { id: "sepolia" }])("unsupported deployment %p refuses without coercion", (value) => {
  expect(() => selectRailgunDeployment(value)).toThrow("Unsupported Railgun deployment");
});
test("descriptor-shaped objects and proxies cannot inject deployment facts", () => {
  const trap = jest.fn();
  expect(() => selectRailgunDeployment(new Proxy({}, { get: trap }))).toThrow();
  expect(trap).not.toHaveBeenCalled();
});
