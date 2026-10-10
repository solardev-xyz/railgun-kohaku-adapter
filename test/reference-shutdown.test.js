"use strict";
const { EventEmitter } = require("node:events");
const { createShutdown } = require("../examples/reference-wallet/shutdown.cjs");
test("quit is prevented until original session and proxy drain, then vault locks", async () => {
  const app = new EventEmitter(),
    lifetime = new AbortController(),
    order = [];
  app.quit = jest.fn();
  app.exit = jest.fn();
  let sessionDone, torDone;
  const closed = new Promise((resolve) => {
    sessionDone = resolve;
  });
  const proxy = new Promise((resolve) => {
    torDone = resolve;
  });
  const resources = {
    session: {
      close: jest.fn(async () => {
        order.push("session");
      }),
      closed,
    },
    composition: { close: jest.fn(() => order.push("composition")) },
    tor: {
      close: jest.fn(() => {
        order.push("tor");
        return proxy;
      }),
    },
    vault: { lock: jest.fn(() => order.push("vault")) },
  };
  const shutdown = createShutdown({
    app,
    lifetime,
    resources: () => resources,
  });
  const event = { preventDefault: jest.fn() };
  app.emit("before-quit", event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(lifetime.signal.aborted).toBe(true);
  expect(app.quit).not.toHaveBeenCalled();
  sessionDone();
  await new Promise((resolve) => setImmediate(resolve));
  expect(order).toEqual(["session", "composition", "tor"]);
  expect(app.quit).not.toHaveBeenCalled();
  torDone();
  await shutdown.close();
  await new Promise((resolve) => setImmediate(resolve));
  expect(order).toEqual(["session", "composition", "tor", "vault"]);
  expect(app.quit).toHaveBeenCalledTimes(1);
  const final = { preventDefault: jest.fn() };
  app.emit("before-quit", final);
  expect(final.preventDefault).not.toHaveBeenCalled();
});
test("deadline forces an explicitly reported exit without pretending original work drained", async () => {
  const app = new EventEmitter(),
    lifetime = new AbortController();
  app.quit = jest.fn();
  app.exit = jest.fn();
  const forced = jest.fn(),
    lock = jest.fn();
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const shutdown = createShutdown({
    app,
    lifetime,
    timeoutMs: 10,
    onForced: forced,
    resources: () => ({
      session: { close: () => pending, closed: pending },
      vault: { lock },
    }),
  });
  const closing = shutdown.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(forced).toHaveBeenCalledTimes(1);
  expect(app.exit).toHaveBeenCalledWith(1);
  expect(lock).toHaveBeenCalled();
  expect(app.quit).not.toHaveBeenCalled();
  finish();
  await closing;
});
test("shutdown waits for an in-flight opener and closes the session it returns late", async () => {
  const app = new EventEmitter();
  app.quit = jest.fn();
  app.exit = jest.fn();
  const lifetime = new AbortController();
  let settle;
  const resources = {
    operation: new Promise((resolve) => {
      settle = resolve;
    }),
  };
  const shutdown = createShutdown({
    app,
    lifetime,
    resources: () => resources,
  });
  let closed = false;
  const closing = shutdown.close().then(() => {
    closed = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(closed).toBe(false);
  resources.session = {
    close: jest.fn(async () => {}),
    closed: Promise.resolve(),
  };
  settle();
  await closing;
  expect(resources.session.close).toHaveBeenCalledTimes(1);
});
test("forwarded signal bursts preserve drainage, but a later interrupt can force exit", async () => {
  const app = new EventEmitter(), runtime = new EventEmitter();
  app.quit = jest.fn(); app.exit = jest.fn();
  const lifetime = new AbortController(), lock = jest.fn(), forced = jest.fn();
  let finish, time = 0;
  const operation = new Promise(resolve => { finish = resolve; });
  const shutdown = createShutdown({ app, lifetime, runtime, now: () => time,
    onForced: forced, resources: () => ({ operation, vault: { lock } }) });
  runtime.emit("SIGINT");
  expect(lifetime.signal.aborted).toBe(true);
  time = 10; runtime.emit("SIGINT");
  time = 20; runtime.emit("SIGTERM");
  expect(app.exit).not.toHaveBeenCalled();
  expect(app.quit).not.toHaveBeenCalled();
  time = 1499; runtime.emit("SIGHUP");
  expect(app.exit).not.toHaveBeenCalled();
  time = 1500; runtime.emit("SIGINT");
  expect(forced).toHaveBeenCalledWith("REFERENCE_SHUTDOWN_INTERRUPTED");
  expect(lock).toHaveBeenCalledTimes(1);
  expect(app.exit).toHaveBeenCalledWith(1);
  runtime.emit("SIGINT");
  expect(app.exit).toHaveBeenCalledTimes(1);
  finish(); await shutdown.close();
  await new Promise(resolve => setImmediate(resolve));
  expect(app.quit).not.toHaveBeenCalled();
});
test("a real child drains after two SIGINT deliveries ten milliseconds apart", async () => {
  const { spawn } = require("node:child_process");
  const modulePath = require.resolve("../examples/reference-wallet/shutdown.cjs");
  const child = spawn(process.execPath, ["-e", `
    const {EventEmitter}=require('node:events');
    const {createShutdown}=require(${JSON.stringify(modulePath)});
    const app=new EventEmitter(), lifetime=new AbortController();
    let finish; const operation=new Promise(resolve=>{finish=resolve;});
    app.quit=()=>process.exit(0); app.exit=code=>process.exit(code);
    createShutdown({app,lifetime,runtime:process,resources:()=>({operation}),timeoutMs:2000});
    lifetime.signal.addEventListener('abort',()=>setTimeout(()=>{
      process.stdout.write('DRAINED\\n');finish();
    },100));
    setInterval(()=>{},1000);
    process.stdout.write('READY\\n');
  `], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "", error = "", sent = false;
  const timers = [];
  const watchdog = setTimeout(() => child.kill("SIGKILL"), 8000);
  child.stdout.on("data", bytes => {
    output += bytes;
    if (!sent && output.includes("READY\n")) {
      sent = true; child.kill("SIGINT");
      timers.push(setTimeout(() => child.kill("SIGINT"), 10));
    }
  });
  child.stderr.on("data", bytes => { error += bytes; });
  try {
    const result = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code, signal) => resolve({code, signal}));
    });
    expect(result).toEqual({code: 0, signal: null});
    expect(output).toContain("DRAINED\n");
    expect(error).toBe("");
  } finally {
    clearTimeout(watchdog); timers.forEach(clearTimeout);
  }
});
