/** Private owner-to-host loan bridge. The fixed owner supplies the request; no
 * public caller supplies this callback or receives this object. A broker may
 * consume ready while the original host callback remains held. Only the owner
 * of original child/callback drainage may release it. Unknown work is retained.
 */
"use strict";
const { types } = require("util");
const { credentials } = require("./host-bindings");
const then = Promise.prototype.then;
const fill = Uint8Array.prototype.fill;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
).get;
const retained = new Set();
const fail = () =>
  Object.assign(new Error("Railgun credential loan unavailable"), {
    code: "RAILGUN_CREDENTIAL_LOAN_REFUSED",
  });
function createRailgunCredentialLoan(request) {
  let supplied,
    original,
    observed = false,
    unknown = false,
    entered = false,
    released = false,
    failed = false,
    resolveReady,
    rejectReady,
    resolveClosed,
    rejectClosed,
    end;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const closed = new Promise((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });
  const barrier = new Promise((resolve) => {
    end = resolve;
  });
  then.call(ready, undefined, () => {});
  then.call(closed, undefined, () => {});
  const state = {};
  retained.add(state);
  const wipe = () => {
    try {
      if (supplied) Reflect.apply(fill, supplied.bytes, [0]);
    } catch {
      /* Detached transfer has no accessible bytes. */
    }
  };
  function provide() {
    if (!supplied || !observed || unknown || failed || released) return;
    if (Reflect.apply(aborted, request.signal, [])) {
      wipe();
      rejectReady(fail());
      return;
    }
    resolveReady(supplied);
  }
  Reflect.apply(add, request.signal, ["abort", wipe, { once: true }]);
  // This native original is created here, never supplied by an operation.
  const consume = async (loan) => {
    if (
      !loan ||
      types.isProxy(loan) ||
      Object.getPrototypeOf(loan) !== Object.prototype
    )
      throw fail();
    const fields = Object.getOwnPropertyDescriptors(loan);
    const expected =
      request.purpose === "storage-root"
        ? ["bytes", "profileGuard"]
        : ["bytes"];
    if (
      Reflect.ownKeys(fields).length !== expected.length ||
      expected.some(
        (name) =>
          !fields[name] ||
          !Object.hasOwn(fields[name], "value") ||
          !fields[name].enumerable,
      )
    )
      throw fail();
    const bytes = fields.bytes.value;
    if (
      !types.isUint8Array(bytes) ||
      bytes.byteLength !== 32 ||
      bytes.byteOffset !== 0 ||
      !types.isArrayBuffer(bytes.buffer) ||
      bytes.buffer.byteLength !== 32
    )
      throw fail();
    if (entered || released || failed) {
      Reflect.apply(fill, bytes, [0]);
      throw fail();
    }
    entered = true;
    supplied = Object.freeze(
      request.purpose === "storage-root"
        ? { bytes, profileGuard: fields.profileGuard.value }
        : { bytes },
    );
    if (unknown || Reflect.apply(aborted, request.signal, [])) wipe();
    provide();
    await barrier;
  };
  try {
    original = credentials.withMaterial(request, consume);
    state.original = original;
    if (!types.isPromise(original)) throw fail();
    then.call(
      original,
      (value) => {
        if (!entered || value !== undefined) {
          failed = true;
          rejectReady(fail());
          rejectClosed(fail());
        } else resolveClosed();
        wipe();
        Reflect.apply(remove, request.signal, ["abort", wipe]);
        retained.delete(state);
      },
      (error) => {
        failed = true;
        rejectReady(error);
        rejectClosed(error);
        wipe();
        Reflect.apply(remove, request.signal, ["abort", wipe]);
        retained.delete(state);
      },
    );
    observed = true;
    provide();
  } catch (error) {
    if (types.isPromise(original)) {
      // Constructor/species failure cannot establish observation or drainage.
      // Keep both promises pending and hold the callback barrier permanently.
      unknown = true;
      wipe();
    } else {
      failed = true;
      wipe();
      rejectReady(error);
      rejectClosed(error);
      Reflect.apply(remove, request.signal, ["abort", wipe]);
      retained.delete(state);
    }
  }
  return Object.freeze({
    ready,
    closed,
    release() {
      if (unknown) throw fail();
      if (released) return;
      released = true;
      end();
    },
  });
}
module.exports = { createRailgunCredentialLoan };
