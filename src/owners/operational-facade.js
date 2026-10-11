/** Private trusted-main lifecycle facade. No package export or renderer bridge. */
"use strict";
const path = require("path");
const { types } = require("util");
const host = require("./host-bindings");
const { selectRailgunDeployment } = require("../deployment");
const { captureRailgunApplicationPolicy, isRailgunGasBudget } = require("./application-policy");
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
function observe(value, unknown = () => {}, settled = () => {}) {
  if (!types.isPromise(value)) throw fail();
  return new Promise((resolve, reject) => {
    const finish = (fulfilled, error) => {
      try {
        settled(fulfilled, error);
      } catch (failure) {
        try {
          unknown(failure);
        } catch {
          /* Still reject the owned barrier. */
        }
        reject(failure);
        return;
      }
      if (fulfilled) resolve();
      else reject(error);
    };
    try {
      Promise.prototype.then.call(
        value,
        () => {
          finish(true);
        },
        (error) => {
          finish(false, error);
        },
      );
    } catch (error) {
      try {
        unknown(error);
      } catch {
        /* The original remains unobserved. */
      }
      reject(error);
    }
  });
}
function errorCode(error) {
  if (
    !error ||
    (typeof error !== "object" && typeof error !== "function") ||
    types.isProxy(error)
  )
    return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor &&
    Object.hasOwn(descriptor, "value") &&
    typeof descriptor.value === "string"
    ? descriptor.value
    : undefined;
}
let initialized = false;
function initializeRailgunMain(options) {
  if (initialized) throw fail();
  initialized = true;
  let data;
  try {
    for (const keys of [
      ["host", "runtime", "applicationPolicy", "deployment"],
      ["host", "runtime", "applicationPolicy"],
      ["host", "runtime", "deployment"],
      ["host", "runtime"],
    ]) {
      try { data = record(options, keys); break; } catch { /* Try the next exact supported shape. */ }
    }
    if (!data) throw fail();
    selectRailgunDeployment(Object.hasOwn(data, "deployment") ? data.deployment : "sepolia");
    captureRailgunApplicationPolicy(...(Object.hasOwn(data, "applicationPolicy")
      ? [data.applicationPolicy] : []));
  } catch (error) {
    // Reserve and poison paired bootstrap even before host validation, so a
    // second physical copy cannot adopt a malformed/preempted main attempt.
    try { host.initializeRailgunOwnerHost(undefined); } catch {
      /* Refusal is the intended reservation; preserve the original error. */
    }
    throw error;
  }
  const { host: capabilities, runtime: input } = data;
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
  const poiApi = require("./operational-poi-lane.js");
  const submissionApi = require("./operational-submission-lane.js");
  const shieldApi = require("./operational-shield-lane.js");
  const ownedPoiApi = require("./railgun-account-poi.js");
  const {
    REQUIRED_LIST: requiredPoiList,
  } = require("../data/railgun-poi-records.js");
  const txidApi = require("./railgun-account-txid.js");
  const publicServices = require("./railgun-public-services.js");
  const relayApi = require("./railgun-relay-operation.js");
  const relayStaging = require("./railgun-relay-transact-staging.js");
  const {
    normalizeRailgunRelayQuote,
  } = require("../execution/railgun-relay-quote-data.js");
  const application = signal(host.platform.applicationLifetime());
  const occupied = new Map();
  const sessions = new WeakMap();
  function open(options, create) {
    host.assertRailgunOwnerHost();
    // An explicit public-cache opening for an existing account whose active
    // public generation belongs to another source policy: "new" begins a fresh
    // generation exactly as rebuildPublic, "pending" resumes it exactly as
    // resumePublic. "recover" selects pending else active, without creating a
    // generation. Absent keeps the active-only opening; never implicit.
    let data;
    try {
      data = record(options, ["accountIndex", "signal", "publicCache"]);
    } catch {
      data = record(options, ["accountIndex", "signal"]);
    }
    const { accountIndex, signal: caller, publicCache } = data;
    if (
      !Number.isInteger(accountIndex) ||
      accountIndex < 0 ||
      accountIndex > 65535 ||
      (Object.hasOwn(data, "publicCache") &&
        (create || !["new", "pending", "recover"].includes(publicCache)))
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
    const preparationLanes = new WeakMap();
    const state = {
      identity: null,
      enrollment: null,
      public: null,
      txid: null,
      account: null,
      lane: null,
      ownedPoiEvidence: null,
      closing: false,
      busy: false,
      failure: null,
      unknown: false,
      pending: new Set(),
      cleanup: new Map(),
      watched: new Map(),
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
      state.failure ||= error || fail();
    }
    function retain(original, onSettled = () => {}) {
      let observed;
      try {
        observed = observe(
          original,
          (error) => {
            state.unknown = true;
            remember(error);
          },
          (fulfilled, error) => {
            state.pending.delete(observed);
            onSettled();
            if (
              !fulfilled &&
              (errorCode(error)?.endsWith("_EXIT_UNOBSERVED") ||
                errorCode(error)?.endsWith("_DRAIN_UNOBSERVED"))
            ) {
              state.unknown = true;
              remember(error);
            }
          },
        );
      } catch (error) {
        state.unknown = true;
        remember(error);
        throw error;
      }
      state.pending.add(observed);
      observed.catch(() => {
        state.pending.delete(observed);
      });
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
      for (const owner of [state.identity, state.enrollment, state.public])
        if (owner && Reflect.apply(aborted, owner.signal, [])) throw fail();
      if (host.profiles.getActiveProfile().userDataDir !== profile.userDataDir)
        throw fail();
    }
    function watchOwner(value) {
      const originalSignal = signal(value.signal);
      const revoked = () => {
        if (Reflect.apply(aborted, originalSignal, [])) close();
      };
      state.watched.set(value, { signal: originalSignal, revoked });
      originalSignal.addEventListener("abort", revoked);
      if (originalSignal.aborted) close();
    }
    function stop(value, kind) {
      if (!value || state.cleanup.has(value)) return;
      // Install before invoking a reentrant abort listener.
      const slot = { work: null };
      state.cleanup.set(value, slot);
      const watch = state.watched.get(value);
      if (watch) {
        watch.signal.removeEventListener("abort", watch.revoked);
        state.watched.delete(value);
      }
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
      stop(state.txid, "txid");
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
      else if (["identity", "enrollment", "public"].includes(kind))
        watchOwner(value);
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
          !isRailgunGasBudget(data.maxGasFee)
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
          const failedClosure = (error) => {
            remember(error);
            close();
          };
          observe(plugin.closed, failedClosure, (fulfilled, error) => {
            if (!fulfilled) {
              failedClosure(error);
              return;
            }
            laneClosing = true;
            if (state.lane === plugin) state.lane = null;
          }).catch(() => {});
          const result = Object.freeze({
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
          if (mode === "private") preparationLanes.set(result, plugin);
          return result;
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
          state.public = null;
          current();
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
    function recovery(options, kind = "private") {
      const poi = kind === "poi",
        submission = kind === "submission",
        shield = kind === "shield";
      const data = record(
        options,
        shield
          ? ["signal", "reviewDisclosures", "reviewResolution"]
          : poi || submission
          ? ["signal", "reviewDisclosures"]
          : [
              "signal",
              "reviewDisclosures",
              "reviewTransaction",
              "gasLimit",
              "maxGasFee",
            ],
      );
      signal(data.signal);
      for (const callback of shield
        ? [data.reviewDisclosures, data.reviewResolution]
        : poi || submission
        ? [data.reviewDisclosures]
        : [data.reviewDisclosures, data.reviewTransaction])
        if (typeof callback !== "function" || types.isProxy(callback))
          throw fail();
      if (
        !poi &&
        !submission &&
        !shield &&
        (typeof data.gasLimit !== "bigint" ||
          data.gasLimit <= 0n ||
          data.gasLimit > 3000000n ||
          !isRailgunGasBudget(data.maxGasFee))
      )
        throw fail();
      return run(async () => {
        let companion;
        try {
          const destination = publicApi.getRailgunAccountPublicDestination(
            state.public.coordinator,
            state.enrollment,
          );
          // The held-submission companion needs no engine/prover runtime: it
          // reads local custody and the EOA journal, and never proves or signs.
          companion = shield
            ? shieldApi.createRailgunShieldLane({
                owners: owners(), destination, ...data,
                signal: AbortSignal.any([lifetime, data.signal]),
              })
            : submission
            ? submissionApi.createRailgunSubmissionLane({
                owners: owners(),
                destination,
                signal: AbortSignal.any([lifetime, data.signal]),
                reviewDisclosures: data.reviewDisclosures,
              })
            : (poi
                ? poiApi.createRailgunPoiLane
                : recoveryApi.createRailgunKohakuRecovery)({
                owners: owners(),
                destination,
                ...runtime,
                ...data,
                ...(poi ? { ownedPoiEvidence: () => state.ownedPoiEvidence ?? null } : {}),
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
          const failedClosure = (error) => {
            remember(error);
            close();
          };
          observe(companion.closed, failedClosure, (fulfilled, error) => {
            if (!fulfilled) {
              failedClosure(error);
              return;
            }
            closing = true;
            if (state.lane === companion) state.lane = null;
          }).catch(() => {});
          if (shield)
            return Object.freeze({
              list(...extra) {
                active();
                return retain(companion.list(...extra));
              },
              observe(transactionHash, ...extra) {
                active();
                return retain(companion.observe(transactionHash, ...extra));
              },
              resolve(transactionHash, options, ...extra) {
                active();
                return retain(companion.resolve(transactionHash, options, ...extra));
              },
              signal: companion.signal,
              closed: companion.closed,
              close() {
                closing = true;
                stop(companion, "lane");
              },
            });
          if (submission)
            return Object.freeze({
              describe(holdId) {
                active();
                return retain(companion.describe(holdId));
              },
              observe(holdId) {
                active();
                return retain(companion.observe(holdId));
              },
              resolve(holdId, options) {
                active();
                return retain(companion.resolve(holdId, options));
              },
              signal: companion.signal,
              closed: companion.closed,
              close() {
                closing = true;
                stop(companion, "lane");
              },
            });
          return Object.freeze({
            ...(poi
              ? {
                  prepareShield(holdId) {
                    active();
                    return retain(companion.prepareShield(holdId));
                  },
                  prepareTransact(holdId) {
                    active();
                    return retain(companion.prepareTransact(holdId));
                  },
                  submit(capsuleDigest) {
                    active();
                    return retain(companion.submit(capsuleDigest));
                  },
                  recoverOutput(capsuleDigest) {
                    active();
                    return retain(companion.recoverOutput(capsuleDigest));
                  },
                  recoverAttemptedOutput(capsuleDigest) {
                    active();
                    return retain(
                      companion.recoverAttemptedOutput(capsuleDigest),
                    );
                  },
                  retryAttempted(holdId) {
                    active();
                    return retain(companion.retryAttempted(holdId));
                  },
                  reproveRetiredShield(holdId) {
                    active();
                    return retain(companion.reproveRetiredShield(holdId));
                  },
                  reproveRetiredTransact(holdId) {
                    active();
                    return retain(companion.reproveRetiredTransact(holdId));
                  },
                  submitReproof(holdId) {
                    active();
                    return retain(companion.submitReproof(holdId));
                  },
                }
              : {
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
                }),
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
    function relay(options, cold) {
      const keys = cold
        ? ["signal"]
        : [
            "wallet",
            "signal",
            "review",
            "reviewDisclosure",
            "reviewStagingDisclosure",
            "reviewRootDisclosure",
          ];
      const data = record(options, keys);
      signal(data.signal);
      if (!cold) {
        if (!["active", "advance", "new", "pending"].includes(data.wallet))
          throw fail();
        for (const name of [
          "review",
          "reviewDisclosure",
          "reviewStagingDisclosure",
          "reviewRootDisclosure",
        ])
          if (typeof data[name] !== "function" || types.isProxy(data[name]))
            throw fail();
      }
      return run(async () => {
        enrollmentApi.assertRailgunFencedAccountEnrollment(state.enrollment);
        const controller = new AbortController();
        const lifetimeSignal = AbortSignal.any([
          lifetime,
          data.signal,
          controller.signal,
        ]);
        let finishSetup,
          resolve,
          reject,
          original,
          staged,
          adoptedAccount,
          closing = false,
          busy = false,
          used = false,
          closeFailure;
        const setup = new Promise((done) => {
          finishSetup = done;
        });
        const drained = new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        });
        drained.catch(() => {});
        let watchedSignal = lifetimeSignal;
        const abort = () => {
          if (Reflect.apply(aborted, watchedSignal, [])) closeRelay();
        };
        function closeRelay() {
          if (closing) return;
          closing = true;
          controller.abort();
          if (adoptedAccount) stop(adoptedAccount, "account");
          (async () => {
            await setup;
            if (original) await Promise.allSettled([original]);
            // Staging close revokes its evidence scope; it does not reassert
            // pre-key freshness after an actual credential was issued.
            try {
              staged?.close();
            } catch (error) {
              closeFailure ||= error;
            }
            if (adoptedAccount) {
              stop(adoptedAccount, "account");
              const cleanup = state.cleanup.get(adoptedAccount);
              if (cleanup?.work) await cleanup.work;
              else if (state.failure) throw state.failure;
            }
            watchedSignal.removeEventListener("abort", abort);
            if (closeFailure || state.unknown || state.failure)
              throw closeFailure || state.failure || fail();
            if (state.account === adoptedAccount) state.account = null;
            if (state.lane === owner) state.lane = null;
          })().then(resolve, (error) => {
            remember(error);
            reject(error);
          });
        }
        const owner = Object.freeze({
          signal: lifetimeSignal,
          closed: drained,
          close: closeRelay,
        });
        state.lane = owner;
        lifetimeSignal.addEventListener("abort", abort);
        function active() {
          current();
          if (closing || busy || lifetimeSignal.aborted || state.lane !== owner)
            throw fail();
        }
        function invoke(action) {
          active();
          busy = true;
          try {
            original = retain(action());
            observe(
              original,
              (error) => {
                state.unknown = true;
                remember(error);
              },
              (fulfilled, error) => {
                busy = false;
                if (
                  !fulfilled &&
                  [
                    "RAILGUN_RELAY_TRANSACT_STAGING_DRAIN_FAILED",
                    "RAILGUN_RELAY_REVIEW_DRAIN_FAILED",
                    "RAILGUN_RELAY_CONTINUATION_DRAIN_FAILED",
                  ].includes(errorCode(error))
                ) {
                  state.unknown = true;
                  remember(error);
                }
                if (!cold || !fulfilled) closeRelay();
              },
            ).catch(() => {});
            return original;
          } catch (error) {
            busy = false;
            closeRelay();
            throw error;
          }
        }
        try {
          const bound = owners();
          adoptedAccount = await (cold
            ? walletApi.openRailgunCompletedAccountWallet({
                ...bound,
                archive: runtime.archive,
                destination: publicApi.getRailgunAccountPublicDestination(
                  bound.coordinator,
                  bound.enrollment,
                ),
                signal: lifetimeSignal,
              })
            : walletApi.openRailgunAccountWallet({
                ...bound,
                archive: runtime.archive,
                mode: data.wallet,
              }));
          state.account = adoptedAccount;
          if (closing || state.closing) stop(adoptedAccount, "account");
          if (cold) {
            lifetimeSignal.removeEventListener("abort", abort);
            watchedSignal = AbortSignal.any([
              lifetimeSignal,
              adoptedAccount.signal,
            ]);
            watchedSignal.addEventListener("abort", abort);
          }
          signal(watchedSignal);
          current();
          const common = () => ({
            account: adoptedAccount,
            owners: bound,
            signal: lifetimeSignal,
          });
          if (cold)
            return Object.freeze({
              list(after = null) {
                return invoke(() =>
                  relayApi.listRailgunAccountRelayOperations({
                    ...common(),
                    after,
                  }),
                );
              },
              resume(operationId) {
                return invoke(() =>
                  relayApi.resumeRailgunAccountRelayOperation({
                    ...common(),
                    ...runtime,
                    operationId,
                  }),
                );
              },
              discard(operationId) {
                return invoke(() =>
                  relayApi.discardRailgunAccountRelayOperation({
                    ...common(),
                    operationId,
                  }),
                );
              },
              signal: watchedSignal,
              closed: drained,
              close: closeRelay,
            });
          return Object.freeze({
            prepare(request) {
              const input = record(request, [
                "noteId",
                "quote",
                "gas",
                "maxFee",
                "signal",
              ]);
              signal(input.signal);
              const normalized = normalizeRailgunRelayQuote(
                input.quote,
                input.gas,
              );
              const captured = Object.freeze({
                ...input,
                quote: normalized.quote,
                gas: normalized.gas,
              });
              if (used) throw fail();
              return invoke(async () => {
                used = true;
                const notes = walletApi.readRailgunAccountOwnedNotes(
                  adoptedAccount,
                  bound,
                ).ownedPoi;
                const selected = notes.filter(
                  (note) => note.id === captured.noteId,
                );
                if (
                  selected.length !== 1 ||
                  !["Shield", "Transact"].includes(selected[0].type)
                )
                  throw fail();
                if (selected[0].type === "Transact") {
                  const result =
                    await relayStaging.stageRailgunRelayTransactInput({
                      account: adoptedAccount,
                      owners: bound,
                      request: captured,
                      archive: runtime.archive,
                      signal: AbortSignal.any([
                        lifetimeSignal,
                        captured.signal,
                      ]),
                      reviewStagingDisclosure: data.reviewStagingDisclosure,
                    });
                  if (result.status !== "staged") return result;
                  // Preserve genuine replacement and receipt before any currency
                  // check, including late staging return after cancellation.
                  staged = result;
                  adoptedAccount = state.account = result.account;
                  if (closing) stop(adoptedAccount, "account");
                  if (closing || lifetimeSignal.aborted) throw fail();
                }
                return relayApi.proveRailgunAccountRelayOperation({
                  account: adoptedAccount,
                  owners: bound,
                  request: captured,
                  ...runtime,
                  review: data.review,
                  reviewDisclosure: data.reviewDisclosure,
                  ...(staged
                    ? {
                        stagingReceipt: staged.receipt,
                        reviewRootDisclosure: data.reviewRootDisclosure,
                      }
                    : {}),
                });
              });
            },
            signal: lifetimeSignal,
            closed: drained,
            close: closeRelay,
          });
        } catch (error) {
          closeRelay();
          throw error;
        } finally {
          finishSetup();
          if (state.closing || watchedSignal.aborted) closeRelay();
        }
      });
    }
    function observeOwnedPoi(options) {
      const data = record(options, ["noteId", "signal", "reviewDisclosure"]);
      signal(data.signal);
      if (
        typeof data.noteId !== "string" ||
        data.noteId.length > 64 ||
        !/^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.test(data.noteId) ||
        typeof data.reviewDisclosure !== "function" ||
        types.isProxy(data.reviewDisclosure)
      )
        throw fail();
      return run(async () => {
        // Each read replaces the retry evidence; a failed read leaves none.
        state.ownedPoiEvidence = null;
        const started = performance.now(),
          deadline = started + 180000;
        const controller = new AbortController();
        const workSignal = AbortSignal.any([
          lifetime,
          data.signal,
          controller.signal,
        ]);
        const timer = setTimeout(() => controller.abort(), 180000);
        timer.unref?.();
        let account,
          operation,
          poiStopped = false,
          poiDrain,
          cleanupFailure,
          result,
          evidence = null,
          acquireStartedAt,
          operationError,
          operationFailed = false;
        const lost = () => {
          const error = Object.assign(fail(), {
            code: "RAILGUN_WALLET_EXIT_UNOBSERVED",
          });
          state.unknown = true;
          remember(error);
          close();
          return error;
        };
        const stopPoi = () => {
          if (!operation || poiStopped) return;
          poiStopped = true;
          try {
            operation.close();
          } catch {
            cleanupFailure ||= lost();
          }
          try {
            poiDrain = observe(operation.closed, () => {
              cleanupFailure ||= lost();
            });
            poiDrain.catch(() => {
              cleanupFailure ||= lost();
            });
          } catch {
            cleanupFailure ||= lost();
          }
        };
        const cancel = () => {
          if (!Reflect.apply(aborted, workSignal, [])) return;
          stopPoi();
          stop(account || state.account, "account");
        };
        workSignal.addEventListener("abort", cancel);
        const remaining = (maximum) => {
          current();
          signal(workSignal);
          const now = performance.now();
          if (now < started || now >= deadline) throw fail();
          return Math.max(1, Math.min(maximum, Math.floor(deadline - now)));
        };
        try {
          remaining(30000);
          const summary = Object.freeze({
            purpose: "railgun-owned-note-poi-disclosure-v1",
            noteId: data.noteId,
            chainId: 11155111,
            txidVersion: "V2_PoseidonMerkle",
            listKey: requiredPoiList,
            endpoint: publicServices.POI_URL,
            sourceDestination: "authenticated-account-public-destination",
            selectedTypeAndBlindAvailableBeforeOpen: false,
            requiresCurrentUnspentOwnedNote: true,
            disclosures: Object.freeze([
              "completed-wallet-canonical-source-and-timing",
              "selected-blinded-commitment",
              "commitment-type",
              "list",
              "membership-proof-and-event",
              "membership-root",
            ]),
            requests: Object.freeze([
              "ppoi_pois_per_list",
              "ppoi_merkle_proofs",
              "ppoi_poi_events",
              "ppoi_validate_poi_merkleroots",
            ]),
            transferJoinEstablished: false,
            txidProvenanceVerified: false,
            reservationsChecked: false,
            spendingEnabled: false,
          });
          const reviewStarted = performance.now(),
            reviewDeadline = Math.min(deadline, reviewStarted + 30000);
          const reviewController = new AbortController();
          const reviewSignal = AbortSignal.any([
            workSignal,
            reviewController.signal,
          ]);
          const reviewTimer = setTimeout(
            () => reviewController.abort(),
            Math.max(1, reviewDeadline - reviewStarted),
          );
          reviewTimer.unref?.();
          try {
            let decision = data.reviewDisclosure(
              summary,
              Object.freeze({ signal: reviewSignal }),
            );
            if (types.isPromise(decision) && !types.isProxy(decision)) {
              const original = decision;
              decision = (
                await new Promise((resolve, reject) => {
                  try {
                    Promise.prototype.then.call(
                      original,
                      (value) =>
                        resolve(Object.freeze({ __proto__: null, value })),
                      reject,
                    );
                  } catch {
                    reject(lost());
                  }
                })
              ).value;
            } else if (
              decision !== null &&
              ["object", "function"].includes(typeof decision)
            )
              throw lost();
            const now = performance.now();
            if (
              decision !== true ||
              now < reviewStarted ||
              now >= reviewDeadline
            )
              throw fail();
            signal(reviewSignal);
            remaining(180000);
          } finally {
            clearTimeout(reviewTimer);
          }
          const bound = owners();
          account = await acquire(
            "account",
            walletApi.openRailgunCompletedAccountWallet({
              ...bound,
              archive: runtime.archive,
              destination: publicApi.getRailgunAccountPublicDestination(
                bound.coordinator,
                bound.enrollment,
              ),
              signal: workSignal,
              timeoutMs: remaining(180000),
            }),
          );
          remaining(45000);
          const baseline = walletApi.readRailgunAccountOwnedNotes(
            account,
            bound,
          );
          const records = baseline.ownedPoi.filter(
            (value) => value.id === data.noteId,
          );
          const notes = baseline.read.received.filter(
            (value) => value.id === data.noteId,
          );
          if (
            records.length !== 1 ||
            notes.length !== 1 ||
            !["Shield", "Transact"].includes(records[0].type) ||
            notes[0].spentTxid !== false ||
            typeof notes[0].amount !== "bigint" ||
            notes[0].amount <= 0n
          )
            throw fail();
          operation = ownedPoiApi.openRailgunAccountPoi({
            wallet: account,
            ...bound,
            archive: runtime.archive,
            noteIds: [data.noteId],
          });
          remaining(45000);
          // The evidence age counts from before the status acquisition, so
          // acquisition and cleanup time can never extend its freshness.
          acquireStartedAt = performance.now();
          const acquired = await operation.acquire({
            timeoutMs: remaining(45000),
          });
          remaining(45000);
          const value = ownedPoiApi.assertRailgunAccountPoi(
            operation,
            acquired.receipt,
            account,
            bound,
          );
          const after = walletApi.readRailgunAccountOwnedNotes(account, bound);
          if (
            after.checkpointHash !== baseline.checkpointHash ||
            !after.ownedPoi.includes(records[0]) ||
            !after.read.received.includes(notes[0]) ||
            notes[0].spentTxid !== false
          )
            throw fail();
          if (
            value.listKey !== requiredPoiList ||
            value.ownershipAtSnapshot !== true ||
            value.txidProvenanceVerified !== false ||
            value.reservationsChecked !== false ||
            value.spendingEnabled !== false ||
            !Array.isArray(value.statuses) ||
            value.statuses.length !== 1 ||
            typeof value.statuses[0].status !== "string" ||
            value.statuses[0].status.length > 128
          )
            throw fail();
          const statuses = Object.freeze([value.statuses[0].status]);
          // Session-private evidence for the POI lane's explicit retry only:
          // the owned output's commitment, type, list and status, and when.
          const observedStatus = value.statuses[0];
          evidence = Object.freeze({
            blindedCommitment: observedStatus.blindedCommitment,
            type: observedStatus.type,
            status: observedStatus.status,
            listKey: value.listKey,
            at: acquireStartedAt,
          });
          result = Object.freeze({
            noteId: data.noteId,
            inputType: records[0].type,
            selectedCount: 1,
            listKey: value.listKey,
            statuses,
            rootsAccepted: value.rootsAccepted === true,
            membershipVerified: value.membershipVerified === true,
            allValid:
              statuses[0] === "Valid" &&
              value.rootsAccepted === true &&
              value.membershipVerified === true,
            ownershipAtSnapshot: true,
            transferJoinEstablished: false,
            txidProvenanceVerified: false,
            reservationsChecked: false,
            spendingEnabled: false,
          });
        } catch (error) {
          operationFailed = true;
          operationError = error;
        }
        clearTimeout(timer);
        stopPoi();
        controller.abort();
        if (poiDrain) {
          try {
            await poiDrain;
          } catch {
            cleanupFailure ||= lost();
          }
        }
        const target = account || state.account;
        if (target) {
          stop(target, "account");
          const cleanup = state.cleanup.get(target);
          if (!cleanup?.work) cleanupFailure ||= lost();
          else {
            try {
              await cleanup.work;
            } catch {
              cleanupFailure ||= lost();
            }
          }
          if (!cleanupFailure && state.account === target) state.account = null;
        }
        workSignal.removeEventListener("abort", cancel);
        if (cleanupFailure) throw cleanupFailure;
        if (operationFailed) throw operationError;
        current();
        signal(data.signal);
        if (performance.now() >= deadline) throw fail();
        // Published only after cleanup and every final check: a rejected read
        // always leaves none.
        state.ownedPoiEvidence = evidence;
        return result;
      });
    }
    function synchronizeTxid(options) {
      const data = record(options, ["mode", "signal", "reviewDisclosure"]);
      if (
        !["initialize", "advance", "checkpoint"].includes(data.mode) ||
        typeof data.reviewDisclosure !== "function" ||
        types.isProxy(data.reviewDisclosure)
      )
        throw fail();
      signal(data.signal);
      return run(async () => {
        const controller = new AbortController();
        const workSignal = AbortSignal.any([
          lifetime,
          data.signal,
          controller.signal,
        ]);
        const queries = [
          Object.freeze({
            method: "latestTxid",
            wireMethod: "ppoi_validated_txid",
            endpoint: publicServices.POI_URL,
          }),
          Object.freeze({
            method: "validateTxidRoot",
            wireMethod: "ppoi_validate_txid_merkleroot",
            endpoint: publicServices.POI_URL,
            tree: 0,
            pointSource:
              "authenticated-local-checkpoint-or-computed-public-page",
            exactPointAvailableBeforeOpen: false,
          }),
          ...(data.mode === "checkpoint"
            ? []
            : [
                Object.freeze({
                  method: "txidPage",
                  wireMethod: "RailgunPublicTxids",
                  endpoint: publicServices.INDEXER_URL,
                  maximumPageRows: 100,
                  cursorSource: "authenticated-local-public-txid-state",
                  exactCursorAvailableBeforeOpen: false,
                }),
              ]),
        ];
        const summary = Object.freeze({
          purpose: "railgun-public-txid-synchronization-disclosure-v1",
          mode: data.mode,
          chainId: 11155111,
          txidVersion: "V2_PoseidonMerkle",
          queries: Object.freeze(queries),
          createIfMissing: data.mode === "initialize",
          maximumAdvancePages: data.mode === "checkpoint" ? 0 : 1,
          mayResumeAuthenticatedPendingPage: data.mode !== "checkpoint",
          selectedMembershipPermitted: false,
          selectedNullifierQueryPermitted: false,
          signingEnabled: false,
          relaySendPermitted: false,
        });
        const started = performance.now(),
          deadline = started + 30000;
        const timer = setTimeout(() => controller.abort(), 30000);
        timer.unref?.();
        let txid,
          outcome,
          operationError,
          operationFailed = false;
        const unknownReview = () => {
          const error = Object.assign(fail(), {
            code: "RAILGUN_WALLET_EXIT_UNOBSERVED",
          });
          state.unknown = true;
          remember(error);
          close();
          return error;
        };
        try {
          current();
          signal(workSignal);
          let decision = data.reviewDisclosure(
            summary,
            Object.freeze({ signal: workSignal }),
          );
          if (types.isPromise(decision) && !types.isProxy(decision)) {
            const originalReview = decision;
            decision = (
              await new Promise((resolve, reject) => {
                try {
                  Promise.prototype.then.call(
                    originalReview,
                    (value) =>
                      resolve(Object.freeze({ __proto__: null, value })),
                    reject,
                  );
                } catch {
                  reject(unknownReview());
                }
              })
            ).value;
          } else if (
            decision !== null &&
            ["object", "function"].includes(typeof decision)
          )
            throw unknownReview();
          const now = performance.now();
          if (decision !== true || now < started || now >= deadline)
            throw fail();
          current();
          signal(workSignal);
          clearTimeout(timer);
          txid = await acquire(
            "txid",
            txidApi.openRailgunAccountTxid({
              enrollment: state.enrollment,
              coordinator: state.public.coordinator,
              archive: runtime.archive,
              create: data.mode === "initialize",
              checkpointOnly: data.mode === "checkpoint",
              signal: workSignal,
            }),
          );
          const result = await (data.mode === "checkpoint"
            ? txid.inspect()
            : txid.advance());
          current();
          signal(workSignal);
          const count = result.checkpoint?.state.count ?? 0,
            root = result.checkpoint?.state.root ?? null,
            latest = result.serviceLatestIndex;
          if (
            result.pending ||
            !Number.isSafeInteger(count) ||
            count < 0 ||
            count > 8000 ||
            (root !== null &&
              (typeof root !== "string" || !/^[a-f0-9]{64}$/.test(root))) ||
            (latest !== null && (!Number.isSafeInteger(latest) || latest < 0))
          )
            throw fail();
          outcome = Object.freeze({
            count,
            root,
            checkpointAvailable: !!result.checkpoint,
            capacityReached: count === 8000,
            serviceLatestIndex: latest,
            pending: false,
            unverified: true,
            spendingEnabled: false,
          });
        } catch (error) {
          operationFailed = true;
          operationError = error;
        }
        clearTimeout(timer);
        controller.abort();
        // acquire() retains a late owner even when cancellation rejects before
        // assignment to txid; the session owns that exact original as well.
        // Original cleanup settles before publication. As before, a failed drain
        // overrides either an operation result or an earlier operation failure.
        const owned = txid || state.txid;
        if (owned) {
          stop(owned, "txid");
          const cleanup = state.cleanup.get(owned);
          try {
            if (cleanup?.work) await cleanup.work;
            if (state.failure) throw state.failure;
            if (state.txid === owned) state.txid = null;
          } catch (error) {
            close();
            throw error;
          }
        }
        if (operationFailed) throw operationError;
        return outcome;
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
      recoverPublic(...extra) {
        if (extra.length) throw fail();
        return run(async () => {
          const result = await state.public.recover();
          current();
          return result;
        });
      },
      advancePublic(range) {
        const data = record(range, ["to", "anchor"]);
        return run(() => state.public.advance(data));
      },
      rebuildPublic: (...extra) => replacePublic("new", extra),
      resumePublic: (...extra) => replacePublic("pending", extra),
      synchronizeTxid,
      observeOwnedPoi,
      openRecovery: (options) => recovery(options),
      openPoiRecovery: (options) => recovery(options, "poi"),
      openSubmissionRecovery: (options) => recovery(options, "submission"),
      openShieldRecovery: (options) => recovery(options, "shield"),
      openRelayLocal: (options) => relay(options, false),
      openRelayRecovery: (options) => relay(options, true),
      openRead: (options) => lane("read", options),
      openPrivate: (options) => lane("private", options),
      readPreparationOutcome(value) {
        const plugin = preparationLanes.get(value);
        if (!plugin) throw fail();
        // No current() here: refusals close the lane. This snapshot contains no
        // authority and belongs only to the session that issued this exact lane.
        return pluginApi.readRailgunKohakuPreparationOutcome(plugin);
      },
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
            ...(publicCache === undefined ? {} : { mode: publicCache }),
          }),
        );
        current();
        return session;
      } catch (error) {
        if (
          errorCode(error)?.endsWith("_EXIT_UNOBSERVED") ||
          errorCode(error)?.endsWith("_DRAIN_UNOBSERVED")
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
