"use strict";
const { createRailgunRemote } = require("../src/execution/railgun-remote.js");
class AbstractLevelDOWN {}
class AbstractIterator {}
const invoke = (object, method, ...args) =>
  new Promise((resolve, reject) =>
    object[method](...args, (error, ...values) =>
      error ? reject(error) : resolve(values),
    ),
  );
function fixture() {
  const controller = new AbortController();
  let finishEnd, endStarted;
  const started = new Promise((resolve) => {
    endStarted = resolve;
  });
  const send = jest.fn(async (wire) => {
    const call = JSON.parse(wire);
    const reply = (value) => JSON.stringify({ id: call.id, value });
    if (call.method === "open") return reply(1);
    if (call.method === "nextMany") return reply({ done: true, rows: [] });
    if (call.method === "end") {
      endStarted();
      return new Promise((resolve) => {
        finishEnd = () => resolve(reply(null));
      });
    }
    throw Error("Unexpected fixture request");
  });
  const remote = createRailgunRemote({
    AbstractLevelDOWN,
    AbstractIterator,
    signal: controller.signal,
    send,
  });
  return { remote, controller, send, started, finish: () => finishEnd() };
}
test("drain observes the final stream iterator's real close before allowing a result", async () => {
  const f = fixture();
  try {
    const iterator = f.remote.leveldown._iterator({
      gte: Buffer.from("a"),
      lte: Buffer.from("z"),
      limit: -1,
    });
    expect(await invoke(iterator, "_next")).toEqual([]);
    const ended = invoke(iterator, "_end");
    let complete = false;
    const barrier = f.remote.drain().then(() => {
      complete = true;
    });
    await f.started;
    expect(complete).toBe(false);
    f.finish();
    await ended;
    await barrier;
    expect(complete).toBe(true);
    expect(f.send.mock.calls.map(([wire]) => JSON.parse(wire).method)).toEqual([
      "open",
      "nextMany",
      "end",
    ]);
    await expect(
      invoke(f.remote.leveldown, "_get", Buffer.from("a"), {}),
    ).rejects.toThrow("unavailable");
    expect(f.send).toHaveBeenCalledTimes(3);
  } finally {
    f.remote.close();
  }
});
test("an exhausted cursor without stream destruction is never silently closed", async () => {
  const f = fixture();
  try {
    const iterator = f.remote.leveldown._iterator({
      gte: Buffer.from("a"),
      lte: Buffer.from("z"),
      limit: -1,
    });
    await invoke(iterator, "_next");
    await expect(f.remote.drain()).rejects.toThrow("unavailable");
    expect(
      f.send.mock.calls.some(([wire]) => JSON.parse(wire).method === "end"),
    ).toBe(false);
  } finally {
    f.remote.close();
  }
});
test("cancellation of an outstanding end refuses drainage and late delivery cannot revive it", async () => {
  const f = fixture();
  const iterator = f.remote.leveldown._iterator({
    gte: Buffer.from("a"),
    lte: Buffer.from("z"),
    limit: -1,
  });
  await invoke(iterator, "_next");
  const ended = expect(invoke(iterator, "_end")).resolves.toEqual([]);
  const barrier = expect(f.remote.drain()).rejects.toThrow("unavailable");
  await f.started;
  f.controller.abort();
  await ended;
  await barrier;
  f.finish();
  await expect(f.remote.drain()).rejects.toThrow("unavailable");
  f.remote.close();
});
test("new work during drainage revokes it before any new request", async () => {
  const f = fixture();
  const iterator = f.remote.leveldown._iterator({
    gte: Buffer.from("a"),
    lte: Buffer.from("z"),
    limit: -1,
  });
  await invoke(iterator, "_next");
  const ended = expect(invoke(iterator, "_end")).resolves.toEqual([]);
  const barrier = expect(f.remote.drain()).rejects.toThrow("unavailable");
  await f.started;
  await expect(
    f.remote.provider.request({ method: "anything", params: [] }),
  ).rejects.toThrow("unavailable");
  await ended;
  await barrier;
  expect(f.send).toHaveBeenCalledTimes(3);
  f.finish();
  f.remote.close();
});

test("deferred stream destruction is admitted during drain, but no other work is", async () => {
  const f = fixture();
  try {
    const iterator = f.remote.leveldown._iterator({
      gte: Buffer.from("a"),
      lte: Buffer.from("z"),
      limit: -1,
    });
    await invoke(iterator, "_next");
    const ended = new Promise((resolve, reject) =>
      setImmediate(() =>
        iterator._end((error) => (error ? reject(error) : resolve())),
      ),
    );
    const barrier = f.remote.drain();
    await f.started;
    f.finish();
    await ended;
    await barrier;
    expect(f.send).toHaveBeenCalledTimes(3);
  } finally {
    f.remote.close();
  }
});
test("an exhausted but never destroyed stream hits the bounded-round refusal", async () => {
  const f = fixture();
  try {
    const iterator = f.remote.leveldown._iterator({
      gte: Buffer.from("a"),
      lte: Buffer.from("z"),
      limit: -1,
    });
    await invoke(iterator, "_next");
    await expect(f.remote.drain()).rejects.toThrow("unavailable");
    expect(f.remote.signal.aborted).toBe(true);
    expect(f.send).toHaveBeenCalledTimes(2);
  } finally {
    f.remote.close();
  }
});
test("a partially consumed iterator and an active write group cannot seal", async () => {
  const f = fixture();
  const iterator = f.remote.leveldown._iterator({
    gte: Buffer.from("a"),
    lte: Buffer.from("z"),
    limit: -1,
  });
  await iterator.tail;
  await expect(f.remote.drain()).rejects.toThrow("unavailable");
  f.remote.close();
  const g = fixture();
  let release;
  const group = g.remote.withTransaction(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await expect(g.remote.drain()).rejects.toThrow("unavailable");
  release();
  await group;
  g.remote.close();
});

test.each([
  "get",
  "getMany",
  "batch",
  "clear",
  "iterator",
  "seek",
  "transaction",
])(
  "%s during drain refuses without admitting another request",
  async (kind) => {
    const f = fixture();
    const iterator = f.remote.leveldown._iterator({
      gte: Buffer.from("a"),
      lte: Buffer.from("z"),
      limit: -1,
    });
    await invoke(iterator, "_next");
    const ended = invoke(iterator, "_end");
    const barrier = expect(f.remote.drain()).rejects.toThrow("unavailable");
    await f.started;
    const db = f.remote.leveldown;
    const attempt = () => {
      switch (kind) {
        case "get":
          return invoke(db, "_get", Buffer.from("a"), {});
        case "getMany":
          return invoke(db, "_getMany", [Buffer.from("a")], {});
        case "batch":
          return invoke(db, "_batch", [], {});
        case "clear":
          return invoke(db, "_clear", {});
        case "iterator":
          return db._iterator({});
        case "seek":
          return iterator._seek(Buffer.from("a"));
        case "transaction":
          return f.remote.withTransaction(async () => {});
      }
    };
    await expect(Promise.resolve().then(attempt)).rejects.toThrow(
      "unavailable",
    );
    await barrier;
    await ended;
    expect(f.send).toHaveBeenCalledTimes(3);
    f.finish();
    f.remote.close();
  },
);
test("a genuinely partial cursor refuses without a synthetic end", async () => {
  const f = fixture();
  f.send.mockImplementation(async (wire) => {
    const call = JSON.parse(wire);
    return JSON.stringify({
      id: call.id,
      value:
        call.method === "open"
          ? 1
          : {
              done: false,
              rows: [
                [
                  Buffer.from("key").toString("base64"),
                  Buffer.from("value").toString("base64"),
                ],
              ],
            },
    });
  });
  const iterator = f.remote.leveldown._iterator({
    gte: Buffer.from("a"),
    lte: Buffer.from("z"),
    limit: -1,
  });
  await invoke(iterator, "_next");
  await expect(f.remote.drain()).rejects.toThrow("unavailable");
  expect(f.send.mock.calls.map(([wire]) => JSON.parse(wire).method)).toEqual([
    "open",
    "nextMany",
  ]);
  f.remote.close();
});
