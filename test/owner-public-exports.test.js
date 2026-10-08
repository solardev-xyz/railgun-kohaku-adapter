'use strict';
const path = require('path');
const { execFileSync } = require('child_process');

test('public owner entries share identity, stay lazy and expose no private owner resolver', () => {
  const script = `
    const assert = require('assert/strict');
    const path = require('path');
    const root = process.cwd();
    (async () => {
      const base = '@freedom/railgun-kohaku-adapter';
      const owner = require(base + '/host/owner');
      const esm = await import(base + '/host/owner');
      assert.deepEqual(Object.keys(owner), ['initializeRailgunMain']);
      assert.deepEqual(Object.keys(esm), ['initializeRailgunMain']);
      assert.equal(owner.initializeRailgunMain, esm.initializeRailgunMain);
      const authority = require(base + '/host/owner-authority');
      const authorityEsm = await import(base + '/host/owner-authority');
      assert.equal(Object.keys(authority).length, 6);
      assert.deepEqual(Object.keys(authority).sort(), Object.keys(authorityEsm).sort());
      for (const key of Object.keys(authority)) {
        assert.equal(authority[key], authorityEsm[key]);
        assert.throws(() => authority[key]({}), {code: 'RAILGUN_OWNER_HOST_UNAVAILABLE'});
      }
      const worker = require(base + '/host/owner-worker-bootstrap');
      assert.deepEqual(Object.keys(worker), ['installRailgunStorageWorkerBootstrap']);
      assert.throws(() => worker.installRailgunStorageWorkerBootstrap());
      assert.equal(Object.keys(require.cache).some(file => file.startsWith(path.join(root, 'src/owners/railgun-'))), false);
      for (const marker of ['owner-host-v1', 'owner-worker-host-v1', 'execution-host-v1'])
        assert.equal(Object.hasOwn(globalThis, Symbol.for(base + '/' + marker)), false);
      for (const suffix of ['/src/owners/host-bindings.js', '/src/owners/railgun-account-wallet.js', '/host/internal', '/host/owners'])
        assert.throws(() => require(base + suffix), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
    timeout: 30000,
  });
});
