"use strict";
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const {
  createTorManager,
} = require("../examples/reference-wallet/host/tor.cjs");
// Pinned disposable child simulates lifecycle only. It makes no outbound request
// and does not claim to implement Arti, Tor bootstrap or circuit isolation.
function fixture(mode = "ready") {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "reference-tor-")),
  );
  const binary = path.join(directory, "proxy-fixture");
  const source = `#!${process.execPath}
const fs = require('node:fs'), net = require('node:net');
const config = fs.readFileSync(process.argv[4], 'utf8');
const port = Number(config.match(/socks_listen = "127\\.0\\.0\\.1:(\\d+)"/)[1]);
const server = net.createServer(socket => socket.once('data', () => socket.write(Buffer.from([5, 2]))));
function ready() {
  fs.writeFileSync(${JSON.stringify(path.join(directory, "started"))}, config);
  if (${JSON.stringify(mode)} === 'exit') process.exit(3);
  if (${JSON.stringify(mode)} === 'conflict') process.stdout.write("Another process has the lock on our state files. We'll proceed in read-only mode.\\n");
  if (['ready','fake','conflict'].includes(${JSON.stringify(mode)})) process.stdout.write('Listening on 127.0.0.1:' + port + '\\nBootstrapped 100%');
}
if (${JSON.stringify(mode)} === 'fake') { ready(); setInterval(() => {}, 1000); }
else server.listen(port, '127.0.0.1', ready);
process.on('SIGTERM', () => server.close(() => {
  fs.writeFileSync(${JSON.stringify(path.join(directory, "closed"))}, 'terminated');
  process.exit(0);
}));
`;
  fs.writeFileSync(binary, source, { mode: 0o700 });
  const controller = new AbortController();
  const options = {
    binary,
    directory,
    signal: controller.signal,
    sha256: createHash("sha256").update(source).digest("hex"),
  };
  return { directory, controller, options, manager: createTorManager(options) };
}
test("one pinned process supplies one endpoint until actual child close, never restarts", async () => {
  const f = fixture();
  try {
    expect(f.manager.getWalletSocksEndpoint()).toBeNull();
    const [first, second] = await Promise.all([
      f.manager.start(),
      f.manager.start(),
    ]);
    expect(first).toBe(second);
    expect(first.host).toBe("127.0.0.1");
    expect(first.signal.aborted).toBe(false);
    const config = fs.readFileSync(path.join(f.directory, "started"), "utf8");
    expect(config).toContain("dns_listen = []");
    expect(fs.existsSync(path.join(f.directory, "arti-state", "state"))).toBe(
      true,
    );
    await f.manager.close();
    expect(first.signal.aborted).toBe(true);
    expect(f.manager.getWalletSocksEndpoint()).toBeNull();
    await expect(f.manager.start()).rejects.toMatchObject({
      code: "TOR_NOT_READY",
    });
  } finally {
    await f.manager.close();
  }
});
test("bootstrap exit and parent cancellation never publish an endpoint", async () => {
  for (const mode of ["exit", "wait"]) {
    const f = fixture(mode);
    try {
      const work = f.manager.start();
      const refused = expect(work).rejects.toMatchObject({
        code: "TOR_NOT_READY",
      });
      if (mode === "wait") {
        // Wait for the fixture's process-ready marker, never for real networking.
        const limit = Date.now() + 5000;
        while (!fs.existsSync(path.join(f.directory, "started"))) {
          if (Date.now() >= limit) throw Error("fixture child did not start");
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        f.controller.abort();
      }
      await refused;
      await f.manager.closed;
      expect(f.manager.getWalletSocksEndpoint()).toBeNull();
      await expect(f.manager.start()).rejects.toMatchObject({
        code: "TOR_NOT_READY",
      });
    } finally {
      await f.manager.close();
    }
  }
});
test("a mismatched binary and a lifetime ended before start cannot spawn", async () => {
  const f = fixture();
  const wrong = createTorManager({ ...f.options, sha256: "0".repeat(64) });
  try {
    await expect(wrong.start()).rejects.toMatchObject({
      code: "TOR_NOT_READY",
    });
    await wrong.closed;
    f.controller.abort();
    await f.manager.closed;
    await expect(f.manager.start()).rejects.toMatchObject({
      code: "TOR_NOT_READY",
    });
    expect(fs.existsSync(path.join(f.directory, "started"))).toBe(false);
    expect(fs.existsSync(path.join(f.directory, "arti-state"))).toBe(false);
  } finally {
    await wrong.close();
    await f.manager.close();
  }
});
test("readiness logs without an actual SOCKS listener cannot publish an endpoint", async () => {
  const f = fixture("fake");
  try {
    await expect(f.manager.start()).rejects.toMatchObject({
      code: "TOR_NOT_READY",
    });
    await f.manager.closed;
    expect(f.manager.getWalletSocksEndpoint()).toBeNull();
  } finally {
    await f.manager.close();
  }
});
test("a stale proxy state lock refuses even when bootstrap and listener look ready", async () => {
  const f = fixture("conflict");
  try {
    await expect(f.manager.start()).rejects.toMatchObject({
      code: "TOR_NOT_READY",
    });
    await f.manager.closed;
    expect(f.manager.getWalletSocksEndpoint()).toBeNull();
  } finally {
    await f.manager.close();
  }
});
test("SIGKILL of the owning main process closes its pipe and terminates the proxy", async () => {
  const f = fixture();
  await f.manager.close();
  const { signal: _signal, ...options } = f.options;
  const source = `const {createTorManager}=require(${JSON.stringify(require.resolve("../examples/reference-wallet/host/tor.cjs"))});
  createTorManager({...${JSON.stringify(options)},signal:new AbortController().signal}).start().then(()=>{process.stdout.write('ready\\n');process.stdin.resume();},()=>process.exit(2));`;
  const parent = spawn(process.execPath, ["-e", source], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    const ready = await Promise.race([
      once(parent.stdout, "data").then(([bytes]) => bytes.toString()),
      once(parent, "exit").then(() => {
        throw Error("fixture parent exited before readiness");
      }),
    ]);
    expect(ready).toBe("ready\n");
    const exited = once(parent, "exit");
    parent.kill("SIGKILL");
    await exited;
    const limit = Date.now() + 5000;
    while (!fs.existsSync(path.join(f.directory, "closed"))) {
      if (Date.now() >= limit)
        throw Error("proxy survived owning-process crash");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    if (parent.exitCode === null && parent.signalCode === null)
      parent.kill("SIGKILL");
  }
});
