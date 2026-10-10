"use strict";
const { createContextHost } = require("./context.cjs");
const { createCredentialHost } = require("./credentials.cjs");
const { createSessionHost } = require("./sessions.cjs");
const { createStorageHost } = require("./storage.cjs");
const { createArtifactHost } = require("./artifacts.cjs");
const { createPlatformHost } = require("./platform.cjs");
const { createRpcHost } = require("./rpc.cjs");
const { createRegistry } = require("./registry.cjs");
const { createTransportHost } = require("./transport.cjs");
const { createJournalHost } = require("./journal.cjs");
const { createLeaseHost } = require("./leases.cjs");
const { createTransactionNetworkHost } = require("./transaction-network.cjs");
const { createTransactionHost } = require("./transactions.cjs");
const { createSignerHost } = require("./signers.cjs");
const { createSourceIdentityHost } = require("./source-identity.cjs");
function fixed(receiver, names) {
  return Object.freeze(
    Object.fromEntries(
      names.map((name) => {
        const original = Object.getOwnPropertyDescriptor(receiver, name)?.value;
        if (typeof original !== "function")
          throw new Error("Reference host capability missing");
        return [name, (...args) => Reflect.apply(original, receiver, args)];
      }),
    ),
  );
}
let initialized = false;
/** Called once by trusted main startup, never an operation, plugin or renderer.
 * Vault, profile and managed Tor lifetime remain owned by this application. */
function initializeReferenceOwner({
  profile,
  vault,
  tor,
  rpcUrl,
  serviceOrigins,
  runtime,
}) {
  if (initialized) throw new Error("Reference owner already initialized");
  initialized = true;
  const platform = createPlatformHost(),
    context = createContextHost({
      assertCurrent: () =>
        require("./profile-lock.cjs").assertProfileLock(profile.userDataDir),
    });
  profile = Object.freeze({ ...profile });
  const profiles = Object.freeze({ getActiveProfile: () => profile });
  const credentials = createCredentialHost({ context, profiles, vault });
  const sessions = createSessionHost({
    context,
    profiles,
    credentials,
    lifetime: platform.applicationLifetime(),
  });
  const storage = createStorageHost(context),
    artifacts = createArtifactHost(context),
    registry = createRegistry({ rpcUrl });
  const settings = Object.freeze({
    isWalletTorExperimentAvailable: () => true,
  });
  const transport = createTransportHost({
    context,
    getEndpoint: () => tor.getWalletSocksEndpoint(),
    allowedOrigins: [...new Set([new URL(rpcUrl).origin, ...serviceOrigins])],
  });
  const rpc = createRpcHost({ context, registry, transport, tor, settings });
  const leases = createLeaseHost(context);
  const submissionJournal = createJournalHost({
    context,
    storage,
    profiles,
    vault,
    leases,
  });
  const transactionNetwork = createTransactionNetworkHost({
    context,
    rpc,
    submissionJournal,
  });
  const transactions = createTransactionHost({ transactionNetwork, leases });
  const { signers, submitter } = createSignerHost({ vault, profiles });
  const hostDigest = createSourceIdentityHost().readDigest();
  const sourceIdentity = Object.freeze({ readDigest: () => hostDigest });
  const host = Object.freeze({
    context,
    credentials,
    artifacts,
    platform,
    profiles,
    sessions: sessions.sessions,
    storage,
    settings,
    registry,
    tor: fixed(tor, ["getWalletSocksEndpoint"]),
    transport,
    signers,
    submitter,
    sourceIdentity,
    submissionJournal,
    transactions,
    rpc: fixed(rpc, [
      "assertPrivateRpcDestination",
      "createPrivateRpc",
      "createPrivateRpcDestinationConstraint",
      "createPrivateRpcReadBudget",
      "getPrivateRpcDestination",
      "getPrivateRpcDestinationDetails",
      "getPrivateRpcReadBudgetOutcome",
    ]),
    transactionNetwork: fixed(transactionNetwork, [
      "assertPrivateTransactionNetworkDestination",
      "getPrivateTransactionNetwork",
      "getPrivateTransactionNetworkDestination",
    ]),
    transactionIntent: fixed(require("./intent.cjs"), [
      "transactionIntent",
      "validIntent",
    ]),
    journalRetention: fixed(require("./retention.cjs"), ["validArchive"]),
  });
  const owner =
    require("@freedom/railgun-kohaku-adapter/host/owner").initializeRailgunMain(
      { host, runtime },
    );
  return Object.freeze({
    owner,
    close: sessions.close,
    hostDigest,
  });
}
module.exports = { initializeReferenceOwner };
