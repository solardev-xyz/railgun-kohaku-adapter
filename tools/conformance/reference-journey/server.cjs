"use strict";
/** Offline fixture only: SOCKS destinations are mapped to one loopback TLS
 * listener. No DNS lookup or external connection exists in this server. */
const assert = require("node:assert/strict"),
  net = require("node:net"),
  https = require("node:https");
const { once } = require("node:events");
const { Transaction } = require("ethers");
const {
  ENDPOINT,
  POI_URL,
  INDEXER_URL,
} = require("../../qualification/installed-journey/journey-chain.cjs");
async function createFixtureServer({ chain, submitters, key, cert }) {
  const allowed = new Set(
    [ENDPOINT, POI_URL, INDEXER_URL].map((url) => new URL(url).hostname),
  );
  let readDelayMs = 0,
    loseSendResponse = false;
  const methods = [];
  const sockets = new Set(),
    counts = {
      tls: 0,
      socks: 0,
      requests: 0,
      refused: 0,
      lostSendResponses: 0,
    };
  function track(socket) {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => sockets.delete(socket));
  }
  const server = https.createServer(
    { key, cert },
    async (request, response) => {
      counts.requests++;
      try {
        assert.equal(request.method, "POST");
        const chunks = [];
        let size = 0;
        for await (const bytes of request) {
          size += bytes.length;
          assert.ok(size <= 2 * 1024 * 1024);
          chunks.push(bytes);
        }
        const wire = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const url =
          "https://" +
          request.headers.host +
          (request.url === "/" ? "" : request.url);
        let subject;
        if (url === POI_URL)
          subject = {
            kind: "private-account",
            role: "poi",
            principal: "railgun:0",
            chainId: 11155111,
          };
        else if (url === INDEXER_URL)
          subject = {
            kind: "service",
            role: "indexer",
            principal: "indexer",
            chainId: 11155111,
          };
        else {
          assert.equal(url, ENDPOINT);
          // Only a wire fixture dispatch decision, not evidence of the host's
          // context role. Context isolation is checked by separate host tests.
          const method = wire.method,
            params = wire.params;
          const transaction =
            [
              "eth_blockNumber",
              "eth_getBalance",
              "eth_gasPrice",
              "eth_getTransactionCount",
              "eth_estimateGas",
              "eth_sendRawTransaction",
              "eth_getTransactionByHash",
              "eth_getTransactionReceipt",
            ].includes(method) ||
            (method === "eth_getCode" && params[1] === "pending") ||
            (method === "eth_call" && params[1] === "latest");
          let principal = submitters[0];
          if (method === "eth_sendRawTransaction")
            principal = Transaction.from(params[0]).from.toLowerCase();
          else if (
            [
              "eth_getCode",
              "eth_getBalance",
              "eth_getTransactionCount",
            ].includes(method) &&
            typeof params[0] === "string" &&
            submitters.includes(params[0].toLowerCase())
          )
            principal = params[0].toLowerCase();
          subject = {
            kind: transaction ? "public-address" : "private-account",
            role: transaction ? "transaction-rpc" : "rpc",
            principal: transaction ? principal : "railgun:0",
            chainId: 11155111,
          };
        }
        methods.push(
          typeof wire.method === "string" ? wire.method : "indexer-page",
        );
        assert.ok(methods.length <= 100000);
        if (readDelayMs && wire.method !== "eth_sendRawTransaction")
          await new Promise((resolve) => setTimeout(resolve, readDelayMs));
        const result = await chain.request(subject, url, wire);
        if (loseSendResponse && wire.method === "eth_sendRawTransaction") {
          loseSendResponse = false;
          counts.lostSendResponses++;
          response.destroy();
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify(
            url === INDEXER_URL
              ? result
              : { jsonrpc: "2.0", id: wire.id, result },
          ),
        );
      } catch (error) {
        counts.refused++;
        response.writeHead(error.httpStatus ?? 500, {
          "content-type": "application/json",
        });
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: error.rpcError ?? {
              code: -32603,
              message: "Synthetic fixture refused",
            },
          }),
        );
      }
    },
  );
  server.on("connection", (socket) => {
    counts.tls++;
    track(socket);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const proxy = net.createServer((socket) => {
    track(socket);
    counts.socks++;
    let bytes = Buffer.alloc(0),
      phase = 0;
    const consume = (count) => {
      const result = bytes.subarray(0, count);
      bytes = bytes.subarray(count);
      return result;
    };
    function input(chunk) {
      try {
        bytes = Buffer.concat([bytes, chunk]);
        assert.ok(bytes.length <= 65536);
        while (true) {
          if (phase === 0) {
            if (bytes.length < 2 || bytes.length < 2 + bytes[1]) return;
            const packet = consume(2 + bytes[1]);
            assert.equal(packet[0], 5);
            assert.ok(packet.subarray(2).includes(2));
            socket.write(Buffer.from([5, 2]));
            phase = 1;
          } else if (phase === 1) {
            if (bytes.length < 2 || bytes.length < 3 + bytes[1]) return;
            const total = 3 + bytes[1] + bytes[2 + bytes[1]];
            if (bytes.length < total) return;
            const packet = consume(total);
            assert.equal(packet[0], 1);
            socket.write(Buffer.from([1, 0]));
            phase = 2;
          } else {
            if (bytes.length < 5 || bytes.length < 7 + bytes[4]) return;
            const packet = consume(7 + bytes[4]);
            assert.equal(packet[0], 5);
            assert.equal(packet[1], 1);
            assert.equal(packet[3], 3);
            const hostname = packet.subarray(5, 5 + packet[4]).toString();
            assert.ok(allowed.has(hostname));
            assert.equal(packet.readUInt16BE(packet.length - 2), 443);
            socket.removeListener("data", input);
            const upstream = net.connect(server.address().port, "127.0.0.1");
            track(upstream);
            upstream.once("connect", () => {
              socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
              if (bytes.length) upstream.write(bytes);
              socket.pipe(upstream).pipe(socket);
            });
            upstream.once("error", () => socket.destroy());
            socket.once("close", () => upstream.destroy());
            return;
          }
        }
      } catch {
        counts.refused++;
        socket.destroy();
      }
    }
    socket.on("data", input);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  return {
    port: proxy.address().port,
    counts,
    methods,
    dropNextSendResponse() {
      assert.equal(loseSendResponse, false);
      loseSendResponse = true;
    },
    setReadDelay(value) {
      assert.ok([0, 2000].includes(value));
      readDelayMs = value;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await Promise.all([
        new Promise((resolve) => proxy.close(resolve)),
        new Promise((resolve) => server.close(resolve)),
      ]);
    },
  };
}
module.exports = { createFixtureServer };
