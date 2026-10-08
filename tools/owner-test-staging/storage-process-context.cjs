'use strict';
// Repository-only disposable SQLite process composition. No vault or engine.
const context = require('../../test/fixtures/owner-privacy-context.js');
const schema = {
  "context": [
    "getPrivacyContext",
    "createPrivacyScope"
  ],
  "artifacts": [
    "createPrivacyArtifactLoader"
  ],
  "sourceIdentity": [
    "readDigest"
  ],
  "credentials": [
    "currentSession",
    "withMaterial"
  ],
  "platform": [
    "applicationLifetime",
    "spawnUtility",
    "createUtilityChannel",
    "memorySamples",
    "terminateUtility",
    "spawnStorageWorker"
  ],
  "profiles": [
    "getActiveProfile"
  ],
  "sessions": [
    "openPrivacySession"
  ],
  "storage": [
    "createPrivacyStorage",
    "getPrivacyStoragePath"
  ],
  "rpc": [
    "assertPrivateRpcDestination",
    "createPrivateRpc",
    "createPrivateRpcDestinationConstraint",
    "createPrivateRpcReadBudget",
    "getPrivateRpcDestination",
    "getPrivateRpcDestinationDetails",
    "getPrivateRpcReadBudgetOutcome"
  ],
  "transport": [
    "createWalletTorTransport"
  ],
  "settings": [
    "isWalletTorExperimentAvailable"
  ],
  "tor": [
    "getWalletSocksEndpoint"
  ],
  "signers": [
    "getSigner"
  ],
  "transactionIntent": [
    "transactionIntent",
    "validIntent"
  ],
  "transactionNetwork": [
    "assertPrivateTransactionNetworkDestination",
    "getPrivateTransactionNetwork",
    "getPrivateTransactionNetworkDestination"
  ],
  "submissionJournal": [
    "getPrivateSubmissionJournal",
    "readExistingPrivateSubmissionSnapshot"
  ],
  "registry": [
    "getNetwork",
    "getEndpointSources",
    "getEndpoints"
  ],
  "journalRetention": [
    "validArchive"
  ],
  "transactions": [
    "signAndSendTransaction"
  ],
  "submitter": [
    "readMetadata"
  ]
};
const input = Object.fromEntries(Object.entries(schema).map(([family, names]) => [
  family, Object.fromEntries(names.map((name) => [name, (..._args) => {
    throw new Error('Unexpected storage process host port: ' + family + '.' + name);
  }]))
]));
input.context = {
  getPrivacyContext: context.getPrivacyContext,
  createPrivacyScope: context.createPrivacyScope,
};
input.sourceIdentity = { readDigest: () => 'a'.repeat(64) };
require('../../src/owners/host-bindings.js').initializeRailgunOwnerHost(input);
module.exports = Object.freeze({ createPrivacyScope: context.createPrivacyScope });
