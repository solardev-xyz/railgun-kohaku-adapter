"use strict";
const { rememberPrivatePreflightOutcome: remember, readPrivatePreflightOutcome: read } = require("../src/owners/private-preflight-outcome");
const failure = (extra = {}) => ({ code: "RAILGUN_PRIVATE_PREFLIGHT_REFUSED", reason: "rpc", step: "deployment", deploymentStep: "code-proxy", causeCode: "TOR_REQUEST_TIMEOUT", ...extra });
test("only the issued result carries the closed diagnostic; copying it gives none", () => {
  const result = Object.freeze({ status: "refused", stage: "preflight" });
  expect(remember(result, failure(), true)).toBe(result);
  expect(read(result)).toEqual({ reason: "rpc", step: "deployment", deploymentStep: "code-proxy", transport: "TOR_REQUEST_TIMEOUT", transportStage: null, budgetExpired: true });
  expect(Object.isFrozen(read(result))).toBe(true);
  expect(read({ ...result })).toBeNull();
  for (const value of [null, undefined, "refused", 1, {}]) expect(read(value)).toBeNull();
});
test.each([
  ["TOR_REQUEST_FAILED", "TOR_REQUEST_FAILED"], ["TOR_REQUEST_TIMEOUT", "TOR_REQUEST_TIMEOUT"],
  ["PRIVACY_REQUEST_ABORTED", "PRIVACY_REQUEST_ABORTED"], ["RPC_SECRET_IDENTIFIER", "other"],
])("transport code %s projects only its closed category", (causeCode, transport) => {
  const result = {};
  remember(result, failure({ causeCode, message: "secret", params: ["private"] }));
  expect(read(result).transport).toBe(transport);
  expect(JSON.stringify(read(result))).not.toMatch(/secret|private|RPC_SECRET/);
});
test("mismatch does not invent transport provenance or a deployment substep", () => {
  const result = {};
  remember(result, failure({ reason: "mismatch", step: "verifier" }));
  expect(read(result)).toEqual({ reason: "mismatch", step: "verifier", deploymentStep: null, transport: null, transportStage: null, budgetExpired: false });
});
test.each(["reason", "step", "deploymentStep"])("unknown %s never leaks", (key) => {
  const result = {};
  remember(result, failure({ [key]: "secret-profile-root" }));
  expect(JSON.stringify(read(result))).not.toContain("secret");
});
test("getters, inherited fields, proxies and non-preflight errors are not inspected as provenance", () => {
  const getter = jest.fn(() => { throw Error("must not run"); });
  const proxyTrap = jest.fn(() => { throw Error("must not run"); });
  const values = [Object.create(failure()), new Proxy({}, { get: proxyTrap, getOwnPropertyDescriptor: proxyTrap }), { code: "OTHER", reason: "rpc" }, null];
  const accessor = {};
  Object.defineProperty(accessor, "code", { get: getter });
  values.push(accessor);
  for (const error of values) {
    const result = {};
    remember(result, error, "true");
    expect(read(result)).toEqual({ reason: "unknown", step: null, deploymentStep: null, transport: null, transportStage: null, budgetExpired: false });
  }
  expect(getter).not.toHaveBeenCalled();
  expect(proxyTrap).not.toHaveBeenCalled();
});
test('broad transport failures retain only their observed stage, never an inferred connection cause', () => {
  const result = {};
  remember(result, failure({ causeCode: 'TOR_REQUEST_FAILED', causeStage: 'tls' }));
  expect(read(result)).toMatchObject({ transport: 'TOR_REQUEST_FAILED', transportStage: 'tls' });
  remember(result, failure({ causeCode: 'TOR_REQUEST_FAILED', causeStage: 'secret socket' }));
  expect(read(result).transportStage).toBeNull();
});
