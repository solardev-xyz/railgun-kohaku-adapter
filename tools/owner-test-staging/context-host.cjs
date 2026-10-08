/* global jest */
// Fixed test-only composition: actual private owner/execution bindings and the
// original copied context issuer. No global marker reset or second issuer.
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
    throw new Error('Unexpected test host port: ' + family + '.' + name);
  }]))
]));
input.context = {
  getPrivacyContext: context.getPrivacyContext,
  createPrivacyScope: context.createPrivacyScope,
};
// Actual fixed validator, copied byte-for-byte from the public host source.
input.journalRetention = {
  validArchive: (...args) => require('./fixtures/host/src/main/wallet/privacy-journal-retention.js').validArchive(...args),
};
const lifetime = new AbortController().signal;
input.platform.applicationLifetime = () => lifetime;
// Test-only fixed worker composition preserves original Worker handles and the
// original suite's Worker subclass instrumentation. No selectable entry input.
input.platform.spawnStorageWorker = ({ workerData, transferList }) => {
  const { Worker } = require('worker_threads');
  const worker = new Worker(require.resolve('./storage-worker-entry.cjs'), {
    workerData, transferList, env: {}, execArgv: [], stdout: true, stderr: true,
    resourceLimits: { maxOldGenerationSizeMb: 256 },
  });
  worker.stdout.resume();
  worker.stderr.resume();
  return worker;
};
// Fixed actual generic host storage capability, copied with source provenance.
// Lazy lookup preserves each original suite's explicit storage fault injection.
input.storage = {
  createPrivacyStorage: (...args) => require('./fixtures/host/src/main/wallet/privacy-storage.js').createPrivacyStorage(...args),
  getPrivacyStoragePath: (...args) => require('./fixtures/host/src/main/wallet/privacy-storage.js').getPrivacyStoragePath(...args),
};
// Fixed pure shared transaction metadata, using the pinned generic host fixture.
input.transactionIntent = {
  transactionIntent: (...args) => require('./fixtures/host/src/main/wallet/private-transaction-intent.js').transactionIntent(...args),
  validIntent: (...args) => require('./fixtures/host/src/main/wallet/private-transaction-intent.js').validIntent(...args),
};
// Actual copied generic RPC owner; only fixed lower host ports are test-controlled.
input.rpc = {
  assertPrivateRpcDestination: (...args) => require('./fixtures/host/src/main/networks/private-rpc.js').assertPrivateRpcDestination(...args),
  createPrivateRpc: (...args) => require('./fixtures/host/src/main/networks/private-rpc.js').createPrivateRpc(...args),
  createPrivateRpcDestinationConstraint: (...args) => require('./fixtures/host/src/main/networks/private-rpc.js').createPrivateRpcDestinationConstraint(...args),
  createPrivateRpcReadBudget: (...args) => require('./fixtures/host/src/main/networks/private-rpc.js').createPrivateRpcReadBudget(...args),
  getPrivateRpcDestination: (...args) => require('./fixtures/host/src/main/networks/private-rpc.js').getPrivateRpcDestination(...args),
  getPrivateRpcDestinationDetails: (...args) => require('./fixtures/host/src/main/networks/private-rpc.js').getPrivateRpcDestinationDetails(...args),
  getPrivateRpcReadBudgetOutcome: (...args) => require('./fixtures/host/src/main/networks/private-rpc.js').getPrivateRpcReadBudgetOutcome(...args),
};
let submitterHost;
input.submitter = {
  readMetadata: (...args) => {
    submitterHost ??= require('./fixtures/host/src/main/identity/railgun-submitter-host.js').createRailgunSubmitterHost();
    return submitterHost.readMetadata(...args);
  },
};
input.sourceIdentity = { readDigest: () => 'a'.repeat(64) };
const owner = jest.requireActual('../../src/owners/host-bindings.js');
owner.initializeRailgunOwnerHost(input);
const execution = jest.requireActual('../../src/execution/host-bindings.js');
// Test isolation retains actual initialized objects across resetModules and
// isolateModules; it does not qualify duplicate package admission.
jest.doMock('../../src/owners/host-bindings.js', () => owner);
jest.doMock('../../src/execution/host-bindings.js', () => execution);
