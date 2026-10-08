"use strict";
// The real recovery owner captures its exact client destination locally and
// reasserts it before each request step; G1 discloses that projection.
require("../tools/owner-test-staging/context-host.cjs");
let mockSession, mockEndpoint;
const mockRequest = jest.fn();
const HOST = "../tools/owner-test-staging/fixtures/host/src/main";
jest.mock(
  "../tools/owner-test-staging/fixtures/host/src/main/wallet/privacy-session.js",
  () => ({ openPrivacySession: () => mockSession }),
);
jest.mock(
  "../tools/owner-test-staging/fixtures/host/src/main/settings-store.js",
  () => ({ isWalletTorExperimentAvailable: () => true }),
);
jest.mock(
  "../tools/owner-test-staging/fixtures/host/src/main/tor-manager.js",
  () => ({ getWalletSocksEndpoint: () => mockEndpoint }),
);
jest.mock(
  "../tools/owner-test-staging/fixtures/host/src/main/networks/network-registry.js",
  () => ({
    getNetwork: () => ({}),
    getEndpoints: () => ["https://rpc.example"],
    getEndpointSources: () => [
      { keyed: false, coverage: { 11155111: "https://rpc.example" } },
    ],
  }),
);
jest.mock(
  "../tools/owner-test-staging/fixtures/host/src/main/networks/wallet-tor-transport.js",
  () => ({ createWalletTorTransport: () => ({ request: mockRequest }) }),
);
const { createPrivacyScope } = require("../src/owners/context-bindings.js");
const {
  openRailgunTransactRecovery,
} = require("../src/owners/railgun-transact-recovery.js");
const { getPrivateRpcDestinationDetails } = require(
  HOST + "/networks/private-rpc.js",
);
const owner = "0x" + "1".repeat(40);
let recovery;
beforeEach(() => {
  mockRequest.mockReset();
  mockSession = createPrivacyScope({
    profileId: "railgun-recovery-destination",
    signal: new AbortController().signal,
  });
  mockEndpoint = { signal: new AbortController().signal };
  recovery = openRailgunTransactRecovery(owner);
});
afterEach(() => {
  recovery?.close();
  mockSession.close();
});
test("the destination is captured without a request and reasserted until close", async () => {
  expect(JSON.stringify(recovery.destination)).toBe("{}");
  expect(getPrivateRpcDestinationDetails(recovery.destination)).toMatchObject({
    url: "https://rpc.example/",
  });
  expect(recovery.assertDestination()).toBe(recovery.destination);
  expect(mockRequest).not.toHaveBeenCalled();
  recovery.close();
  expect(() => recovery.assertDestination()).toThrow();
  await expect(recovery.observe("0x" + "a".repeat(64))).rejects.toThrow();
  expect(mockRequest).not.toHaveBeenCalled();
});
test("a replaced endpoint retires the captured destination before any request", async () => {
  mockEndpoint = { signal: new AbortController().signal };
  expect(() => recovery.assertDestination()).toThrow();
  await expect(recovery.observe("0x" + "a".repeat(64))).rejects.toThrow();
  expect(mockRequest).not.toHaveBeenCalled();
});
