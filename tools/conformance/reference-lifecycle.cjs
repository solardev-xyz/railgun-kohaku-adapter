"use strict";
// Native Electron lifecycle probes in marked, empty, disposable roots only.
// The proxy is a pinned local fixture, never Arti or an external destination.
const { app } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { createHash } = require("node:crypto");
const lifetime = new AbortController();
let vault;
require("../../examples/reference-wallet/fatal.cjs").installFatalHandlers({
  app,
  resources: () => ({ vault, lifetime }),
});
const [mode, node, priorRoot] = process.argv.slice(2);
if (
  !["fatal", "unhandled", "blocked", "hold", "contender"].includes(mode) ||
  !path.isAbsolute(node || "")
)
  throw Error("Invalid lifecycle fixture mode");
const root = priorRoot
  ? fs.realpathSync(priorRoot)
  : fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "railgun-reference-lifecycle-")),
    );
if (
  path.dirname(root) !== fs.realpathSync(os.tmpdir()) ||
  !path.basename(root).startsWith("railgun-reference-lifecycle-")
)
  throw Error("Disposable root required");
const marker = path.join(root, "PUBLIC-CONFORMANCE.json");
if (priorRoot) {
  if (
    fs.readFileSync(marker, "utf8") !==
    "railgun-reference-lifecycle-public-v1\n"
  )
    throw Error("Not a lifecycle fixture");
} else {
  fs.writeFileSync(marker, "railgun-reference-lifecycle-public-v1\n", {
    flag: "wx",
    mode: 0o600,
  });
  for (const name of ["profile", "appdata", "proxy"])
    fs.mkdirSync(path.join(root, name), { mode: 0o700 });
}
app.setPath("appData", path.join(root, "appdata"));
let locked = false;
try {
  require("../../examples/reference-wallet/host/profile-lock.cjs").acquireProfileLock(
    { root: path.join(root, "profile") },
  );
  locked = true;
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      status: "refused",
      stage: "before-vault",
      code: error.code,
      root,
    }) + "\n",
  );
  app.exit(2);
}
if (locked) {
  fs.writeFileSync(
    path.join(root, `after-lock-${process.pid}`),
    "public fixture",
    { flag: "wx", mode: 0o600 },
  );
  vault = {
    lock: () => fs.writeFileSync(path.join(root, "vault-locked"), "locked"),
  };
  app.dock?.hide();
  app.whenReady().then(async () => {
    if (["hold", "blocked", "contender"].includes(mode)) {
      process.stdout.write(
        JSON.stringify({ ready: true, mode, root, pid: process.pid }) + "\n",
      );
      if (mode === "blocked")
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 45000);
      else if (mode === "hold")
        await new Promise((resolve) => process.stdin.once("data", resolve));
      app.quit();
      return;
    }
    const fixture = path.join(root, "proxy.cjs"),
      binary = path.join(root, "proxy-fixture");
    fs.writeFileSync(
      fixture,
      `const fs=require('node:fs'),net=require('node:net');
const config=fs.readFileSync(process.argv[4],'utf8');
const port=Number(config.match(/socks_listen = "127\\.0\\.0\\.1:(\\d+)"/)[1]);
const server=net.createServer(socket=>socket.once('data',()=>socket.write(Buffer.from([5,2]))));
server.listen(port,'127.0.0.1',()=>process.stdout.write('Listening on 127.0.0.1:'+port+'\\nBootstrapped 100%'));
process.on('SIGTERM',()=>server.close(()=>{fs.writeFileSync(${JSON.stringify(path.join(root, "proxy-closed"))},'closed');process.exit(0);}));
`,
      { flag: "wx", mode: 0o600 },
    );
    const quote = (value) => `'${value.replace(/'/g, `'"'"'`)}'`;
    const bytes = Buffer.from(
      `#!/bin/sh\nexec ${quote(node)} ${quote(fixture)} "$@"\n`,
    );
    fs.writeFileSync(binary, bytes, { flag: "wx", mode: 0o700 });
    const tor =
      require("../../examples/reference-wallet/host/tor.cjs").createTorManager({
        binary,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        directory: path.join(root, "proxy"),
        signal: lifetime.signal,
      });
    await tor.start();
    process.stdout.write(
      JSON.stringify({ ready: true, mode, root, pid: process.pid }) + "\n",
    );
    setTimeout(() => {
      if (mode === "fatal")
        throw Error("Public fixture fatal error; must not appear in output");
      void Promise.reject(
        Error("Public fixture rejection; must not appear in output"),
      );
    }, 50);
  });
}
