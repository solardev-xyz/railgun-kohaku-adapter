"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const net = require("node:net"),
  https = require("node:https"),
  dns = require("node:dns");
const { once } = require("node:events");
const { execFileSync } = require("node:child_process");
const {
  createContextHost,
} = require("../examples/reference-wallet/host/context.cjs");
const {
  createTransportHost,
} = require("../examples/reference-wallet/host/transport.cjs");
let certificate;
beforeAll(() => {
  // Disposable test-only key, never committed or accepted by the application.
  // OpenSSL/LibreSSL is a documented local transport-conformance prerequisite.
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "railgun-reference-tls-")),
  );
  const config = path.join(directory, "openssl.cnf");
  fs.writeFileSync(
    config,
    "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=fixture.invalid\n[ext]\nsubjectAltName=DNS:fixture.invalid\nbasicConstraints=critical,CA:TRUE\n",
  );
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-config",
      config,
      "-keyout",
      path.join(directory, "key.pem"),
      "-out",
      path.join(directory, "cert.pem"),
    ],
    { stdio: "ignore" },
  );
  certificate = {
    key: fs.readFileSync(path.join(directory, "key.pem")),
    cert: fs.readFileSync(path.join(directory, "cert.pem")),
  };
});
async function setup(
  handler = (_req, res) => res.end("ok"),
  trust = true,
  stall = null,
) {
  const connections = new Set(),
    requests = [],
    records = [],
    phases = [];
  const server = https.createServer(certificate, (req, res) => {
    requests.push(req);
    handler(req, res);
  });
  server.on("connection", (socket) => {
    connections.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => connections.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const proxy = net.createServer((socket) => {
    connections.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => connections.delete(socket));
    let phase = 0;
    function receive(bytes) {
      const stage = ["greeting", "authentication", "connect"][phase];
      phases.push(stage);
      if (stage === stall) return;
      if (phase === 0) {
        phase++;
        socket.write(Buffer.from([5, 2]));
      } else if (phase === 1) {
        phase++;
        records.push({ token: bytes.subarray(3 + bytes[1]).toString() });
        socket.write(Buffer.from([1, 0]));
      } else {
        socket.removeListener("data", receive);
        records.at(-1).hostname = bytes.subarray(5, 5 + bytes[4]).toString();
        if (stall === "tls") {
          socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
          socket.on("data", () => phases.push("tls"));
          return;
        }
        const upstream = net.connect(server.address().port, "127.0.0.1");
        connections.add(upstream);
        upstream.on("error", () => socket.destroy());
        upstream.once("close", () => connections.delete(upstream));
        socket.once("close", () => upstream.destroy());
        upstream.once("close", () => socket.destroy());
        upstream.once("connect", () => {
          socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
          socket.pipe(upstream).pipe(socket);
        });
      }
    }
    socket.on("data", receive);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const lifetime = new AbortController(),
    context = createContextHost();
  const scope = context.createPrivacyScope({
    profileId: "test",
    signal: lifetime.signal,
  });
  const handle = scope.getContext({
    kind: "private-account",
    principal: "railgun:0",
    chainId: 11155111,
    protocol: "railgun",
    deployment: "sepolia",
    role: "protocol-rpc",
  });
  let endpoint = Object.freeze({
    host: "127.0.0.1",
    port: proxy.address().port,
    signal: lifetime.signal,
  });
  const transport = createTransportHost({
    context,
    getEndpoint: () => endpoint,
    allowedOrigins: ["https://fixture.invalid"],
    ...(trust ? { ca: certificate.cert } : {}),
  }).createWalletTorTransport();
  return {
    transport,
    scope,
    handle,
    records,
    requests,
    lifetime,
    phases,
    changeEndpoint: () => {
      endpoint = Object.freeze({ ...endpoint });
    },
    request: (pathname = "/", options = {}) =>
      transport.request(handle, `https://fixture.invalid${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"public":"fixture"}',
        timeoutMs: 2000,
        ...options,
      }),
    async close() {
      transport.close();
      scope.close();
      await transport.closed;
      lifetime.abort();
      for (const socket of connections) socket.destroy();
      await Promise.all([
        new Promise((resolve) => server.close(resolve)),
        new Promise((resolve) => proxy.close(resolve)),
      ]);
    },
  };
}
test.each(["greeting", "authentication", "connect", "tls"])(
  "cancellation drains a socket stalled during %s",
  async (stage) => {
    const f = await setup(undefined, true, stage);
    try {
      const pending = f.request();
      const refused = expect(pending).rejects.toMatchObject({
        code: "PRIVACY_REQUEST_ABORTED",
      });
      const deadline = Date.now() + 1500;
      while (!f.phases.includes(stage)) {
        if (Date.now() >= deadline)
          throw Error("fixture did not reach handshake stage");
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      f.scope.close();
      await refused;
      f.transport.close();
      await f.transport.closed;
      expect(f.requests).toHaveLength(0);
    } finally {
      await f.close();
    }
  },
);
test("HTTPS uses remote DNS, TLS validation, no identifiers in headers and drained close", async () => {
  const f = await setup();
  const lookup = jest.spyOn(dns, "lookup");
  try {
    const response = await f.request();
    expect(response).toEqual({ status: 200, body: Buffer.from("ok") });
    expect(f.records).toHaveLength(1);
    expect(f.records[0]).toEqual({
      hostname: "fixture.invalid",
      token: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(
      lookup.mock.calls.every(([hostname]) => hostname === "127.0.0.1"),
    ).toBe(true);
    expect(JSON.stringify(f.requests[0].headers)).not.toContain(
      f.records[0].token,
    );
    f.transport.close();
    await f.transport.closed;
    await expect(f.request()).rejects.toMatchObject({
      code: "TOR_TRANSPORT_CLOSED",
    });
  } finally {
    lookup.mockRestore();
    await f.close();
  }
});
test("an untrusted certificate refuses before HTTP application bytes", async () => {
  const f = await setup(undefined, false);
  try {
    await expect(f.request()).rejects.toMatchObject({
      code: "TOR_REQUEST_FAILED",
      stage: "tls",
    });
    expect(f.requests).toHaveLength(0);
  } finally {
    await f.close();
  }
});
test.each([
  [
    "redirect",
    (_req, res) => {
      res.writeHead(302, { location: "https://other.invalid" });
      res.end();
    },
    "PRIVATE_REDIRECT_REFUSED",
  ],
  [
    "encoding",
    (_req, res) => {
      res.setHeader("content-encoding", "gzip");
      res.end("x");
    },
    "PRIVATE_ENCODING_REFUSED",
  ],
  ["size", (_req, res) => res.end("oversized"), "PRIVATE_RESPONSE_TOO_LARGE"],
  [
    "framing",
    (_req, res) => {
      res.useChunkedEncodingByDefault = false;
      res.write("x");
      res.end();
    },
    "PRIVATE_FRAMING_REFUSED",
  ],
])("%s refuses with no retry", async (_name, handler, code) => {
  const f = await setup(handler);
  try {
    await expect(
      f.request("/", { maxResponseBytes: 4, requireFramedResponse: true }),
    ).rejects.toMatchObject({ code });
    expect(f.requests).toHaveLength(1);
  } finally {
    await f.close();
  }
});
test.each(["release", "close", "scope", "request"])(
  "%s cancellation drains original sockets",
  async (action) => {
    let started;
    const accepted = new Promise((resolve) => {
      started = resolve;
    });
    const f = await setup(() => started()),
      controller = new AbortController();
    try {
      const pending = f.request("/", { signal: controller.signal });
      const rejected = expect(pending).rejects.toMatchObject({
        code: "PRIVACY_REQUEST_ABORTED",
      });
      await accepted;
      if (action === "release") f.transport.release(f.handle);
      else if (action === "close") f.transport.close();
      else if (action === "scope") f.scope.close();
      else controller.abort();
      await rejected;
      f.transport.close();
      await f.transport.closed;
    } finally {
      await f.close();
    }
  },
);
test("request deadline is terminal for that request; no transparent retry", async () => {
  const f = await setup(() => {});
  try {
    await expect(f.request("/", { timeoutMs: 100 })).rejects.toMatchObject({
      code: "TOR_REQUEST_TIMEOUT",
    });
    expect(f.requests).toHaveLength(1);
  } finally {
    await f.close();
  }
});
test("endpoint replacement and unapproved URLs fail before another connection", async () => {
  const f = await setup();
  try {
    await f.request();
    f.changeEndpoint();
    await expect(f.request()).rejects.toMatchObject({
      code: "TOR_NOT_READY",
    });
    await expect(f.request("/?credential=x")).rejects.toMatchObject({
      code: "INVALID_PRIVATE_REQUEST",
    });
    expect(f.records).toHaveLength(1);
  } finally {
    await f.close();
  }
});
