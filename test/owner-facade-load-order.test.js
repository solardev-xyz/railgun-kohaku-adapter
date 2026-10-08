/** Real Node require.cache checks; only package source is loaded, no owner/runtime job. */
"use strict";
const path = require("path");
const { spawnSync } = require("child_process");
const root = path.join(__dirname, "..");
test("import and invalid runtime cannot load owner algorithms before source capture", () => {
  const program = `
    const assert = require('assert/strict'), fs = require('fs'), vm = require('vm');
    const root = process.argv[1];
    const ownerCache = () => Object.keys(require.cache).filter(p => p.startsWith(root + '/src/owners/railgun-'));
    const api = require(root + '/src/owners/operational-facade');
    assert.deepEqual(ownerCache(), []);
    const text = fs.readFileSync(root + '/src/owners/host-bindings.js', 'utf8');
    const schemaText = text.slice(text.indexOf('const SCHEMA ='), text.indexOf('const fail ='));
    const schema = vm.runInNewContext(schemaText + ';SCHEMA');
    const host = Object.fromEntries(Object.entries(schema).map(([family, names]) => [family,
      Object.fromEntries(names.map(name => [name, () => { throw Error('unexpected host activity'); }]))]));
    let sourceRead = 0;
    host.sourceIdentity.readDigest = () => { sourceRead++; assert.deepEqual(ownerCache(), []); return 'a'.repeat(64); };
    assert.throws(() => api.initializeRailgunMain({ host,
      runtime: { archive: 'relative', proverArchive: '/public/prover', artifactDirectory: '/public/artifacts' } }));
    assert.equal(sourceRead, 1);
    assert.deepEqual(ownerCache(), []);
    assert.ok(require.cache[require.resolve(root + '/src/owners/source-identity')]);
    assert.ok(require.cache[require.resolve(root + '/src/execution/host-bindings')]);
    process.stdout.write(JSON.stringify({sourceRead, ownerModules: ownerCache().length}));
  `;
  const child = spawnSync(process.execPath, ["-e", program, root], {
    encoding: "utf8",
    timeout: 10000,
  });
  expect({
    status: child.status,
    signal: child.signal,
    stderr: child.stderr,
  }).toEqual({ status: 0, signal: null, stderr: "" });
  expect(JSON.parse(child.stdout)).toEqual({ sourceRead: 1, ownerModules: 0 });
});
