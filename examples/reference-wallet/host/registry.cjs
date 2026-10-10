"use strict";
/** Explicit application policy, not protocol constants. No default destination,
 * source discovery, credentialed URL, fallback or unsupported-chain selection. */
function createRegistry({ rpcUrl, requestTimeoutMs = 30000 }) {
  let url;
  try {
    url = new URL(rpcUrl);
  } catch {
    throw new Error("Reference RPC configuration refused");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs < 500 ||
    requestTimeoutMs > 120000
  )
    throw new Error("Reference RPC configuration refused");
  const endpoint = url.href;
  const network = Object.freeze({
    id: 11155111,
    access: Object.freeze({ readOrder: Object.freeze(["direct"]) }),
    quorum: Object.freeze({ timeoutMs: requestTimeoutMs }),
  });
  const source = Object.freeze({
    id: "reference-pinned",
    keyed: false,
    coverage: Object.freeze({ 11155111: endpoint }),
  });
  function chain(id, kind) {
    if (id !== 11155111 || (kind !== undefined && kind !== "rpc"))
      throw Object.assign(new Error("Reference chain unavailable"), {
        code: "PRIVATE_SOURCE_UNAVAILABLE",
      });
  }
  return Object.freeze({
    getNetwork(id) {
      chain(id);
      return network;
    },
    getEndpointSources(id, kind) {
      chain(id, kind);
      return [source];
    },
    getEndpoints(id, kind) {
      chain(id, kind);
      return [endpoint];
    },
  });
}
module.exports = { createRegistry };
