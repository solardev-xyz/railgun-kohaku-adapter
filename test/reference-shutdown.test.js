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
