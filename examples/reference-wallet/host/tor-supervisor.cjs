"use strict";
// A small lifetime guardian, started as Node (also under Electron-as-Node).
// The wallet owns stdin: EOF after even SIGKILL shuts down the proxy. The
// guardian stays alive until the original child and its output pipes close.
const { spawn } = require("node:child_process");
const path = require("node:path");
const [binary, config] = process.argv.slice(2);
if (!path.isAbsolute(binary || "") || !path.isAbsolute(config || ""))
  process.exit(2);
let stopping = false,
  childClosed = false,
  force;
const child = spawn(binary, ["proxy", "-c", config], {
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});
function stop() {
  if (stopping || childClosed) return;
  stopping = true;
  child.kill("SIGTERM");
  force = setTimeout(() => {
    if (!childClosed) child.kill("SIGKILL");
  }, 3000);
}
function emit(record) {
  if (process.stdout.destroyed) {
    stop();
    return;
  }
  process.stdout.write(JSON.stringify(record) + "\n");
}
process.stdout.on("error", stop);
process.stdin.on("end", stop);
process.stdin.on("error", stop);
process.stdin.resume();
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
child.once("spawn", () => emit({ event: "spawn", pid: child.pid }));
for (const stream of [child.stdout, child.stderr])
  stream.on("data", (bytes) => {
    // Bound each framing record even when a child produces a large output chunk.
    for (let i = 0; i < bytes.length; i += 8192)
      emit({
        event: "log",
        text: bytes.subarray(i, i + 8192).toString("utf8"),
      });
  });
child.once("error", () => emit({ event: "error" }));
child.once("exit", () => emit({ event: "exit" }));
child.once("close", () => {
  childClosed = true;
  clearTimeout(force);
  process.stdin.destroy();
  emit({ event: "closed" });
  process.exitCode = 0;
});
