/** Fixed path inventory only. Resolving a location neither imports the job nor
 * authorizes a key loan. The host retains exact subject/job and owner admission.
 */
'use strict';
const jobs = Object.freeze({
  'spending-public': './railgun-identity-job.js',
  'viewing-identity': './railgun-identity-job.js',
  'spending-sign': './railgun-spend-sign-job.js',
  'wallet-viewing': './railgun-wallet-job.js',
  'private-prepare': './railgun-private-prepare-job.js',
  'private-operate': './railgun-private-operate-job.js',
  'private-recover': './railgun-private-recover-job.js',
  'private-receive': './railgun-private-receive-job.js',
  'private-verify': './railgun-private-verify-job.js',
});
function getRailgunExecutionJob(purpose) {
  if (typeof purpose !== 'string' || !Object.hasOwn(jobs, purpose)) {
    throw Object.assign(new Error('Railgun execution job unavailable'), {
      code: 'RAILGUN_EXECUTION_JOB_UNAVAILABLE',
    });
  }
  return require.resolve(jobs[purpose]);
}
module.exports = { getRailgunExecutionJob };
