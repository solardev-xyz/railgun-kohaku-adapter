"use strict";
const { EventEmitter } = require("node:events");
const {
  installFatalHandlers,
} = require("../examples/reference-wallet/fatal.cjs");
test.each(["uncaughtException", "unhandledRejection"])(
  "%s never opens an error dialog or logs the original payload",
  (event) => {
    const runtime = new EventEmitter(),
      app = { exit: jest.fn() },
      lifetime = new AbortController(),
      lock = jest.fn();
    runtime.stdin = { isTTY: true, isRaw: true, setRawMode: jest.fn() };
    runtime.stderr = { write: jest.fn() };
    installFatalHandlers({
      app,
      resources: () => ({ lifetime, vault: { lock } }),
      runtime,
    });
    runtime.emit(event, Error("private provider payload must not be logged"));
    expect(runtime.stdin.setRawMode).toHaveBeenCalledWith(false);
    expect(lifetime.signal.aborted).toBe(true);
    expect(lock).toHaveBeenCalledTimes(1);
    expect(app.exit).toHaveBeenCalledWith(1);
    expect(runtime.stderr.write.mock.calls[0][0]).not.toContain(
      "private provider",
    );
    runtime.emit(event, Error("again"));
    expect(app.exit).toHaveBeenCalledTimes(1);
  },
);
