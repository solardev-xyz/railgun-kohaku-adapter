/** Package-private admission data. No path, callback or caller key selector. */
'use strict';
const jobs = Object.create(null);
function add(names, role, key) {
  for (const name of names) jobs[name] = Object.freeze({ role, key });
}
add(['spending-public', 'viewing-identity', 'spending-sign', 'relay-sign'], 'keystore', true);
add(
  [
    'wallet-viewing',
    'private-prepare',
    'private-operate',
    'private-recover',
    'private-receive',
    'relay-pre-poi',
    'relay-prove-local',
    'relay-prepare',
    'relay-reconstruct',
    'poi-prove',
    'poi-transact-selector',
    'poi-output-recover',
    'shield-receive',
  ],
  'engine',
  true
);
add(['private-verify', 'poi-verify', 'relay-verify', 'relay-signature-verify'], 'prover', false);
add(
  [
    'shield-prepare',
    'note-provenance',
    'relay-quote-review',
    'poi-shield-selector',
    'own-txid-selector',
    'own-txid-proof',
    'public-scan',
    'txid-inspect',
    'txid-project',
    'txid-apply',
    'txid-witness',
    'txid-note-witness',
    'txid-historical-root',
    'txid-coverage',
  ],
  'engine',
  false
);
add(['poi-membership'], 'poi', false);
Object.freeze(jobs);
function getProcessJob(name) {
  return typeof name === 'string' && Object.hasOwn(jobs, name) ? jobs[name] : undefined;
}
function admitsProcessJob(name, subject) {
  const job = getProcessJob(name);
  return (
    !!job &&
    subject.kind === 'private-account' &&
    subject.protocol === 'railgun' &&
    subject.chainId === 11155111 &&
    subject.deployment === 'sepolia' &&
    subject.role === job.role &&
    (name === 'poi-membership'
      ? typeof subject.operation === 'string' && /^poi:[0-9a-f]{64}$/.test(subject.operation)
      : subject.operation === name)
  );
}
module.exports = Object.freeze({ getProcessJob, admitsProcessJob });
