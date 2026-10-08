/** Private trusted-main lifecycle facade. No package export or renderer bridge. */
"use strict";
const path = require("path");
const { types } = require("util");
const host = require("./host-bindings");
const fail = () =>
  Object.assign(new Error("Railgun account facade unavailable"), {
    code: "RAILGUN_ACCOUNT_FACADE_REFUSED",
  });
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
).get;
function signal(value) {
  if (
    !value ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== AbortSignal.prototype ||
    Object.hasOwn(value, "aborted") ||
    Object.hasOwn(value, "reason")
  )
    throw fail();
  if (Reflect.apply(aborted, value, [])) throw fail();
  return value;
}
function record(value, keys) {
  if (
    !value ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length) throw fail();
  const out = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !Object.hasOwn(descriptor, "value") ||
      !descriptor.enumerable
    )
      throw fail();
    out[key] = descriptor.value;
  }
  return out;
}
// Owned settlement promise; ignore the species-selected result of intrinsic then.
// Fulfillment values are intentionally not assimilated into a shutdown barrier.
function observe(value, unknown = () => {}) {
  if (!types.isPromise(value)) throw fail();
  return new Promise((resolve, reject) => {
    try {
      Promise.prototype.then.call(
        value,
        () => {
          resolve();
        },
        reject,
      );
    } catch (error) {
      unknown(error);
      reject(error);
    }
  });
}
let initialized = false;
function initializeRailgunMain(options) {
  if (initialized) throw fail();
  initialized = true;
  const { host: capabilities, runtime: input } = record(options, [
    "host",
    "runtime",
  ]);
  host.initializeRailgunOwnerHost(capabilities);
  const runtime = Object.freeze(
    record(input, ["archive", "proverArchive", "artifactDirectory"]),
  );
  for (const value of Object.values(runtime))
    if (
      typeof value !== "string" ||
      value.length > 4096 ||
      !path.isAbsolute(value)
    )
      throw fail();
  // Capture fixed source identity and paired bindings before loading owners.
  const identityApi = require("./railgun-identity.js");
  const enrollmentApi = require("./railgun-account-enrollment.js");
  const publicApi = require("./railgun-account-public.js");
  const walletApi = require("./railgun-account-wallet.js");
  const pluginApi = require("./railgun-kohaku-plugin.js");
  const recoveryApi = require("./railgun-kohaku-recovery.js");
  const application = signal(host.platform.applicationLifetime());
  const occupied = new Map();
  const sessions = new WeakMap();
  function open(options, create) {
    host.assertRailgunOwnerHost();
    const { accountIndex, signal: caller } = record(options, [
      "accountIndex",
      "signal",
    ]);
    if (
      !Number.isInteger(accountIndex) ||
      accountIndex < 0 ||
      accountIndex > 65535
    )
      throw fail();
    signal(caller);
    signal(application);
    const profile = host.profiles.getActiveProfile();
    if (
      !profile ||
      typeof profile.userDataDir !== "string" ||
      !path.isAbsolute(profile.userDataDir)
    )
      throw fail();
    const key = JSON.stringify([profile.userDataDir, accountIndex]);
    if (occupied.has(key)) throw fail();
    const state = {
      identity: null,
      enrollment: null,
      public: null,
      account: null,
      lane: null,
      closing: false,
      busy: false,
      failure: null,
      unknown: false,
      pending: new Set(),
      cleanup: new Map(),
    };
    occupied.set(key, state);
    const controller = new AbortController();
    const lifetime = AbortSignal.any([caller, application, controller.signal]);
    let resolveClosed, rejectClosed, opening, finishOpening;
    const openingBarrier = new Promise((resolve) => {
      finishOpening = resolve;
    });
    const closed = new Promise((resolve, reject) => {
      resolveClosed = resolve;
      rejectClosed = reject;
    });
    closed.catch(() => {});
    function remember(error) {
      state.failure ||= error;
    }
    function retain(original, onSettled = () => {}) {
      let observed;
      try {
        observed = observe(original, (error) => {
          state.unknown = true;
          remember(error);
        });
      } catch (error) {
        state.unknown = true;
        remember(error);
        throw error;
      }
      state.pending.add(observed);
      observed.then(
        () => {
          state.pending.delete(observed);
          onSettled();
        },
        (error) => {
          state.pending.delete(observed);
          onSettled();
          // Ordinary operation refusal is not unknown closure. Its owning lane
          // retains the independent original closed barrier.
          if (
            error?.code?.endsWith("_EXIT_UNOBSERVED") ||
            error?.code?.endsWith("_DRAIN_UNOBSERVED")
          ) {
            state.unknown = true;
            remember(error);
          }
        },
      );
      return original;
    }
    function current() {
      if (
        state.closing ||
        state.unknown ||
        state.failure ||
        lifetime.aborted ||
        sessions.get(session) !== state
      )
        throw fail();
      host.assertRailgunOwnerHost();
      if (host.profiles.getActiveProfile().userDataDir !== profile.userDataDir)
        throw fail();
    }
    function stop(value, kind) {
      if (!value || state.cleanup.has(value)) return;
      // Install before invoking a reentrant abort listener.
      const slot = { work: null };
      state.cleanup.set(value, slot);
      try {
        const returned = value.close();
        const original =
          kind === "lane"
            ? value.closed
            : kind === "enrollment"
              ? enrollmentApi.observeRailgunEnrollmentClosure(value)
              : returned;
        if (kind !== "identity") {
          slot.work = observe(original);
          slot.work.catch(remember);
        }
      } catch (error) {
        remember(error);
      }
    }
    function stopAll() {
      stop(state.lane, "lane");
      stop(state.account, "account");
      stop(state.public, "public");
      stop(state.enrollment, "enrollment");
      stop(state.identity, "identity");
    }
    function close() {
      if (state.closing) return closed;
      state.closing = true;
      controller.abort();
      stopAll();
      (async () => {
        // Opening and lane construction retain late resources before returning.
        await openingBarrier;
        while (state.pending.size) await Promise.allSettled([...state.pending]);
        stopAll();
        await Promise.allSettled(
          [...state.cleanup.values()]
            .map((entry) => entry.work)
            .filter(Boolean),
        );
        lifetime.removeEventListener("abort", onAbort);
        if (state.failure || state.unknown) throw state.failure || fail();
        if (occupied.get(key) === state) occupied.delete(key);
      })().then(resolveClosed, rejectClosed);
      return closed;
    }
    const onAbort = () => {
      if (Reflect.apply(aborted, lifetime, [])) close();
    };
    lifetime.addEventListener("abort", onAbort);
    async function acquire(kind, work) {
      const value = await work;
      state[kind] = value;
      if (state.closing) stop(value, kind);
      current();
      return value;
    }
    function owners() {
      return {
        identity: state.identity,
        enrollment: state.enrollment,
        coordinator: state.public.coordinator,
      };
    }
    function idle() {
      current();
      if (state.busy || state.lane || state.account) throw fail();
    }
    function run(invoke) {
      idle();
      state.busy = true;
      try {
        return retain(invoke(), () => {
          state.busy = false;
        });
      } catch (error) {
        state.busy = false;
        throw error;
      }
    }
    function lane(mode, options) {
      const keys = [
        "wallet",
        "signal",
        ...(mode === "read"
          ? []
          : [
              "reviewPreparation",
              "reviewTransaction",
              "gasLimit",
              "maxGasFee",
            ]),
      ];
      const data = record(options, keys);
      if (!["active", "advance", "new", "pending"].includes(data.wallet))
        throw fail();
      signal(data.signal);
      if (mode !== "read") {
        for (const callback of [data.reviewPreparation, data.reviewTransaction])
          if (typeof callback !== "function" || types.isProxy(callback))
            throw fail();
        if (
          typeof data.gasLimit !== "bigint" ||
          data.gasLimit <= 0n ||
          data.gasLimit > 3000000n ||
          typeof data.maxGasFee !== "bigint" ||
          data.maxGasFee <= 0n ||
          data.maxGasFee > 2000000000000000n
        )
          throw fail();
      }
      return run(async () => {
        let account, plugin;
        const laneSignal = AbortSignal.any([lifetime, data.signal]);
        const cancelledOpening = () => {
          if (Reflect.apply(aborted, laneSignal, []) && !plugin) close();
        };
        laneSignal.addEventListener("abort", cancelledOpening);
        try {
          account = await acquire(
            "account",
            walletApi.openRailgunAccountWallet({
              ...owners(),
              archive: runtime.archive,
              mode: data.wallet,
            }),
          );
          signal(laneSignal);
          plugin = pluginApi.createRailgunKohakuPlugin({
            account,
            owners: owners(),
            signal: laneSignal,
            mode,
            ...(mode === "read"
              ? {}
              : {
                  archive: runtime.archive,
                  ...(mode === "private"
                    ? {
                        proverArchive: runtime.proverArchive,
                        artifactDirectory: runtime.artifactDirectory,
                      }
                    : {}),
                  reviewPreparation: data.reviewPreparation,
                  reviewTransaction: data.reviewTransaction,
                  gasLimit: data.gasLimit,
                  maxGasFee: data.maxGasFee,
                }),
          });
          state.lane = plugin;
          state.account = null; // Actual plugin adopted it, including later replacement accounts.
          if (state.closing) stop(plugin, "lane");
          current();
          const operations = new WeakMap();
          let laneClosing = false;
          const laneCurrent = () => {
            current();
            if (laneClosing || state.lane !== plugin || plugin.signal.aborted)
              throw fail();
          };
          function invoke(method, args) {
            laneCurrent();
            return retain(plugin[method](...args));
          }
          async function prepare(method, args) {
            const operation = await invoke(method, args);
            laneCurrent();
            const handle = Object.freeze({});
            operations.set(handle, operation);
            return Object.freeze({ handle });
          }
          function consume(handle) {
            laneCurrent();
            if (!operations.has(handle)) throw fail();
            const operation = operations.get(handle);
            operations.delete(handle);
            return retain(
              mode === "private"
                ? pluginApi.broadcastRailgunKohakuOperation(plugin, operation)
                : pluginApi.submitRailgunKohakuPublicOperation(
                    plugin,
                    operation,
                  ),
            );
          }
          const laneClosed = observe(plugin.closed);
          laneClosed.then(
            () => {
              laneClosing = true;
              if (state.lane === plugin) state.lane = null;
            },
            (error) => {
              remember(error);
              close();
            },
          );
          return Object.freeze({
            instanceId: () => invoke("instanceId", []),
            balance: (assets) => invoke("balance", [assets]),
            notes: (assets, includeSpent) =>
              invoke("notes", [assets, includeSpent]),
            ...(mode === "private"
              ? {
                  prepareTransfer: (value, to) =>
                    prepare("prepareTransfer", [value, to]),
                  prepareUnshield: (value, to, opts) =>
                    prepare("prepareUnshield", [value, to, opts]),
                  broadcast: consume,
                }
              : mode === "public"
                ? {
                    prepareShield: (value, to) =>
                      prepare("prepareShield", [value, to]),
                    submit: consume,
                  }
                : {}),
            signal: plugin.signal,
            closed: plugin.closed,
            close() {
              laneClosing = true;
              stop(plugin, "lane");
            },
          });
        } catch (error) {
          if (plugin) stop(plugin, "lane");
          else if (account) stop(account, "account");
          // A failed open has no published lane whose close can be observed.
          // Revoke the whole session; preserve the original failure to its caller.
          close();
          throw error;
        } finally {
          laneSignal.removeEventListener("abort", cancelledOpening);
        }
      });
    }
    function replacePublic(mode, extra) {
      if (extra.length) throw fail();
      return run(async () => {
        try {
          const previous = state.public;
          stop(previous, "public");
          const cleanup = state.cleanup.get(previous);
          if (state.failure || !cleanup?.work) throw state.failure || fail();
          await cleanup.work;
          current();
          state.public = null;
          await acquire(
            "public",
            publicApi.openRailgunAccountPublic({
              enrollment: state.enrollment,
              archive: runtime.archive,
              create: false,
              mode,
            }),
          );
          return Object.freeze({ status: "public-cache-open", mode });
        } catch (error) {
          close();
          throw error;
        }
      });
    }
    function recovery(options) {
      const data = record(options, [
        "signal",
        "reviewDisclosures",
        "reviewTransaction",
        "gasLimit",
        "maxGasFee",
      ]);
      signal(data.signal);
      for (const callback of [data.reviewDisclosures, data.reviewTransaction])
        if (typeof callback !== "function" || types.isProxy(callback))
          throw fail();
      return run(async () => {
        let companion;
        try {
          companion = recoveryApi.createRailgunKohakuRecovery({
            owners: owners(),
            destination: publicApi.getRailgunAccountPublicDestination(
              state.public.coordinator,
              state.enrollment,
            ),
            ...runtime,
            ...data,
            signal: AbortSignal.any([lifetime, data.signal]),
          });
          state.lane = companion;
          if (state.closing) stop(companion, "lane");
          current();
          let closing = false;
          const active = () => {
            current();
            if (closing || state.lane !== companion || companion.signal.aborted)
              throw fail();
          };
          observe(companion.closed).then(
            () => {
              closing = true;
              if (state.lane === companion) state.lane = null;
            },
            (error) => {
              remember(error);
              close();
            },
          );
          return Object.freeze({
            history(after = null) {
              active();
              return retain(companion.history(after));
            },
            resumeProof(holdId) {
              active();
              return retain(companion.resumeProof(holdId));
            },
            submitStored(holdId) {
              active();
              return retain(companion.submitStored(holdId));
            },
            signal: companion.signal,
            closed: companion.closed,
            close() {
              closing = true;
              stop(companion, "lane");
            },
          });
        } catch (error) {
          if (companion) stop(companion, "lane");
          close();
          throw error;
        }
      });
    }
    const session = Object.freeze({
      describe() {
        current();
        return Object.freeze({
          accountIndex,
          instanceId: state.identity.descriptor.instanceId,
          chainId: 11155111,
          deployment: "sepolia",
        });
      },
      advancePublic(range) {
        const data = record(range, ["to", "anchor"]);
        return run(() => state.public.advance(data));
      },
      rebuildPublic: (...extra) => replacePublic("new", extra),
      resumePublic: (...extra) => replacePublic("pending", extra),
      openRecovery: recovery,
      openRead: (options) => lane("read", options),
      openPrivate: (options) => lane("private", options),
      openPublic: (options) => lane("public", options),
      signal: lifetime,
      closed,
      close,
    });
    sessions.set(session, state);
    opening = (async () => {
      try {
        await acquire(
          "identity",
          identityApi.openRailgunIdentity({
            archive: runtime.archive,
            accountIndex,
          }),
        );
        await acquire(
          "enrollment",
          (create
            ? enrollmentApi.openRailgunCooperativeAccountEnrollment
            : enrollmentApi.openRailgunAccountEnrollment)({
            identity: state.identity,
            create,
          }),
        );
        await acquire(
          "public",
          publicApi.openRailgunAccountPublic({
            enrollment: state.enrollment,
            archive: runtime.archive,
            create,
          }),
        );
        current();
        return session;
      } catch (error) {
        if (
          error?.code?.endsWith("_EXIT_UNOBSERVED") ||
          error?.code?.endsWith("_DRAIN_UNOBSERVED")
        ) {
          state.unknown = true;
          remember(error);
        }
        throw error;
      }
    })();
    // Own the entire opener, even if the caller abandons its returned promise.
    Promise.prototype.then.call(opening, finishOpening, () => {
      finishOpening();
      close();
    });
    if (lifetime.aborted) close();
    return opening;
  }
  return Object.freeze({
    createAccount: (options) => open(options, true),
    openAccount: (options) => open(options, false),
  });
}
module.exports = Object.freeze({ initializeRailgunMain });
