'use strict';
const assert = require('assert/strict');
const base = require('./report.cjs');
const SOURCE = 'bfa8684f50b2bb838b026f2c4972653bfc4503d9fd15182c6c5b219ce1bc1e41';
const BASE = {
  'spending-public:null': 1,
  'viewing-identity:null': 1,
  'public-scan:plan': 60,
  'public-scan:apply': 1,
  'wallet-viewing:null': 1,
};
const EXPECTED = Object.freeze({
  ...base.EXPECTED,
  'signed-unfinished': {
    roles: {
      ...BASE,
      'private-operate:null': 1,
      'private-receive:null': 1,
      'poi-membership:null': 1,
      'spending-sign:null': 1,
    },
    workers: [3, 3],
    rpc: { ...base.EXPECTED.prepare.rpc, eth_getBlockByNumber: 1220 },
  },
  'signed-proof-cold': {
    roles: {
      'spending-public:null': 1,
      'viewing-identity:null': 1,
      'public-scan:plan': 2,
      'wallet-viewing:null': 1,
      'private-recover:null': 1,
      'private-verify:null': 1,
    },
    workers: [0, 3],
    rpc: { eth_chainId: 1, eth_getBlockByNumber: 46, eth_getLogs: 2 },
  },
});

function validate(report) {
  if (!['signed-unfinished', 'signed-proof-cold'].includes(report.mode))
    return base.validate(report);
  assert.equal(report.schema, 'railgun-installed-owner-private-native-v1');
  assert.equal(report.pairedOwnerInitialization, true);
  const expected = EXPECTED[report.mode];
  assert.ok(expected);
  const value = report.scenario;
  assert.equal(value.originalLaneAndSessionClosed, true);
  assert.equal(value.rpcOwner, 'genuine-private-rpc');
  assert.equal(value.outerQualificationRequired, true);
  assert.deepEqual(value.syntheticRpcMethods, expected.rpc);
  assert.equal(value.sourceSha256, SOURCE);
  for (const key of ['signatureSha256', 'capsuleSha256'])
    assert.match(value[key], /^[0-9a-f]{64}$/);
  assert.equal(value.submissionEnabled, false);
  assert.equal(value.crashRecoveryQualified, false);
  const meta = report.observations.recovery;
  assert.deepEqual(
    Object.keys(meta).sort(),
    [
      'cutoff',
      'signedReplyPosted',
      'signerExitBeforeCutoff',
      'signatureSha256',
      'capsuleSha256',
      'coldInputs',
      'sameSignature',
      'sameCapsule',
    ].sort()
  );
  assert.equal(meta.signatureSha256, value.signatureSha256);
  assert.equal(meta.capsuleSha256, value.capsuleSha256);
  if (report.mode === 'signed-unfinished') {
    assert.equal(value.schema, 'railgun-installed-owner-signed-unfinished-v1');
    assert.equal(value.status, 'cancelled-after-signed-reply');
    assert.equal(value.preparationReviews, 1);
    assert.equal(value.publicRanges, 60);
    for (const name of ['preparationRejected', 'syntheticChain', 'syntheticListTrust'])
      assert.equal(value[name], true);
    assert.equal(value.durableStateVerifiedByHistory, false);
    assert.equal(Object.hasOwn(value, 'holdId'), false);
    assert.equal(meta.cutoff, 1);
    assert.equal(meta.signedReplyPosted, 1);
    assert.equal(meta.signerExitBeforeCutoff, true);
    assert.equal(meta.coldInputs, 0);
    assert.equal(meta.sameSignature, false);
    assert.equal(meta.sameCapsule, false);
  } else {
    assert.equal(value.schema, 'railgun-installed-owner-signed-proof-cold-v1');
    assert.equal(value.status, 'proof-stored');
    assert.match(value.holdId, /^[0-9a-f]{64}$/);
    assert.match(value.transactionDigest, /^0x[0-9a-f]{64}$/);
    assert.equal(value.initialHistoryState, 'signed-unfinished');
    assert.equal(value.finalHistoryState, 'proof-present');
    assert.equal(value.sameOriginalSignature, true);
    assert.equal(value.sameOriginalCapsule, true);
    assert.equal(meta.cutoff, 0);
    assert.equal(meta.signedReplyPosted, 0);
    assert.equal(meta.signerExitBeforeCutoff, false);
    assert.equal(meta.coldInputs, 1);
    assert.equal(meta.sameSignature, true);
    assert.equal(meta.sameCapsule, true);
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
    const cancelled = report.mode === 'signed-unfinished' && row.job === 'private-operate';
    assert.equal(row.ready, cancelled ? 0 : 1);
    if (cancelled) {
      assert.ok(Number.isSafeInteger(row.results) && row.results >= 0 && row.results <= 1);
      assert.ok(Array.isArray(row.failures) && row.failures.length <= 1);
      for (const failure of row.failures) assert.equal(failure, 'job');
      assert.equal(row.methods.result || 0, row.results);
    } else {
      assert.equal(row.results, 1);
      assert.deepEqual(row.failures, []);
    }
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
      'private-recover',
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
