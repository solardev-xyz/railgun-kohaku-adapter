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
      txid: null,
      account: null,
      lane: null,
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
      if (
        typeof data.gasLimit !== "bigint" ||
        data.gasLimit <= 0n ||
        data.gasLimit > 3000000n ||
        typeof data.maxGasFee !== "bigint" ||
        data.maxGasFee <= 0n ||
        data.maxGasFee > 2000000000000000n
      )
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
      advancePublic(range) {
        const data = record(range, ["to", "anchor"]);
        return run(() => state.public.advance(data));
      },
      rebuildPublic: (...extra) => replacePublic("new", extra),
      resumePublic: (...extra) => replacePublic("pending", extra),
      synchronizeTxid,
      openRecovery: recovery,
      openRelayLocal: (options) => relay(options, false),
      openRelayRecovery: (options) => relay(options, true),
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
