/** Harness-only worker thread. It computes synthetic chain/service answers
 * with the PINNED engine source tree, independently of the installed package's
 * own projection code, so service acceptance remains a real check. It never
 * receives keys, notes or owner objects; it hashes public values only.
 */
'use strict';
const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const assert = require('assert/strict');
const dist = path.join(workerData.engineModules, '@railgun-community/engine/dist');
const { initPoseidonPromise, poseidon } = require(path.join(dist, 'utils/poseidon.js'));
const txid = require(path.join(dist, 'transaction/railgun-txid.js'));
const { hashBoundParamsV2 } = require(path.join(dist, 'transaction/bound-params.js'));
const { MERKLE_ZERO_VALUE } = require(path.join(dist, 'models/merkletree-types.js'));
const DEPTH = 16;
const hex = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
const zeros = {};
function zeroNodes(kind) {
  if (zeros[kind]) return zeros[kind];
  const first = kind === 'poi' ? 0n : BigInt('0x' + MERKLE_ZERO_VALUE.replace(/^0x/, ''));
  const result = [first];
  for (let level = 0; level < DEPTH; level++)
    result.push(poseidon([result[level], result[level]]));
  zeros[kind] = result;
  return result;
}
function merkle({ kind, leaves, index }) {
  assert.ok(['utxo', 'txid', 'poi'].includes(kind));
  assert.ok(Array.isArray(leaves) && leaves.length <= 65536);
  const z = zeroNodes(kind);
  let level = leaves.map((value) => BigInt(value));
  const elements = [];
  let position = index;
  for (let depth = 0; depth < DEPTH; depth++) {
    if (index !== undefined) {
      const sibling = position ^ 1;
      elements.push(sibling < level.length ? level[sibling] : z[depth]);
      position >>= 1;
    }
    const next = [];
    for (let i = 0; i < level.length; i += 2)
      next.push(poseidon([level[i], i + 1 < level.length ? level[i + 1] : z[depth]]));
    level = next.length ? next : [];
  }
  const root = leaves.length ? level[0] : z[DEPTH];
  return {
    root: hex(root),
    ...(index === undefined ? {} : { elements: elements.map(hex), indices: hex(index) }),
  };
}
const operations = {
  zeroNodes: ({ kind }) => zeroNodes(kind).map(hex),
  poseidon: ({ values }) => hex(poseidon(values.map((value) => BigInt(value)))),
  merkle,
  boundParamsHash: ({ boundParams }) => hex(hashBoundParamsV2(boundParams)),
  railgunTxid: ({ nullifiers, commitments, boundParamsHash }) =>
    hex('0x' + txid.getRailgunTransactionIDHex({ nullifiers, commitments, boundParamsHash }).replace(/^0x/, '')),
  txidLeaf: ({ railgunTxid, utxoTreeIn, globalTreePosition }) =>
    hex(
      '0x' +
        txid
          .getRailgunTxidLeafHash(BigInt(railgunTxid), BigInt(utxoTreeIn), BigInt(globalTreePosition))
          .replace(/^0x/, '')
    ),
  verificationHash: ({ previous, firstNullifier }) =>
    txid.calculateRailgunTransactionVerificationHash(previous ?? undefined, firstNullifier),
};
parentPort.on('message', async ({ id, op, args }) => {
  try {
    await initPoseidonPromise;
    assert.ok(Object.hasOwn(operations, op));
    parentPort.postMessage({ id, value: await operations[op](args) });
  } catch (error) {
    parentPort.postMessage({ id, error: String(error?.message ?? error).slice(0, 300) });
  }
});
