"use strict";
const { createContextHost } = require("./host/context.cjs");
const { createTransportHost } = require("./host/transport.cjs");
const { randomUUID } = require("node:crypto");
/** Separate public-chain reader for command planning. It exposes no generic RPC
 * or transaction method. Its Tor scope is independent of account service scopes.
 * Returned headers are unverified-RPC observations, never authority receipts. */
function createChainReader({ tor, rpcUrl, signal }) {
  require("./host/registry.cjs").createRegistry({ rpcUrl });
  const context = createContextHost(),
    scope = context.createPrivacyScope({
      profileId: "reference-public-chain",
      signal,
    });
  const handle = scope.getContext({
    kind: "service",
    principal: "sepolia-chain",
    chainId: 11155111,
    role: "public-chain-planning",
  });
  const transport = createTransportHost({
    context,
    getEndpoint: () => tor.getWalletSocksEndpoint(),
    allowedOrigins: [new URL(rpcUrl).origin],
  }).createWalletTorTransport();
  const fail = () => {
    throw Object.assign(Error("Public chain response refused"), {
      code: "REFERENCE_CHAIN_REFUSED",
    });
  };
  async function rpc(method, params) {
    const id = randomUUID();
    const response = await transport.request(handle, rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      timeoutMs: 30000,
    });
    let value;
    try {
      value = JSON.parse(response.body.toString("utf8"));
    } catch {
      fail();
    }
    if (
      response.status !== 200 ||
      !value ||
      Array.isArray(value) ||
      value.jsonrpc !== "2.0" ||
      value.id !== id ||
      Object.hasOwn(value, "error") ||
      !Object.hasOwn(value, "result")
    )
      fail();
    return value.result;
  }
  let chain;
  async function ready() {
    chain ??= rpc("eth_chainId", []).then((value) => {
      if (value !== "0xaa36a7") fail();
    });
    await chain;
  }
  return Object.freeze({
    async finalized() {
      await ready();
      const value = await rpc("eth_getBlockByNumber", ["finalized", false]);
      if (
        !value ||
        typeof value.number !== "string" ||
        !/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value.number) ||
        typeof value.hash !== "string" ||
        !/^0x[0-9a-f]{64}$/i.test(value.hash) ||
        BigInt(value.number) > BigInt(Number.MAX_SAFE_INTEGER)
      )
        fail();
      return Object.freeze({
        number: Number(BigInt(value.number)),
        hash: value.hash.toLowerCase(),
      });
    },
    async close() {
      scope.close();
      transport.close();
      await transport.closed;
    },
  });
}
module.exports = { createChainReader };
