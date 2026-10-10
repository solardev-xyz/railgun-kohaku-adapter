const { undoRetainedHelpers } = require("./retained-helper-transitions.cjs");
const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const { AbiCoder, Interface, keccak256 } = require('ethers');
const host = require('../host-data.cjs');
const safe = require('../data.cjs');
const { vectors } = require('./fixtures/private-capsule-vectors.json');
const provenance = require('./fixtures/private-data-provenance.json');
const clone = (value) => JSON.parse(JSON.stringify(value));
const abi = new Interface([host.TRANSACT_ABI]);
const names = [
  'TRANSACT_ABI',
  'BOUND_PARAMS',
  'validateRailgunPrivateTransaction',
  'validateRailgunPrivateSigningIntent',
  'matchRailgunPrivateProvedTransaction',
  'normalizeRailgunPrivateOffer',
  'normalizeRailgunPrivateCapsule',
  'digestRailgunPrivateCapsule',
  'isRailgunForeignTransfer',
  'assertRailgunPrivateTransferRecipient',
  'decodeRailgunForeignDestination',
  'verifyRailgunForeignOutput',
  'normalizeRailgunSignature',
  'selectRailgunPrivatePreparation',
  'normalizeRailgunPrivatePreparation',
  'normalizeRailgunPrivateOperation',
  'normalizeRailgunSpendSignature',
  'normalizeRailgunSpendKeyRequest',
  'normalizeRailgunPrivateVerification',
  'normalizeRailgunPrivateReceiver',
  'normalizeRailgunPrivateRecoveryInput',
  'normalizeRailgunPrivateRecoveryResult',
];
const coreFiles = [
  'railgun-private-policy.js',
  'railgun-private-intent.js',
  'railgun-private-offer.js',
  'railgun-private-capsule.js',
];

function transaction(capsule, change) {
  const result = { ...capsule.preparation.transaction };
  const tx = abi.decodeFunctionData('transact', result.data)[0][0].toArray(true);
  change(tx);
  result.data = abi.encodeFunctionData('transact', [[tx]]);
  return result;
}

function falseGrants(checked) {
  expect(Object.isFrozen(checked)).toBe(true);
  for (const key of [
    'proofVerified',
    'recipientVerified',
    'reservationsChecked',
    'spendingEnabled',
  ])
    expect(checked[key]).toBe(false);
  expect(checked).not.toHaveProperty('receipt');
  expect(checked).not.toHaveProperty('signingPermit');
}

test('trusted host exports the exact original and recovery core values', () => {
  expect(Object.isFrozen(host)).toBe(true);
  expect(Object.keys(host).sort()).toEqual([...names].sort());
  for (const file of coreFiles)
    for (const [name, value] of Object.entries(require('../src/data/' + file)))
      expect(host[name]).toBe(value);
  expect(safe.normalizeRailgunPrivateCapsule).not.toBe(host.normalizeRailgunPrivateCapsule);
  expect(safe.digestRailgunPrivateCapsule).not.toBe(host.digestRailgunPrivateCapsule);
});

test('actual Node CJS/ESM package consumers share all host identities without widening root/read exports', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import * as esm from '@freedom/railgun-kohaku-adapter/host/data';
    const require = createRequire(import.meta.url);
    const cjs = require('@freedom/railgun-kohaku-adapter/host/data');
    assert.equal(Object.keys(cjs).length, 22);
    assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
    for (const name of Object.keys(cjs)) assert.equal(cjs[name], esm[name]);
    const root = require('@freedom/railgun-kohaku-adapter');
    const read = require('@freedom/railgun-kohaku-adapter/read');
    assert.deepEqual(Object.keys(root).sort(), [
      'createRailgunKohakuSnapshotPlugin', 'createRailgunKohakuPrivateAdapter',
      'createRailgunKohakuPrivateAdapterBroadcaster', 'createRailgunKohakuPublicAdapter',
      'createRailgunKohakuPublicAdapterSubmitter'].sort());
    assert.deepEqual(Object.keys(read).sort(), ['normalizeRailgunKohakuReadFilter',
      'projectRailgunKohakuBalance', 'projectRailgunKohakuNotes', 'dispatchRailgunKohakuRead'].sort());
    assert.throws(() => require('@freedom/railgun-kohaku-adapter/src/data/railgun-private-policy'),
      { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    assert.equal(Object.keys(require.cache).some((file) => file.includes('/src/main/')), false);
    console.log(JSON.stringify({ sameHostValues: 22, rootValues: 5, readValues: 4 }));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: 30000,
  });
  expect(JSON.parse(output)).toEqual({ sameHostValues: 22, rootValues: 5, readValues: 4 });
});

test.each(vectors)('$name raw and safe capsule readers preserve golden bytes and digest', (v) => {
  const input = clone(v.input);
  const raw = host.normalizeRailgunPrivateCapsule(input);
  expect(JSON.stringify(raw)).toBe(v.canonical);
  expect(createHash('sha256').update(JSON.stringify(raw)).digest('hex')).toBe(v.canonicalSha256);
  expect(host.digestRailgunPrivateCapsule(input)).toBe(v.digest);
  expect(safe.normalizeRailgunPrivateCapsule(input)).toEqual(raw);
  expect(safe.digestRailgunPrivateCapsule(input)).toBe(v.digest);
});

test.each(vectors)(
  '$name intent, proved matcher and offer retain their actual structural contracts',
  (v) => {
    const capsule = clone(v.input);
    const { transaction: intent, expected } = capsule.preparation;
    const checked = host.validateRailgunPrivateSigningIntent(intent, expected);
    falseGrants(checked);
    expect(checked).toEqual(host.validateRailgunPrivateTransaction(intent, expected));
    const proved = transaction(capsule, (tx) => {
      tx[0] = [
        [1n, 2n],
        [
          [3n, 4n],
          [5n, 6n],
        ],
        [7n, 8n],
      ];
    });
    const matched = host.matchRailgunPrivateProvedTransaction(intent, proved, expected);
    falseGrants(matched);
    expect(matched.data).toBe(proved.data);
    expect(matched.digest).not.toBe(checked.digest);
    expect(() => host.validateRailgunPrivateSigningIntent(proved, expected)).toThrow();
    expect(() => host.matchRailgunPrivateProvedTransaction(proved, proved, expected)).toThrow();
    const differentRoot = transaction(capsule, (tx) => {
      tx[1] = '0x' + '00'.repeat(31) + '09';
    });
    expect(() =>
      host.matchRailgunPrivateProvedTransaction(intent, differentRoot, expected)
    ).toThrow();
    const offer = host.normalizeRailgunPrivateOffer(capsule.preparation, capsule.selection);
    const digest = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ['string', 'uint256', 'address', 'uint256', 'bytes'],
        [expected.kind, intent.chainId, intent.to, 0n, intent.data]
      )
    );
    expect(offer.transactionDigest).toBe(digest);
    expect(offer.transactionDigest).toBe(checked.digest);
    expect(Object.isFrozen(offer)).toBe(true);
    expect(Object.isFrozen(offer.transaction)).toBe(true);
    expect(Object.isFrozen(offer.expected)).toBe(true);
    expect(offer).not.toHaveProperty('spendingEnabled');
    expect(offer).not.toHaveProperty('receipt');
  }
);

test('trusted raw assertions remain distinct from the safe public error boundary', () => {
  const input = clone(vectors[0].input);
  input.unexpected = 'synthetic-only';
  let rawError;
  try {
    host.normalizeRailgunPrivateCapsule(input);
  } catch (error) {
    rawError = error;
  }
  expect(rawError.code).toBe('ERR_ASSERTION');
  expect(rawError).toHaveProperty('actual');
  let safeError;
  try {
    safe.normalizeRailgunPrivateCapsule(input);
  } catch (error) {
    safeError = error;
  }
  expect(safeError.code).toBe('RAILGUN_CAPSULE_DATA_REFUSED');
  expect(safeError).not.toHaveProperty('actual');
  expect(safeError).not.toHaveProperty('cause');
});

test('safe wrapper calls the shared actual capsule core on detached frozen data', () => {
  // Test-only delegate observers: no production verifier/receipt substitution.
  const core = require('../src/data/railgun-private-capsule');
  const normalize = jest.spyOn(core, 'normalizeRailgunPrivateCapsule');
  const digest = jest.spyOn(core, 'digestRailgunPrivateCapsule');
  try {
    const input = clone(vectors[0].input);
    expect(JSON.stringify(safe.normalizeRailgunPrivateCapsule(input))).toBe(vectors[0].canonical);
    expect(safe.digestRailgunPrivateCapsule(input)).toBe(vectors[0].digest);
    for (const observer of [normalize, digest]) {
      expect(observer).toHaveBeenCalledTimes(1);
      const copied = observer.mock.calls[0][0];
      expect(copied).toEqual(input);
      expect(copied).not.toBe(input);
      expect(copied.preparation.transaction).not.toBe(input.preparation.transaction);
      expect(Object.isFrozen(copied.preparation.transaction)).toBe(true);
    }
  } finally {
    normalize.mockRestore();
    digest.mockRestore();
  }
});

test('the capsule, offer and intent consume the same actual core delegates exported to hosts', () => {
  // Isolated module loading installs observers before internal destructuring;
  // every observer delegates to the unchanged real implementation.
  jest.isolateModules(() => {
    const policy = require('../src/data/railgun-private-policy');
    const validate = jest.spyOn(policy, 'validateRailgunPrivateTransaction');
    const intent = require('../src/data/railgun-private-intent');
    const signing = jest.spyOn(intent, 'validateRailgunPrivateSigningIntent');
    const offer = require('../src/data/railgun-private-offer');
    const normalize = jest.spyOn(offer, 'normalizeRailgunPrivateOffer');
    try {
      const isolatedHost = require('../host-data.cjs');
      expect(isolatedHost.validateRailgunPrivateTransaction).toBe(validate);
      expect(isolatedHost.validateRailgunPrivateSigningIntent).toBe(signing);
      expect(isolatedHost.normalizeRailgunPrivateOffer).toBe(normalize);
      expect(
        JSON.stringify(isolatedHost.normalizeRailgunPrivateCapsule(clone(vectors[0].input)))
      ).toBe(vectors[0].canonical);
      for (const observer of [validate, signing, normalize])
        expect(observer).toHaveBeenCalledTimes(1);
    } finally {
      normalize.mockRestore();
      signing.mockRestore();
      validate.mockRestore();
    }
  });
});

test('all four copied core source hashes match the retained provenance fixture', () => {
  expect(Object.keys(provenance.files).sort()).toEqual([...coreFiles].sort());
  expect(provenance.sourceCommit).toBe('c208245fa6edeb8eb79452cf399daca264622f4c');
  for (const file of coreFiles) {
    const actual = createHash('sha256')
      .update(undoOperationFormat(file, readFileSync(path.join(__dirname, '../src/data', file), 'utf8')))
      .digest('hex');
    expect(actual).toBe(provenance.files[file].copy);
    expect(provenance.files[file].original).toMatch(/^[a-f0-9]{64}$/);
  }
  // This checks retained provenance, not a runtime import of Freedom or live source verification.
});


test('all recovery sources, adjacent tests and public fixture match their exact import-only provenance', () => {
  const recovery = require('./fixtures/private-recovery-provenance.json');
  expect(recovery.sourceCommit).toBe('668e97ed19d37ce10f596cf19b1cdbd492a6226b');
  expect(Object.keys(recovery.files)).toHaveLength(13);
  for (const [file, row] of Object.entries(recovery.files)) {
    let bytes = undoRetainedHelpers(readFileSync(path.join(__dirname, '..', file), 'utf8'), file);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.copySha256);
    for (const change of [...row.replacements].reverse()) {
      expect(bytes).toContain(change.to);
      bytes = bytes.split(change.to).join(change.from);
    }
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.originalSha256);
  }
  for (const name of ['destination', 'signature', 'preparation', 'results', 'recovery-data'])
    for (const [key, value] of Object.entries(require('../src/data/railgun-private-' + name)))
      expect(host[key]).toBe(value);
  expect(Object.keys(safe)).toHaveLength(3);
});

function undoOperationFormat(file, text) {
  const change = require('../docs/owners/OPERATION-FORMATS-TRANSITIONS.json').changes
    .find(row => row.file === 'src/data/' + file);
  expect(change).toBeDefined();
  expect(createHash('sha256').update(text).digest('hex')).toBe(change.afterSha256);
  for (const edit of [...change.replacements].reverse()) {
    expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(edit.after);
    text = text.slice(0, edit.start) + edit.before + text.slice(edit.start + edit.after.length);
  }
  expect(createHash('sha256').update(text).digest('hex')).toBe(change.beforeSha256);
  return text;
}
