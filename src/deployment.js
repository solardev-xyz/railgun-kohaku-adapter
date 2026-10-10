"use strict";
/** Closed deployment facts, not host policy or a general network registry.
 * Adding a deployment requires code, artifact and service qualification. */
const pins = require("./railgun-shield-pins.json");
const SEPOLIA = Object.freeze({
  id: "sepolia",
  chainId: pins.chainId,
  // Persisted identity/AAD domain: never rename as cosmetic deployment cleanup.
  persistedNetwork: "sepolia",
  contracts: Object.freeze({ proxy: pins.proxy, relayAdapt: pins.relayAdapt,
    wrappedNative: pins.wrappedNative, implementation: pins.implementation }),
  codeHashes: Object.freeze({ ...pins.codeHashes }),
  fees: Object.freeze({ shieldBps: pins.shieldFeeBps, unshieldBps: 25 }),
  services: Object.freeze({ poi: "https://ppoi.fdi.network",
    txidIndexer: "https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql" }),
  qualification: Object.freeze({ governanceThrough: 11829346, poiLaunchBlock: 5944700 }),
});
function selectRailgunDeployment(id) {
  if (id !== "sepolia") throw Object.assign(Error("Unsupported Railgun deployment"), {
    code: "RAILGUN_DEPLOYMENT_REFUSED",
  });
  return SEPOLIA;
}
module.exports = { SEPOLIA, selectRailgunDeployment };
