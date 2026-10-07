"use strict";
let material;
jest.mock("../src/owners/host-bindings", () => ({
  credentials: { withMaterial: (...args) => material(...args) },
}));
const {
  createRailgunCredentialLoan,
} = require("../src/owners/credential-loan");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function setup({ late, after } = {}) {
  const controller = new AbortController(),
    bytes = new Uint8Array(32).fill(10),
    calls = [];
  const request = {
    handle: {},
    vaultSession: new AbortController().signal,
    accountIndex: 0,
    purpose: "viewing",
    signal: controller.signal,
  };
  material = jest.fn(async (input, consume) => {
    calls.push("host-start");
    expect(input).toBe(request);
    if (late) await late;
    const original = consume(Object.freeze({ bytes }));
    calls.push("callback-created");
    await original;
    calls.push("callback-settled");
    if (after) await after;
    bytes.fill(0);
    calls.push("host-settled");
  });
  return { controller, bytes, calls, request };
}
test("ready can fulfill while original callback and host promise remain pending", async () => {
  const s = setup(),
    loan = createRailgunCredentialLoan(s.request);
  let finished = false;
  loan.closed.then(() => {
    finished = true;
  });
  expect((await loan.ready).bytes).toBe(s.bytes);
  expect([...s.bytes]).toEqual(Array(32).fill(10));
  await tick();
  expect(finished).toBe(false);
  expect(s.calls).toEqual(["host-start", "callback-created"]);
  loan.release();
  await loan.closed;
  expect(s.calls).toEqual([
    "host-start",
    "callback-created",
    "callback-settled",
    "host-settled",
  ]);
  expect([...s.bytes]).toEqual(Array(32).fill(0));
});
test("release does not fabricate host settlement; later original rejection remains exact", async () => {
  const end = deferred(),
    s = setup({ after: end.promise }),
    loan = createRailgunCredentialLoan(s.request),
    error = new Error("late-original");
  await loan.ready;
  loan.release();
  let done = false;
  loan.closed.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  await tick();
  expect(done).toBe(false);
  end.reject(error);
  await expect(loan.closed).rejects.toBe(error);
  expect([...s.bytes]).toEqual(Array(32).fill(0));
});
test("abort wipes immediately but never releases the held original callback", async () => {
  const s = setup(),
    loan = createRailgunCredentialLoan(s.request);
  await loan.ready;
  let done = false;
  loan.closed.then(() => {
    done = true;
  });
  s.controller.abort();
  expect([...s.bytes]).toEqual(Array(32).fill(0));
  await tick();
  expect(done).toBe(false);
  expect(s.calls).not.toContain("callback-settled");
  loan.release();
  await loan.closed;
});
test("late material after revocation is wiped before readiness and original must settle", async () => {
  const late = deferred(),
    s = setup({ late: late.promise }),
    loan = createRailgunCredentialLoan(s.request);
  s.controller.abort();
  late.resolve();
  await expect(loan.ready).rejects.toThrow();
  expect([...s.bytes]).toEqual(Array(32).fill(0));
  let done = false;
  loan.closed.then(() => {
    done = true;
  });
  await tick();
  expect(done).toBe(false);
  loan.release();
  await loan.closed;
});
test("release before a late callback refuses loan exposure and drains the actual original", async () => {
  const late = deferred(),
    s = setup({ late: late.promise }),
    loan = createRailgunCredentialLoan(s.request);
  loan.release();
  late.resolve();
  await expect(loan.ready).rejects.toThrow();
  await expect(loan.closed).rejects.toThrow();
});
test("host failure before callback rejects both observations by original identity", async () => {
  const s = setup(),
    error = new Error("derivation");
  material = () => Promise.reject(error);
  const loan = createRailgunCredentialLoan(s.request);
  await expect(loan.ready).rejects.toBe(error);
  await expect(loan.closed).rejects.toBe(error);
});
test("bypasses an overridden own then without invoking it", async () => {
  const s = setup(),
    actual = material,
    trap = jest.fn(() => {
      throw new Error("own then");
    });
  material = (...args) => {
    const original = actual(...args);
    original.then = trap;
    return original;
  };
  const loan = createRailgunCredentialLoan(s.request);
  await loan.ready;
  loan.release();
  await loan.closed;
  expect(trap).not.toHaveBeenCalled();
});
test("unobservable native original keeps callback and observations pending, wipes and refuses release", async () => {
  const s = setup(),
    actual = material;
  material = (...args) => {
    const original = actual(...args);
    Object.defineProperty(original, "constructor", {
      get() {
        throw new Error("species");
      },
    });
    return original;
  };
  const loan = createRailgunCredentialLoan(s.request);
  let ready = false,
    closed = false;
  loan.ready.then(
    () => {
      ready = true;
    },
    () => {
      ready = true;
    },
  );
  loan.closed.then(
    () => {
      closed = true;
    },
    () => {
      closed = true;
    },
  );
  await tick();
  expect({ ready, closed }).toEqual({ ready: false, closed: false });
  expect([...s.bytes]).toEqual(Array(32).fill(0));
  expect(() => loan.release()).toThrow();
  expect(s.calls).not.toContain("callback-settled");
});
test("non-native host result is refused without thenable invocation", async () => {
  const s = setup(),
    then = jest.fn();
  material = () => ({ then });
  const loan = createRailgunCredentialLoan(s.request);
  await expect(loan.ready).rejects.toThrow();
  await expect(loan.closed).rejects.toThrow();
  expect(then).not.toHaveBeenCalled();
});
test("storage root retains genuine guard identity without exporting seed or copying bytes", async () => {
  const s = setup();
  s.request.purpose = "storage-root";
  const guard = Object.freeze({ assert() {} });
  material = async (_request, consume) => {
    await consume(Object.freeze({ bytes: s.bytes, profileGuard: guard }));
  };
  const loan = createRailgunCredentialLoan(s.request),
    value = await loan.ready;
  expect(Object.keys(value)).toEqual(["bytes", "profileGuard"]);
  expect(value.profileGuard).toBe(guard);
  expect(value.bytes).toBe(s.bytes);
  loan.release();
  await loan.closed;
});
