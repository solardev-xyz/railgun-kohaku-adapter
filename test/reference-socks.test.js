"use strict";
const net = require("node:net");
const { once } = require("node:events");
const { connectSocks } = require("../examples/reference-wallet/host/socks.cjs");
async function fixture(onData) {
  const sockets = new Set(),
    server = net.createServer((socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
      socket.on("error", () => {});
      socket.on("data", (bytes) => onData(socket, bytes));
    });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const lifetime = new AbortController();
  return {
    options: {
      endpoint: {
        host: "127.0.0.1",
        port: server.address().port,
        signal: lifetime.signal,
      },
      hostname: "public-fixture.example",
      port: 443,
      token: "a".repeat(64),
      signal: lifetime.signal,
      timeoutMs: 2000,
    },
    lifetime,
    async close() {
      lifetime.abort();
      for (const socket of sockets) socket.destroy();
      const closed = once(server, "close");
      server.close();
      await closed;
    },
  };
}
test("SOCKS uses authentication and domain-form remote DNS", async () => {
  const requests = [];
  const f = await fixture((socket, bytes) => {
    requests.push(Buffer.from(bytes));
    if (requests.length === 1) socket.write(Buffer.from([5, 2]));
    else if (requests.length === 2) socket.write(Buffer.from([1, 0]));
    else socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
  });
  let socket;
  try {
    const connected = await connectSocks(f.options, (value) => {
      socket = value;
    });
    expect(connected).toBe(socket);
    expect([...requests[0]]).toEqual([5, 1, 2]);
    expect(requests[1].subarray(2, 11).toString()).toBe("<torS0X>0");
    expect([...requests[2].subarray(0, 4)]).toEqual([5, 1, 0, 3]);
    expect(requests[2].subarray(5, -2).toString()).toBe(f.options.hostname);
    expect(requests[2].readUInt16BE(requests[2].length - 2)).toBe(443);
  } finally {
    socket?.destroy();
    await f.close();
  }
});
test("a proxy selecting no authentication is refused without CONNECT", async () => {
  let messages = 0,
    socket;
  const f = await fixture((peer) => {
    messages++;
    peer.write(Buffer.from([5, 0]));
  });
  try {
    await expect(
      connectSocks(f.options, (value) => {
        socket = value;
      }),
    ).rejects.toMatchObject({ code: "SOCKS_AUTH_REQUIRED" });
    expect(messages).toBe(1);
  } finally {
    socket?.destroy();
    await f.close();
  }
});
test("endpoint revocation aborts and closes an unfinished handshake", async () => {
  const f = await fixture(() => {});
  let closed;
  try {
    const work = connectSocks(f.options, (socket) => {
      closed = once(socket, "close");
    });
    f.lifetime.abort();
    await expect(work).rejects.toMatchObject({
      code: "PRIVACY_REQUEST_ABORTED",
    });
    await closed;
  } finally {
    await f.close();
  }
});
