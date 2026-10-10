"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  net = require("node:net"),
  { spawn } = require("node:child_process"),
  { createHash } = require("node:crypto");
const { readFile, writeFile, assertRoot } = require("./files.cjs");
const { privacyError } = require("./errors.cjs");
function probeSocks(port, signal) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let result = false,
      ended = false,
      bytes = Buffer.alloc(0);
    function finish(ok) {
      if (ended) return;
      ended = true;
      result = ok;
      socket.destroy();
    }
    const abort = () => finish(false),
      timer = setTimeout(abort, 3000);
    signal.addEventListener("abort", abort, { once: true });
    socket.once("connect", () => socket.write(Buffer.from([5, 1, 2])));
    socket.on("data", (chunk) => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length >= 2)
        finish(bytes.length === 2 && bytes[0] === 5 && bytes[1] === 2);
    });
    socket.on("error", abort);
    socket.once("close", () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (result && !signal.aborted) resolve();
      else reject(privacyError("TOR_NOT_READY", "SOCKS listener unavailable"));
    });
    if (signal.aborted) abort();
  });
}
// The readiness probe discloses no destination or isolation token: method
// negotiation only, then closes. It is not Tor circuit qualification.
/** Own one explicitly pinned Arti process. Never attach to a discovered port,
 * inherit user Tor configuration, restart silently or fall back to direct HTTP.
 * Loopback port allocation has the normal local bind race; a malicious local
 * process is outside this host's isolation claim. TLS still verifies services. */
function createTorManager({ binary, sha256, directory, signal }) {
  if (
    !path.isAbsolute(binary) ||
    !/^[0-9a-f]{64}$/.test(sha256) ||
    !(signal instanceof AbortSignal)
  )
    throw privacyError("TOR_NOT_READY", "Invalid Tor configuration");
  assertRoot(directory);
  const controller = new AbortController();
  let child,
    endpoint,
    starting,
    stopped = false,
    observed = false,
    resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  function close() {
    if (stopped) return closed;
    stopped = true;
    controller.abort();
    signal.removeEventListener("abort", close);
    if (child && !observed) {
      child.stdin.end();
    } else if (!starting) resolveClosed();
    return closed;
  }
  signal.addEventListener("abort", close, { once: true });
  if (signal.aborted) close();
  async function start() {
    if (stopped || controller.signal.aborted)
      throw privacyError("TOR_NOT_READY", "Tor lifetime ended");
    if (starting) return starting;
    starting = (async () => {
      try {
        const parent = fs.realpathSync(path.dirname(binary));
        const bytes = readFile(parent, binary, 128 * 1024 * 1024);
        if (createHash("sha256").update(bytes).digest("hex") !== sha256)
          throw privacyError("TOR_NOT_READY", "Tor binary identity mismatch");
        const executable = path.join(directory, `arti-${sha256}`);
        if (!fs.existsSync(executable)) {
          writeFile(directory, executable, bytes, { create: true });
          fs.chmodSync(executable, 0o700);
        }
        if (
          createHash("sha256")
            .update(readFile(directory, executable, 128 * 1024 * 1024))
            .digest("hex") !== sha256
        )
          throw privacyError("TOR_NOT_READY", "Tor executable copy changed");
        const reservation = net.createServer();
        const port = await new Promise((resolve, reject) => {
          reservation.once("error", reject);
          reservation.listen(0, "127.0.0.1", () => {
            const port = reservation.address().port;
            reservation.close((error) =>
              error ? reject(error) : resolve(port),
            );
          });
        });
        if (stopped) throw privacyError("TOR_NOT_READY", "Tor lifetime ended");
        // Retain one guard set/cache across starts under the profile's OS lock.
        const state = path.join(directory, "arti-state");
        fs.mkdirSync(state, { recursive: true, mode: 0o700 });
        assertRoot(state);
        for (const name of ["cache", "state"]) {
          fs.mkdirSync(path.join(state, name), {
            recursive: true,
            mode: 0o700,
          });
          assertRoot(path.join(state, name));
        }
        const config = path.join(state, "arti.toml");
        writeFile(
          state,
          config,
          `[proxy]\nsocks_listen = "127.0.0.1:${port}"\ndns_listen = []\n[storage]\ncache_dir = ${JSON.stringify(path.join(state, "cache"))}\nstate_dir = ${JSON.stringify(path.join(state, "state"))}\n[logging]\nconsole = "info"\n`,
        );
        child = spawn(
          process.execPath,
          [path.join(__dirname, "tor-supervisor.cjs"), executable, config],
          {
            stdio: ["pipe", "pipe", "ignore"],
            env: {
              ...Object.fromEntries(
                ["PATH", "SYSTEMROOT", "WINDIR", "TMPDIR", "TEMP"]
                  .filter((key) => typeof process.env[key] === "string")
                  .map((key) => [key, process.env[key]]),
              ),
              ELECTRON_RUN_AS_NODE: "1",
            },
          },
        );
        child.stdin.on("error", () => controller.abort());
        child.once("close", () => {
          observed = true;
          controller.abort();
          signal.removeEventListener("abort", close);
          resolveClosed();
        });
        child.on("error", () => controller.abort());
        child.once("exit", () => controller.abort());
        await new Promise((resolve, reject) => {
          let tail = "",
            frames = "",
            listening = false,
            bootstrapped = false,
            spawned = false,
            checking = false,
            done = false;
          const timer = setTimeout(() => finish(false), 180000);
          timer.unref();
          function finish(ok) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            controller.signal.removeEventListener("abort", abort);
            if (ok) resolve();
            else
              reject(
                privacyError("TOR_NOT_READY", "Tor bootstrap unavailable"),
              );
          }
          const abort = () => finish(false);
          const append = (chunk) => {
            frames += chunk.toString("utf8");
            if (frames.length > 131072) {
              finish(false);
              return;
            }
            let newline;
            while ((newline = frames.indexOf("\n")) >= 0) {
              let record;
              try {
                record = JSON.parse(frames.slice(0, newline));
              } catch {
                finish(false);
                return;
              }
              frames = frames.slice(newline + 1);
              if (record.event === "spawn")
                spawned = Number.isSafeInteger(record.pid) && record.pid > 0;
              else if (["error", "exit", "closed"].includes(record.event)) {
                controller.abort();
                return;
              } else if (
                record.event === "log" &&
                typeof record.text === "string"
              ) {
                tail = (tail + record.text).slice(-65536);
                if (
                  /Another process has the lock on our state files|proceed in read-only mode|Another process is bootstrapping the directory/i.test(
                    tail,
                  )
                ) {
                  close();
                  finish(false);
                  return;
                }
                listening ||= tail
                  .split(/\r?\n/)
                  .slice(0, -1)
                  .some((line) =>
                    line
                      .split(String.fromCharCode(27))
                      .map((part) => part.replace(/^\[[0-9;]*m/, ""))
                      .join("")
                      .endsWith(`Listening on 127.0.0.1:${port}`),
                  );
                bootstrapped ||=
                  /Bootstrapped 100%|100%: ready|Sufficiently bootstrapped; proxy now functional/i.test(
                    tail,
                  );
              }
            }
            if (spawned && listening && bootstrapped && !checking) {
              checking = true;
              probeSocks(port, controller.signal).then(
                () =>
                  finish(!controller.signal.aborted && child.exitCode === null),
                () => finish(false),
              );
            }
          };
          controller.signal.addEventListener("abort", abort, { once: true });
          child.stdout.on("data", append);
          if (controller.signal.aborted) abort();
        });
        if (stopped || controller.signal.aborted)
          throw privacyError("TOR_NOT_READY", "Tor lifetime ended");
        endpoint = Object.freeze({
          host: "127.0.0.1",
          port,
          signal: controller.signal,
        });
        return endpoint;
      } catch {
        close();
        if (!child) resolveClosed();
        throw privacyError("TOR_NOT_READY", "Tor bootstrap unavailable");
      }
    })();
    return starting;
  }
  function getWalletSocksEndpoint() {
    return endpoint && !controller.signal.aborted ? endpoint : null;
  }
  return Object.freeze({ start, close, closed, getWalletSocksEndpoint });
}
module.exports = { createTorManager };
