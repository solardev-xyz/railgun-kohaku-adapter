'use strict';
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const root = path.join(__dirname, '..');
const manifest = require('../docs/owners/test-staging/MANIFEST.json');
const adaptations = require('../docs/owners/test-staging/CLOSED-ADAPTATIONS.json');
const contextAdaptations = require('../docs/owners/test-staging/CONTEXT-ADAPTATIONS.json');
const hostAdaptations = require('../docs/owners/test-staging/HOST-ADAPTATIONS.json');
const pureAdaptations = require('../docs/owners/test-staging/HOST-PURE-ADAPTATIONS.json');
const snapshotAdaptations = require('../docs/owners/test-staging/HOST-SNAPSHOT-ADAPTATIONS.json');
const jobAdaptations = require('../docs/owners/test-staging/HOST-JOBS-ADAPTATIONS.json');
const receiptAdaptations = require('../docs/owners/test-staging/HOST-RECEIPTS-ADAPTATIONS.json');
const accountAdaptations = require('../docs/owners/test-staging/HOST-ACCOUNTS-ADAPTATIONS.json');
const transportAdaptations = require('../docs/owners/test-staging/HOST-TRANSPORT-ADAPTATIONS.json');
const walletAdaptations = require('../docs/owners/test-staging/HOST-WALLET-ADAPTATIONS.json');
const rpcAdaptations = require('../docs/owners/test-staging/HOST-RPC-ADAPTATIONS.json');
const disclosureAdaptations = require('../docs/owners/test-staging/HOST-DISCLOSURE-ADAPTATIONS.json');
const originAdaptations = require('../docs/owners/test-staging/HOST-ORIGIN-ADAPTATIONS.json');
const operationAdaptations = require('../docs/owners/test-staging/HOST-OPERATIONS-ADAPTATIONS.json');
const journalAdaptations = require('../docs/owners/test-staging/HOST-JOURNAL-ADAPTATIONS.json');
const submissionAdaptations = require('../docs/owners/test-staging/HOST-SUBMISSION-ADAPTATIONS.json');
const credentialAdaptations = require('../docs/owners/test-staging/HOST-CREDENTIAL-ADAPTATIONS.json');
const pluginAdaptations = require('../docs/owners/test-staging/HOST-PLUGIN-ADAPTATIONS.json');
const retired = require('../docs/owners/RETIRED-RUNTIME.json');
const sha = (value) => createHash('sha256').update(value).digest('hex');
test('all staged tests and fixtures preserve exact c6 bytes through reversible import-only edits', () => {
  expect(manifest.sourceRevision).toBe('c6afd0432918d1258c1aafe11117f133cdd21ef4');
  expect(manifest.inventoryTests).toBe(180);
  expect(manifest.stagedTests).toBe(151);
  expect(manifest.stagedFixtures).toBe(17);
  expect(manifest.excluded).toHaveLength(29);
  expect(manifest.files).toHaveLength(168);
  expect(new Set(manifest.files.map((row) => row.destination)).size).toBe(168);
  for (const row of manifest.files) {
    let text = fs.readFileSync(path.join(root, row.destination), 'utf8');
    const plugin = pluginAdaptations.changes.find((entry) => entry.file === row.destination);
    if (plugin) {
      expect(sha(text)).toBe(plugin.afterSha256);
      for (const edit of [...plugin.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(plugin.beforeSha256);
    }
    const credential = credentialAdaptations.changes.find((entry) => entry.file === row.destination);
    if (credential) {
      expect(sha(text)).toBe(credential.afterSha256);
      for (const edit of [...credential.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(credential.beforeSha256);
    }
    const submission = submissionAdaptations.changes.find((entry) => entry.file === row.destination);
    if (submission) {
      expect(sha(text)).toBe(submission.afterSha256);
      for (const edit of [...submission.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(submission.beforeSha256);
    }
    const journal = journalAdaptations.changes.find((entry) => entry.file === row.destination);
    if (journal) {
      expect(sha(text)).toBe(journal.afterSha256);
      for (const edit of [...journal.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(journal.beforeSha256);
    }
    const operations = operationAdaptations.changes.find((entry) => entry.file === row.destination);
    if (operations) {
      expect(sha(text)).toBe(operations.afterSha256);
      for (const edit of [...operations.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(operations.beforeSha256);
    }
    const origin = originAdaptations.changes.find((entry) => entry.file === row.destination);
    if (origin) {
      expect(sha(text)).toBe(origin.afterSha256);
      for (const edit of [...origin.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(origin.beforeSha256);
    }
    const disclosure = disclosureAdaptations.changes.find((entry) => entry.file === row.destination);
    if (disclosure) {
      expect(sha(text)).toBe(disclosure.afterSha256);
      for (const edit of [...disclosure.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(disclosure.beforeSha256);
    }
    const rpc = rpcAdaptations.changes.find((entry) => entry.file === row.destination);
    if (rpc) {
      expect(sha(text)).toBe(rpc.afterSha256);
      for (const edit of [...rpc.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(rpc.beforeSha256);
    }
    const wallet = walletAdaptations.changes.find((entry) => entry.file === row.destination);
    if (wallet) {
      expect(sha(text)).toBe(wallet.afterSha256);
      for (const edit of [...wallet.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(wallet.beforeSha256);
    }
    const transport = transportAdaptations.changes.find((entry) => entry.file === row.destination);
    if (transport) {
      expect(sha(text)).toBe(transport.afterSha256);
      for (const edit of [...transport.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(transport.beforeSha256);
    }
    const accounts = accountAdaptations.changes.find((entry) => entry.file === row.destination);
    if (accounts) {
      expect(sha(text)).toBe(accounts.afterSha256);
      for (const edit of [...accounts.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(accounts.beforeSha256);
    }
    const receipts = receiptAdaptations.changes.find((entry) => entry.file === row.destination);
    if (receipts) {
      expect(sha(text)).toBe(receipts.afterSha256);
      for (const edit of [...receipts.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(receipts.beforeSha256);
    }
    const jobs = jobAdaptations.changes.find((entry) => entry.file === row.destination);
    if (jobs) {
      expect(sha(text)).toBe(jobs.afterSha256);
      for (const edit of [...jobs.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(jobs.beforeSha256);
    }
    const snapshot = snapshotAdaptations.changes.find((entry) => entry.file === row.destination);
    if (snapshot) {
      expect(sha(text)).toBe(snapshot.afterSha256);
      for (const edit of [...snapshot.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(snapshot.beforeSha256);
    }
    const pure = pureAdaptations.changes.find((entry) => entry.file === row.destination);
    if (pure) {
      expect(sha(text)).toBe(pure.afterSha256);
      for (const edit of [...pure.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(pure.beforeSha256);
    }
    const hosted = hostAdaptations.changes.find((entry) => entry.file === row.destination);
    if (hosted) {
      expect(sha(text)).toBe(hosted.afterSha256);
      for (const edit of [...hosted.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(hosted.beforeSha256);
    }
    const composed = contextAdaptations.changes.find((entry) => entry.file === row.destination);
    if (composed) {
      expect(sha(text)).toBe(composed.afterSha256);
      for (const edit of [...composed.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(composed.beforeSha256);
    }
    const adapted = adaptations.changes.find((entry) => entry.file === row.destination);
    if (adapted) {
      expect(sha(text)).toBe(adapted.afterSha256);
      for (const edit of [...adapted.replacements].reverse()) {
        expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
        text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
      }
      expect(sha(text)).toBe(adapted.beforeSha256);
    }
    expect(sha(text)).toBe(row.destinationSha256);
    expect(row.sourceBlob).toMatch(/^[a-f0-9]{40}$/);
    let lastEnd = -1;
    // Stored offsets refer to the original source. Undo from left to right:
    // restoring each earlier literal puts the next literal at its old offset.
    for (const edit of row.edits) {
      expect(edit.start).toBeGreaterThanOrEqual(lastEnd);
      lastEnd = edit.end;
      expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
      expect(JSON.parse(edit.after).startsWith('.')).toBe(true);
      expect(edit.before[0]).toMatch(/["']/);
      text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
    }
    expect(Buffer.byteLength(text)).toBe(row.sourceBytes);
    expect(sha(text)).toBe(row.sourceSha256);
    for (const imported of row.imports) {
      const historical = retired.find((entry) => entry.source === imported);
      if (historical) expect(fs.existsSync(path.join(root, imported))).toBe(false);
      expect(fs.existsSync(path.join(root, historical?.preserved || imported))).toBe(true);
    }
  }
});
test('browser host and installed-consumer suites remain explicit exclusions', () => {
  expect(manifest.excluded.map((row) => row.source)).toEqual(
    expect.arrayContaining([
      'src/main/wallet/private-submission-journal.test.js',
      'src/main/wallet/railgun-kohaku-adapter-package.test.js',
      'scripts/qualify-railgun-private-live.test.js',
    ])
  );
  expect(manifest.files.every((row) => !row.destination.startsWith('src/'))).toBe(true);
});

test('public host retention fixtures are exact c6 bytes and fixed bindings never become runtime owners', () => {
  const fixture = require('../docs/owners/test-staging/HOST-RETENTION-FIXTURE.json');
  expect(fixture.files).toHaveLength(6);
  for (const row of fixture.files) {
    const bytes = fs.readFileSync(path.join(root, row.destination));
    expect(row.sourceCommit).toBe(manifest.sourceRevision);
    expect({ bytes: bytes.length, sha256: sha(bytes) }).toEqual({ bytes: row.bytes, sha256: row.sha256 });
    expect(row.destination.startsWith('tools/owner-test-staging/fixtures/host/')).toBe(true);
  }
  for (const [file, target] of Object.entries(fixture.fixedTestBindings)) {
    const binding = path.join(root, 'tools/owner-test-staging/fixtures/host', file);
    expect(require(binding)).toBe(require(path.join(root, target)));
  }
});

test('default CI discovery includes every qualified closed suite by exact filename only', () => {
  const config = require('../jest.config.js');
  const closed = require('../tools/owner-test-staging/jest.closed.config.cjs');
  expect(config.maxWorkers).toBe(2);
  expect(config.workerIdleMemoryLimit).toBe('256MB');
  expect(closed.testMatch).toHaveLength(58);
  expect(closed.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const context = require('../tools/owner-test-staging/jest.context.config.cjs');
  expect(context.testMatch).toHaveLength(35);
  expect(context.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const storage = require('../tools/owner-test-staging/jest.host-storage.config.cjs');
  expect(storage.testMatch).toHaveLength(10);
  expect(storage.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const pure = require('../tools/owner-test-staging/jest.host-pure.config.cjs');
  expect(pure.testMatch).toHaveLength(6);
  expect(pure.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const snapshot = require('../tools/owner-test-staging/jest.host-snapshot.config.cjs');
  expect(snapshot.testMatch).toHaveLength(1);
  expect(snapshot.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const jobs = require('../tools/owner-test-staging/jest.host-jobs.config.cjs');
  expect(jobs.testMatch).toHaveLength(3);
  expect(jobs.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const receipts = require('../tools/owner-test-staging/jest.host-receipts.config.cjs');
  expect(receipts.testMatch).toHaveLength(4);
  expect(receipts.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const accounts = require('../tools/owner-test-staging/jest.host-accounts.config.cjs');
  expect(accounts.testMatch).toHaveLength(3);
  expect(accounts.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const transport = require('../tools/owner-test-staging/jest.host-transport.config.cjs');
  expect(transport.testMatch).toHaveLength(7);
  expect(transport.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const wallet = require('../tools/owner-test-staging/jest.host-wallet.config.cjs');
  expect(wallet.testMatch).toHaveLength(2);
  expect(wallet.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const rpc = require('../tools/owner-test-staging/jest.host-rpc.config.cjs');
  expect(rpc.testMatch).toHaveLength(4);
  expect(rpc.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const disclosure = require('../tools/owner-test-staging/jest.host-disclosure.config.cjs');
  expect(disclosure.testMatch).toHaveLength(1);
  expect(disclosure.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const origin = require('../tools/owner-test-staging/jest.host-origin.config.cjs');
  expect(origin.testMatch).toHaveLength(1);
  expect(origin.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const operations = require('../tools/owner-test-staging/jest.host-operations.config.cjs');
  expect(operations.testMatch).toHaveLength(3);
  expect(operations.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const journal = require('../tools/owner-test-staging/jest.host-journal.config.cjs');
  expect(journal.testMatch).toHaveLength(4);
  expect(journal.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const submission = require('../tools/owner-test-staging/jest.host-submission.config.cjs');
  expect(submission.testMatch).toHaveLength(3);
  expect(submission.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  const plugin = require('../tools/owner-test-staging/jest.host-plugin.config.cjs');
  expect(plugin.testMatch).toHaveLength(1);
  expect(plugin.testMatch.every((name) => !/[?*]/.test(name))).toBe(true);
  expect(new Set([...closed.testMatch, ...context.testMatch, ...storage.testMatch, ...pure.testMatch, ...snapshot.testMatch, ...jobs.testMatch, ...receipts.testMatch, ...accounts.testMatch, ...transport.testMatch, ...wallet.testMatch, ...rpc.testMatch, ...disclosure.testMatch, ...origin.testMatch, ...operations.testMatch, ...journal.testMatch, ...submission.testMatch, ...plugin.testMatch]).size).toBe(146);
  expect(config.testMatch).toEqual([
    '<rootDir>/test/**/*.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-relay-wire/policy.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-relay-wire/recipe.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-relay-keys/recipe.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-restart-counts.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-restart-data.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-second-cold-counts.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-second-handoff.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-second-recovery-data.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-combined-poi-second-sign-counts.test.js',
    '<rootDir>/tools/qualification/scripts/fixtures/railgun-public-cold-counts.test.js',
    ...closed.testMatch,
    ...context.testMatch,
    ...storage.testMatch,
    ...pure.testMatch,
    ...snapshot.testMatch,
    ...jobs.testMatch,
    ...receipts.testMatch,
    ...accounts.testMatch,
    ...transport.testMatch,
    ...wallet.testMatch,
    ...rpc.testMatch,
    ...disclosure.testMatch,
    ...origin.testMatch,
    ...operations.testMatch,
    ...journal.testMatch,
    ...submission.testMatch,
    ...plugin.testMatch,
  ]);
});

test('generic encrypted storage fixtures and historical reader retain exact source provenance', () => {
  const fixture = require('../docs/owners/test-staging/HOST-STORAGE-FIXTURES.json');
  expect(fixture.files).toHaveLength(2);
  for (const row of fixture.files) {
    const bytes = fs.readFileSync(path.join(root, row.destination));
    expect(row.sourceCommit).toBe(manifest.sourceRevision);
    expect({ bytes: bytes.length, sha256: sha(bytes) }).toEqual({ bytes: row.bytes, sha256: row.sha256 });
    expect(row.destination.startsWith('tools/owner-test-staging/fixtures/host/')).toBe(true);
  }
  const historical = fixture.historicalReader;
  expect(sha(fs.readFileSync(path.join(root, historical.archive)))).toBe(historical.sha256);
  expect(sha(fs.readFileSync(path.join(root, historical.executedFixture)))).toBe(historical.executedSha256);
  expect(historical.sha256).toBe('618bdff954dae9bf31836c8d1ab9b5100d7409b9f7f8e68844afdff4b577fb89');
});

test('superseded host wrappers and mixed legacy harness remain exact non-runtime archives', () => {
  const archive = require('../docs/owners/test-staging/LEGACY-ADAPTER-ARCHIVE.json');
  expect(archive.runtimeAdmission).toBe(false);
  expect(archive.files).toHaveLength(5);
  for (const row of archive.files) {
    expect(row.sourceCommit).toBe(manifest.sourceRevision);
    expect(row.archive.endsWith('.txt')).toBe(true);
    const bytes = fs.readFileSync(path.join(root, row.archive));
    expect({ bytes: bytes.length, sha256: sha(bytes) }).toEqual({ bytes: row.bytes, sha256: row.sha256 });
  }
});

test('generic RPC fixture is exact c6 source and aliases bind only fixed test host families', () => {
  const fixture = require('../docs/owners/test-staging/HOST-RPC-FIXTURES.json');
  expect(fixture.liveTransport).toBe(false);
  expect(fixture.files).toHaveLength(1);
  expect(fixture.fixedTestBindings.map(row => row.family)).toEqual(['registry', 'transport', 'settings', 'tor']);
  for (const row of fixture.files) {
    expect(row.sourceCommit).toBe(manifest.sourceRevision);
    const bytes = fs.readFileSync(path.join(root, row.destination));
    expect({ bytes: bytes.length, sha256: sha(bytes) }).toEqual({ bytes: row.bytes, sha256: row.sha256 });
  }
  for (const row of fixture.fixedTestBindings) {
    const bytes = fs.readFileSync(path.join(root, row.file));
    expect({ bytes: bytes.length, sha256: sha(bytes) }).toEqual({ bytes: row.bytes, sha256: row.sha256 });
    expect(row.file.startsWith('tools/owner-test-staging/fixtures/host/')).toBe(true);
  }
});

test('fixed submitter metadata fixture preserves its reviewed host implementation', () => {
  const fixture = require('../docs/owners/test-staging/HOST-SUBMITTER-FIXTURE.json');
  expect(fixture.sourceCommit.startsWith('394a9c3e')).toBe(true);
  expect(fixture.destination.startsWith('tools/owner-test-staging/fixtures/host/')).toBe(true);
  const bytes = fs.readFileSync(path.join(root, fixture.destination));
  expect({ bytes: bytes.length, sha256: sha(bytes) }).toEqual({ bytes: fixture.bytes, sha256: fixture.sha256 });
});

test('generic journal/network fixtures retain exact source and fixed private owner bindings', () => {
  const fixture = require('../docs/owners/test-staging/HOST-JOURNAL-FIXTURES.json');
  expect(fixture.liveTransport).toBe(false);
  expect(fixture.files).toHaveLength(9);
  for (const row of fixture.files) {
    expect(row.sourceCommit).toBe(manifest.sourceRevision);
    const bytes = fs.readFileSync(path.join(root, row.destination));
    expect({ bytes: bytes.length, sha256: sha(bytes) }).toEqual({ bytes: row.bytes, sha256: row.sha256 });
  }
  for (const row of fixture.fixedTestBindings) {
    const bytes = fs.readFileSync(path.join(root, row.file));
    expect({ bytes: bytes.length, sha256: sha(bytes) }).toEqual({ bytes: row.bytes, sha256: row.sha256 });
    expect(row.file.startsWith('tools/owner-test-staging/fixtures/host/')).toBe(true);
  }
});

test('repository-only live qualifier helper retains exact source without executing its entry', () => {
  const fixture = require('../docs/owners/test-staging/HOST-SUBMISSION-FIXTURES.json');
  expect(fixture.sourceCommit).toBe(manifest.sourceRevision);
  expect(fixture.entryExecuted).toBe(false);
  for (const row of [fixture, fixture.pins]) {
    const bytes = fs.readFileSync(path.join(root, row.destination));
    expect({ bytes: bytes.length, sha256: sha(bytes) }).toEqual({ bytes: row.bytes, sha256: row.sha256 });
  }
});

test('separate real-derivation host conformance has exact fixtures and no default discovery claim', () => {
  const fixture = require('../docs/owners/test-staging/HOST-CREDENTIAL-FIXTURES.json');
  expect(fixture.liveProfiles).toBe(false);
  expect(fixture.files).toHaveLength(4);
  for (const row of fixture.files) {
    if (row.sourceCommit) expect(row.sourceCommit).toBe('8285fb804c82011abd4fcc38ccc00d66b27132e3');
    const file = row.destination || row.fixedTestBinding;
    const bytes = fs.readFileSync(path.join(root, file));
    expect({ bytes: bytes.length, sha256: sha(bytes) }).toEqual({ bytes: row.bytes, sha256: row.sha256 });
  }
  const conformance = require('../tools/owner-test-staging/jest.host-credential.config.cjs');
  expect(conformance.testMatch).toHaveLength(2);
  expect(conformance.testMatch.every(file => !require('../jest.config.js').testMatch.includes(file))).toBe(true);
});

test('historical broadcaster harness binds actual private owners without publishing a legacy API', () => {
  const fixture = require('../docs/owners/test-staging/HOST-PLUGIN-FIXTURES.json');
  expect(fixture.runtimeAdmission).toBe(false);
  const bytes = fs.readFileSync(path.join(root, fixture.destination));
  expect(bytes).toEqual(fs.readFileSync(path.join(root, fixture.sourceArchive)));
  expect({ bytes: bytes.length, sha256: sha(bytes) }).toEqual({ bytes: fixture.bytes, sha256: fixture.sha256 });
  const binding = fs.readFileSync(path.join(root, fixture.binding.file));
  expect({ bytes: binding.length, sha256: sha(binding) }).toEqual({ bytes: fixture.binding.bytes, sha256: fixture.binding.sha256 });
});
