'use strict';
const assert = require('assert/strict');
const SOURCE = 'bfa8684f50b2bb838b026f2c4972653bfc4503d9fd15182c6c5b219ce1bc1e41';
const BASE = {
  'spending-public:null': 1,
  'viewing-identity:null': 1,
  'public-scan:plan': 60,
  'public-scan:apply': 1,
  'wallet-viewing:null': 1,
};
const EXPECTED = Object.freeze({
  prepare: {
    roles: {
      ...BASE,
      'private-operate:null': 1,
      'private-receive:null': 1,
      'poi-membership:null': 1,
      'spending-sign:null': 1,
      'private-verify:null': 1,
    },
    workers: [3, 3],
    rpc: {
      eth_chainId: 4,
      eth_getBlockByNumber: 1225,
      eth_getLogs: 60,
      ppoi_pois_per_list: 1,
      ppoi_merkle_proofs: 1,
      ppoi_poi_events: 1,
      ppoi_validate_poi_merkleroots: 1,
      eth_getCode: 5,
      eth_getBalance: 1,
      eth_getStorageAt: 2,
      eth_call: 8,
    },
  },
  'unchanged-list': {
    roles: { ...BASE, 'private-operate:null': 1, 'private-receive:null': 1 },
    workers: [3, 3],
    rpc: {
      eth_chainId: 2,
      eth_getCode: 1,
      eth_getBalance: 1,
      eth_getBlockByNumber: 1222,
      eth_getLogs: 60,
      ppoi_pois_per_list: 1,
      ppoi_merkle_proofs: 1,
      ppoi_poi_events: 1,
    },
  },
  'stored-proof-cold': {
    roles: { 'spending-public:null': 1, 'viewing-identity:null': 1 },
    workers: [0, 2],
    rpc: {},
  },
});
function validate(report) {
  assert.equal(report.schema, 'railgun-installed-owner-private-native-v1');
  assert.equal(report.pairedOwnerInitialization, true);
  const expected = EXPECTED[report.mode];
  assert.ok(expected);
  const value = report.scenario;
  assert.equal(value.originalLaneAndSessionClosed, true);
  assert.equal(value.rpcOwner, 'genuine-private-rpc');
  assert.equal(value.outerQualificationRequired, true);
  assert.deepEqual(value.syntheticRpcMethods, expected.rpc);
  if (report.mode === 'unchanged-list') {
    assert.equal(value.schema, 'railgun-installed-owner-private-unchanged-list-v1');
    for (const name of [
      'preparationRefused',
      'independentlyVerifiedSignatureRefusal',
      'normalizedPathAccepted',
    ])
      assert.equal(value[name], true);
    assert.equal(value.internalRefusalCauseObserved, false);
    assert.equal(value.submissionEnabled, false);
  } else {
    assert.equal(value.sourceSha256, SOURCE);
    assert.match(value.holdId, /^[a-f0-9]{64}$/);
    assert.match(value.transactionDigest, /^0x[a-f0-9]{64}$/);
    assert.equal(value.originalSignatureBytesObserved, false);
    if (report.mode === 'prepare') {
      assert.equal(value.schema, 'railgun-installed-owner-private-prepared-v1');
      assert.equal(value.status, 'prepared-unbroadcast');
      assert.equal(value.inputType, 'Shield');
      assert.equal(value.inputAmount, '2000');
      assert.equal(value.preparationReviews, 1);
      assert.equal(value.publicRanges, 60);
      assert.equal(value.historyState, 'proof-present');
      for (const name of ['syntheticChain', 'syntheticListTrust']) assert.equal(value[name], true);
      for (const name of [
        'broadcasterInvoked',
        'freshProofRecoveryQualified',
        'liveTransportQualified',
      ])
        assert.equal(value[name], false);
    } else {
      assert.equal(value.schema, 'railgun-installed-owner-private-stored-proof-cold-v1');
      assert.equal(value.status, 'proof-present');
      assert.equal(value.samePublicTransactionDigest, true);
      for (const name of [
        'submissionEnabled',
        'proofRegenerationQualified',
        'freshProofVerificationQualified',
        'crashRecoveryQualified',
      ])
        assert.equal(value[name], false);
    }
  }
  const { utilities, workers, observationRefusals } = report.observations;
  assert.equal(observationRefusals, 0);
  assert.equal(
    utilities.length,
    Object.values(expected.roles).reduce((a, b) => a + b, 0)
  );
  const roles = {};
  for (const row of utilities) {
    const role = row.job + ':' + row.mode;
    roles[role] = (roles[role] || 0) + 1;
    assert.ok(Object.hasOwn(expected.roles, role));
    assert.equal(row.ready, 1);
    assert.equal(row.results, 1);
    assert.equal(row.exitObserved, true);
    assert.equal(row.exitCode, 15);
    assert.deepEqual(row.terminations, ['SIGTERM']);
    const keyed = [
      'spending-public',
      'viewing-identity',
      'wallet-viewing',
      'private-operate',
      'private-receive',
      'spending-sign',
    ].includes(row.job);
    assert.equal(row.keyRequests, keyed ? 1 : 0);
    assert.equal(row.keyReplies, keyed ? 1 : 0);
    for (const [method, count] of Object.entries(row.methods)) {
      assert.ok(Number.isSafeInteger(count) && count > 0 && count <= 200000);
      assert.ok(
        [
          'key',
          'result',
          'jobResult',
          'sourceNext',
          'get',
          'getMany',
          'open',
          'next',
          'nextMany',
          'seek',
          'end',
          'batch',
          'txBegin',
          'txStage',
          'txCommit',
          'txAbort',
          'txRead',
          'private-intent',
          'input',
        ].includes(method) ||
          /^(public|wallet):(get|getMany|open|next|nextMany|seek|end|batch|txBegin|txStage|txCommit|txAbort|txRead)$/.test(
            method
          )
      );
      if (method === 'input') {
        assert.equal(row.job, 'poi-membership');
        assert.equal(count, 1);
      }
      if (method === 'private-intent') {
        assert.equal(row.job, 'private-operate');
        assert.equal(count, 1);
      }
    }
    if (row.job === 'poi-membership') assert.equal(row.methods.input, 1);
    if (row.job === 'private-operate') assert.equal(row.methods['private-intent'], 1);
  }
  assert.deepEqual(roles, expected.roles);
  assert.equal(workers.length, expected.workers[0] + expected.workers[1]);
  assert.equal(workers.filter((v) => v.create === true).length, expected.workers[0]);
  assert.equal(workers.filter((v) => v.create === false).length, expected.workers[1]);
  for (const row of workers) {
    assert.equal(row.ready, 1);
    assert.equal(row.exitObserved, true);
    assert.equal(row.exitCode, 0);
  }
  return true;
}
module.exports = { validate, EXPECTED };
