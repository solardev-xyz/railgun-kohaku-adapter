/** Package-private main bootstrap skeleton. Not a public facade, module resolver,
 * credential issuer or operational owner initializer. Staged owner activation
 * remains blocked by the explicit loan/enum/worker transitions in provenance.
 */
"use strict";
const { isProxy } = require("util").types;
const { isMainThread } = require("worker_threads");
const SCHEMA = Object.freeze({
  context: Object.freeze(["getPrivacyContext", "createPrivacyScope"]),
  artifacts: Object.freeze(["createPrivacyArtifactLoader"]),
  credentials: Object.freeze(["currentSession", "withMaterial"]),
  platform: Object.freeze([
    "applicationLifetime",
    "spawnUtility",
    "createUtilityChannel",
    "memorySamples",
    "terminateUtility",
    "spawnStorageWorker",
  ]),
  profiles: Object.freeze(["getActiveProfile"]),
  sessions: Object.freeze(["openPrivacySession"]),
  storage: Object.freeze(["createPrivacyStorage", "getPrivacyStoragePath"]),
  rpc: Object.freeze([
    "assertPrivateRpcDestination",
    "createPrivateRpc",
    "createPrivateRpcDestinationConstraint",
    "createPrivateRpcReadBudget",
    "getPrivateRpcDestination",
    "getPrivateRpcDestinationDetails",
    "getPrivateRpcReadBudgetOutcome",
  ]),
  transport: Object.freeze(["createWalletTorTransport"]),
  settings: Object.freeze(["isWalletTorExperimentAvailable"]),
  tor: Object.freeze(["getWalletSocksEndpoint"]),
  signers: Object.freeze(["getSigner"]),
  transactionIntent: Object.freeze(["transactionIntent", "validIntent"]),
  transactionNetwork: Object.freeze([
    "assertPrivateTransactionNetworkDestination",
    "getPrivateTransactionNetwork",
    "getPrivateTransactionNetworkDestination",
  ]),
  submissionJournal: Object.freeze([
    "getPrivateSubmissionJournal",
    "readExistingPrivateSubmissionSnapshot",
  ]),
  registry: Object.freeze(["getNetwork", "getEndpointSources", "getEndpoints"]),
  journalRetention: Object.freeze(["validArchive"]),
  transactions: Object.freeze(["signAndSendTransaction"]),
  submitter: Object.freeze(["readMetadata"]),
});
const fail = () =>
  Object.assign(new Error("Railgun owner host unavailable"), {
    code: "RAILGUN_OWNER_HOST_UNAVAILABLE",
  });
let captured;
function record(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length) throw fail();
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !Object.hasOwn(descriptor, "value") ||
      !descriptor.enumerable
    )
      throw fail();
    result[key] = descriptor.value;
  }
  return result;
}
function initializeRailgunOwnerHost(input, ...extra) {
  if (
    !isMainThread ||
    (process.type !== undefined && process.type !== "browser")
  )
    throw fail();
  const key = Symbol.for("@freedom/railgun-kohaku-adapter/owner-host-v1");
  if (Object.hasOwn(globalThis, key)) throw fail();
  // Reserve even on failure. Neither the same copy nor a second physical copy
  // can adopt a preempted bootstrap. There is no getter or reset.
  Object.defineProperty(globalThis, key, {
    value: Object.freeze({}),
    configurable: false,
  });
  const {
    initializeRailgunExecutionHost: initializeExecution,
  } = require("../execution/host-bindings");
  try {
    if (extra.length) throw fail();
    const families = record(input, Object.keys(SCHEMA));
    const next = Object.create(null);
    for (const [family, names] of Object.entries(SCHEMA)) {
      const receiver = families[family],
        functions = record(receiver, names),
        methods = Object.create(null);
      for (const name of names) {
        const original = functions[name];
        if (typeof original !== "function" || isProxy(original)) throw fail();
        methods[name] = (...args) => Reflect.apply(original, receiver, args);
      }
      next[family] = Object.freeze(methods);
    }
    initializeExecution({
      context: next.context,
      artifacts: next.artifacts,
    });
    captured = Object.freeze(next);
  } catch (error) {
    // Even a malformed owner attempt poisons the paired execution bootstrap.
    // Its existing initializer reserves before validating; no getter/adoption
    // or extra reservation token crosses either private boundary.
    try {
      initializeExecution(undefined);
    } catch {
      /* Refusal is the intended reservation. */
    }
    throw error;
  }
}
function assertRailgunOwnerHost(...args) {
  if (
    args.length ||
    !captured ||
    !isMainThread ||
    (process.type !== undefined && process.type !== "browser")
  )
    throw fail();
}
const exportsByFamily = {};
for (const [family, names] of Object.entries(SCHEMA)) {
  const methods = {};
  for (const name of names)
    methods[name] = (...args) => {
      if (!captured) throw fail();
      return captured[family][name](...args);
    };
  exportsByFamily[family] = Object.freeze(methods);
}
module.exports = Object.freeze({
  initializeRailgunOwnerHost,
  assertRailgunOwnerHost,
  ...exportsByFamily,
});
