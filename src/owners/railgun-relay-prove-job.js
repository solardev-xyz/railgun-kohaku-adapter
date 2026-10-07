/** Fixed original-signature local proof utility. No admission is granted by
 * this entrypoint; main must own the authenticated record and viewing loan. */
const assert = require('assert/strict');
const path = require('path');
const { shape } = require("../execution/railgun-relay-quote-data.js");
const { assertRailgunRelaySignal } = require("../execution/railgun-relay-wallet-data.js");
const { normalizeRailgunRelayRecordStreamManifest } = require("../execution/railgun-relay-record-stream.js");
let attempted = false;
exports.run = async (inputText, context) => {
  assert.equal(attempted, false);
  attempted = true;
  assert.ok(typeof inputText === 'string' && Buffer.byteLength(inputText) <= 65536);
  const input = JSON.parse(inputText);
  shape(input, [
    'archive',
    'proverArchive',
    'artifactDirectory',
    'descriptor',
    'checkpoint',
    'walletId',
    'restore',
    'prefixes',
    'recordStream',
  ]);
  assert.equal(input.restore, true);
  for (const key of ['archive', 'proverArchive', 'artifactDirectory'])
    assert.ok(typeof input[key] === 'string' && path.isAbsolute(input[key]));
  for (const key of ['archive', 'proverArchive']) assert.equal(path.extname(input[key]), '.asar');
  assert.match(input.walletId, /^[0-9a-f]{64}$/);
  assert.equal(input.descriptor.walletId, input.walletId);
  normalizeRailgunRelayRecordStreamManifest(input.recordStream);
  assertRailgunRelaySignal(context.signal);
  return require("../execution/railgun-wallet-job.js").withWallet(
    inputText,
    context,
    'relay-prove-local',
    async (restored) => {
      const active = () => assertRailgunRelaySignal(restored.signal);
      active();
      assert.equal(restored.exchangePrivateIntent, undefined);
      assert.equal(typeof restored.readRelayProofRecord, 'function');
      const recordText = await restored.readRelayProofRecord();
      active();
      const proof = await require("./railgun-relay-prover.js").proveRailgunRelayLocal({
        archive: restored.archive,
        proverArchive: input.proverArchive,
        artifactDirectory: input.artifactDirectory,
        wallet: restored.wallet,
        descriptor: restored.descriptor,
        checkpoint: restored.checkpoint,
        scan: restored.scan,
        recordText,
        signal: restored.signal,
      });
      active();
      shape(proof, [
        'recordDigest',
        'draftDigest',
        'historyDigest',
        'expectedHash',
        'transaction',
        'payload',
        'transactionDigest',
        'payloadDigest',
        'locallyVerified',
        'independentlyVerified',
      ]);
      assert.equal(proof.locallyVerified, true);
      assert.equal(proof.independentlyVerified, false);
      return { relayProof: proof };
    }
  );
};
