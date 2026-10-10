"use strict";
let request, transportClosed, closeTransport, reply;
jest.mock("../examples/reference-wallet/host/transport.cjs", () => ({
  createTransportHost: ({ context }) => ({
    createWalletTorTransport: () => ({
      request: (handle, url, options) => {
        context.getPrivacyContext(handle);
        return request(handle, url, options);
      },
      close: () => closeTransport(),
      get closed() {
        return transportClosed;
      },
    }),
  }),
}));
const { createChainReader } = require("../examples/reference-wallet/chain.cjs");
function fixture() {
  transportClosed = Promise.resolve();
  closeTransport = jest.fn();
  reply = ({ method }) =>
    method === "eth_chainId"
      ? "0xaa36a7"
      : { number: "0x20", hash: "0x" + "a".repeat(64) };
  request = jest.fn(async (_handle, _url, options) => {
    const input = JSON.parse(options.body);
    return {
      status: 200,
      body: Buffer.from(
        JSON.stringify({ jsonrpc: "2.0", id: input.id, result: reply(input) }),
      ),
    };
  });
  return createChainReader({
    tor: {},
    rpcUrl: "https://rpc.example",
    signal: new AbortController().signal,
  });
}
test("public reader exposes only chain-checked finalized planning and closes its scope", async () => {
  const reader = fixture();
  expect(Object.keys(reader).sort()).toEqual(["close", "finalized"]);
  expect(await reader.finalized()).toEqual({
    number: 32,
    hash: "0x" + "a".repeat(64),
  });
  expect(
    request.mock.calls.map(([, , options]) => JSON.parse(options.body).method),
  ).toEqual(["eth_chainId", "eth_getBlockByNumber"]);
  await reader.close();
  await expect(reader.finalized()).rejects.toThrow();
  expect(closeTransport).toHaveBeenCalledTimes(1);
});
test.each([
  null,
  { number: "0x01", hash: "0x" + "a".repeat(64) },
  { number: "0x20000000000000", hash: "0x" + "a".repeat(64) },
  { number: "0x20", hash: "wrong" },
])(
  "malformed finalized response %p refuses without fallback",
  async (value) => {
    const reader = fixture();
    reply = ({ method }) => (method === "eth_chainId" ? "0xaa36a7" : value);
    try {
      await expect(reader.finalized()).rejects.toMatchObject({
        code: "REFERENCE_CHAIN_REFUSED",
      });
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      await reader.close();
    }
  },
);
test("wrong chain is sticky and refuses before a header request", async () => {
  const reader = fixture();
  reply = () => "0x1";
  try {
    await expect(reader.finalized()).rejects.toThrow();
    await expect(reader.finalized()).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    await reader.close();
  }
});
test.each(["wrong-id", "error", "http", "malformed"])(
  "%s envelope refuses with no retry",
  async (variant) => {
    const reader = fixture();
    request.mockImplementation(async (_handle, _url, options) => {
      const { id } = JSON.parse(options.body);
      return {
        status: variant === "http" ? 400 : 200,
        body: Buffer.from(
          variant === "malformed"
            ? "bad"
            : JSON.stringify({
                jsonrpc: "2.0",
                id: variant === "wrong-id" ? "other" : id,
                result: "0xaa36a7",
                ...(variant === "error" ? { error: { code: -32000 } } : {}),
              }),
        ),
      };
    });
    try {
      await expect(reader.finalized()).rejects.toThrow();
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      await reader.close();
    }
  },
);
