/** One synthetic Sepolia plus POI list node and TXID indexer for the
 * installed-owner journey family. Only primary facts persist between modes:
 * head/finality, the signed transactions the genuine owners actually sent
 * (with inclusion), and accepted POI outputs. Every derived value (UTXO
 * leaves/roots, spent set, TXID rows/roots, POI list tree and signed events)
 * is recomputed with the PINNED engine source tree in a harness worker,
 * independently of the installed package's own projection code.
 *
 * Anything undeclared is a sticky refusal; only role/method/kind are recorded.
 */
'use strict';
const assert = require('assert/strict');
const crypto = require('crypto');
const { publicFixture } = require('./read-scenario.cjs');
const mapping = require('./WIRE-MAP.json');
const VECTOR = require('./VECTOR.json');

const CHAIN_ID = 11155111;
const CHAIN_HEX = '0xaa36a7';
const SUBMITTER = '0x9858effd232b4033e47d90003d41ec34ecaeda94';
const PROXY = '0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea';
const TOKEN = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';
const ENDPOINT = 'https://synthetic.invalid/installed-owner-private';
// A second endpoint with a public gateway's eth_getLogs span limit: spans above
// 1000 blocks get JSON-RPC error -32602 in an HTTP 200 response.
const LIMITED_ENDPOINT = 'https://synthetic.invalid/installed-owner-private-limited';
const LIMITED_SPAN = 1000;
const POI_URL = 'https://ppoi.fdi.network';
const INDEXER_URL = 'https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql';
const TEST_LIST = '43a72e714401762df66b68c26dfbdf2682aaec9f2474eca4613e424a0fbafd3c';
const TXID_VERSION = 'V2_PoseidonMerkle';
const OFFSET = 5944700;
const ANCHOR = OFFSET + 100;
const HEAD0 = Number(BigInt(mapping.header.number));
const BALANCE = '0x71afd498d0000';
const GAS_PRICE = 1000015n;
const ESTIMATE = 1248446n;
const MAX_FEE_WEI = 2000000000000000n;
const FEE_BASIS_POINTS = 25n;
const SELECTOR = Object.freeze({ rootHistory: '0xc718dbda', nullifiers: '0xf19ea903' });
const GRAPH_QUERY =
  'query RailgunPublicTxids($after: String!) { transactions(orderBy: id_ASC, limit: 100, where: { id_gt: $after }) { id nullifiers commitments transactionHash boundParamsHash blockNumber utxoTreeIn utxoTreeOut utxoBatchStartPositionOut hasUnshield unshieldToken { tokenType tokenSubID tokenAddress } unshieldToAddress unshieldValue blockTimestamp verificationHash } }';
const SHIELD_EVENT =
  'event Shield(uint256 treeNumber,uint256 startPosition,(bytes32 npk,(uint8 tokenType,address tokenAddress,uint256 tokenSubID) token,uint120 value)[] commitments,(bytes32[3] encryptedBundle,bytes32 shieldKey)[] shieldCiphertext,uint256[] fees)';
const EVENTS = Object.freeze([
  SHIELD_EVENT,
  'event Nullified(uint16 treeNumber,bytes32[] nullifier)',
  'event Transact(uint256 treeNumber,uint256 startPosition,bytes32[] hash,(bytes32[4] ciphertext,bytes32 blindedSenderViewingKey,bytes32 blindedReceiverViewingKey,bytes annotationData,bytes memo)[] ciphertext)',
  'event Unshield(address to,(uint8 tokenType,address tokenAddress,uint256 tokenSubID) token,uint256 amount,uint256 fee)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
// Public test list key (seed 0x0a..0a), reproducing the reviewed vector event.
const LIST_KEY = crypto.createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, 10)]),
  format: 'der',
  type: 'pkcs8',
});
const q = (value) => '0x' + BigInt(value).toString(16);
const word = (value) => '0x' + BigInt(value).toString(16).padStart(64, '0');
const bare = (value) => value.replace(/^0x/, '').toLowerCase();
const blockHash = (n) => word(n + 1000);
const copy = (value) => JSON.parse(JSON.stringify(value));
function initialState() {
  return {
    schema: 'railgun-journey-synthetic-chain-v2',
    head: HEAD0,
    finalized: ANCHOR,
    transactions: [],
    poi: { accepted: [] },
  };
}
// v1 states (M1 runs) carried derived fields; keep only their primary facts.
function primary(state) {
  if (!state) return initialState();
  assert.ok(['railgun-journey-synthetic-chain-v1', 'railgun-journey-synthetic-chain-v2'].includes(state.schema));
  return {
    schema: 'railgun-journey-synthetic-chain-v2',
    head: state.head,
    finalized: state.finalized,
    transactions: copy(state.transactions),
    poi: { accepted: copy(state.poi?.accepted ?? []) },
  };
}
function createJourneyChain({
  ethers,
  transactAbi,
  sourceBytes,
  state,
  sendMode = 'acknowledge',
  crypto: worker,
  faults = {},
  autoMine = null,
}) {
  // Dry runs of polling callers: pending sends are mined once they are this old.
  assert.ok(autoMine === null || (Number.isSafeInteger(autoMine.afterMs) && autoMine.afterMs >= 0));
  assert.ok(['acknowledge', 'unknown-after-delivery'].includes(sendMode));
  assert.deepEqual(
    Object.keys(faults).filter((key) => !['preflightAnchorAfterEstimate', 'failLogsFrom', 'failApplyRefreshTo'].includes(key)),
    []
  );
  // Scan faults for resume qualification, each once per process:
  // - failLogsFrom: a window's eth_getLogs fails, before acquisition completes;
  // - failApplyRefreshTo: after a window's logs were served, acquisition reads
  //   its end header once more; the next read is the coordinator's refresh
  //   inside apply, after its journal entry is prepared and the window applied.
  //   That read fails, leaving a pending application for recovery.
  const scanFaults = { logsFired: false, refreshFired: false, servedTo: new Set(), endReads: 0 };
  const servedLogs = [];
  const rpcError = () => Object.assign(Error('Synthetic scan fault'), { code: 'SYNTHETIC_RPC_ERROR', rpcError: { code: -32000, message: 'synthetic' } });
  assert.ok(worker && typeof worker.call === 'function');
  const fixture = publicFixture(sourceBytes);
  assert.ok(fixture.logs.every((log) => log.address.toLowerCase() === PROXY));
  state = primary(state);
  const abi = new ethers.Interface([transactAbi, ...EVENTS]);
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const counts = {},
    refusals = [];
  const fixed = new Map();
  for (const row of mapping.entries) {
    if (row.method.startsWith('ppoi_')) continue;
    const [target] = row.params;
    const key =
      row.method === 'eth_call'
        ? 'eth_call:' + target.to.toLowerCase() + ':' + target.data.toLowerCase()
        : row.method === 'eth_getStorageAt'
          ? 'eth_getStorageAt:' + target.toLowerCase() + ':' + row.params[1].toLowerCase()
          : row.method + ':' + target.toLowerCase();
    fixed.set(key, row.result);
  }
  const vectorEvent = mapping.entries.find((row) => row.method === 'ppoi_poi_events').result[0];
  let unknownSends = 0,
    derived = null,
    estimated = false,
    injected = 0;
  // Like r5: a 'latest' read stamps the head with wall time; rereads by number
  // see the same timestamp until the next 'latest' read.
  let clock = { base: Math.floor(Date.now() / 1000), head: state.head };

  const decodeTransact = (data) => {
    const [transactions] = abi.decodeFunctionData('transact', data);
    assert.equal(transactions.length, 1);
    return transactions[0];
  };
  const plainBound = (b) => ({
    treeNumber: b.treeNumber,
    minGasPrice: b.minGasPrice,
    unshield: b.unshield,
    chainID: b.chainID,
    adaptContract: b.adaptContract,
    adaptParams: b.adaptParams,
    commitmentCiphertext: b.commitmentCiphertext.map((c) => ({
      ciphertext: [...c.ciphertext],
      blindedSenderViewingKey: c.blindedSenderViewingKey,
      blindedReceiverViewingKey: c.blindedReceiverViewingKey,
      annotationData: c.annotationData,
      memo: c.memo,
    })),
  });
  const insertedOf = (inner) =>
    BigInt(inner.unshieldPreimage.value) > 0n ? inner.commitments.slice(0, -1) : [...inner.commitments];

  // Rebuild every derived value from primary facts, in chain order.
  async function rebuild() {
    const leaves = [],
      roots = [],
      spent = [];
    for (const log of fixture.logs) {
      const event = abi.parseLog(log);
      if (event.name === 'Shield')
        for (const p of event.args.commitments)
          leaves.push(
            await worker.call('poseidon', { values: [p.npk, p.token.tokenAddress, p.value.toString()] })
          );
      else if (event.name === 'Transact') for (const h of event.args.hash) leaves.push(h.toLowerCase());
      else assert.equal(event.name, 'Nullified');
    }
    const fixtureRoot = (await worker.call('merkle', { kind: 'utxo', leaves })).root;
    assert.equal(fixtureRoot, VECTOR.inputTreeRoot, 'Fixture UTXO root mismatch');
    roots.push(fixtureRoot);
    const rows = [],
      txidLeaves = [],
      txidRoots = [];
    let verification = null;
    const mined = state.transactions
      .filter((tx) => tx.blockNumber !== null && tx.status === '0x1')
      .sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex);
    for (const tx of mined) {
      const inner = decodeTransact(tx.input);
      const inserted = insertedOf(inner);
      const start = leaves.length;
      for (const c of inserted) leaves.push(c.toLowerCase());
      if (inserted.length) roots.push((await worker.call('merkle', { kind: 'utxo', leaves })).root);
      for (const n of inner.nullifiers)
        spent.push({ tree: Number(inner.boundParams.treeNumber), nullifier: n.toLowerCase(), blockNumber: tx.blockNumber });
      const value = BigInt(inner.unshieldPreimage.value);
      const unshieldOnly = inserted.length === 0;
      const boundParamsHash = await worker.call('boundParamsHash', { boundParams: plainBound(inner.boundParams) });
      verification = await worker.call('verificationHash', { previous: verification, firstNullifier: inner.nullifiers[0] });
      const row = {
        graphID: '0x' + bare(word(tx.blockNumber)) + bare(word(tx.transactionIndex)) + bare(word(0)),
        nullifiers: inner.nullifiers.map((n) => n.toLowerCase()),
        commitments: inner.commitments.map((c) => c.toLowerCase()),
        transactionHash: tx.hash,
        boundParamsHash,
        blockNumber: tx.blockNumber,
        utxoTreeIn: Number(inner.boundParams.treeNumber),
        utxoTreeOut: unshieldOnly ? 99999 : 0,
        utxoBatchStartPositionOut: unshieldOnly ? 99999 : start,
        unshield:
          value > 0n
            ? {
                tokenAddress: inner.unshieldPreimage.token.tokenAddress.toLowerCase(),
                toAddress: '0x' + inner.unshieldPreimage.npk.slice(-40).toLowerCase(),
                value: value.toString(),
              }
            : null,
        timestamp: 1700000000 + tx.blockNumber * 12,
        verificationHash: verification,
      };
      const railgunTxid = await worker.call('railgunTxid', {
        nullifiers: row.nullifiers,
        commitments: row.commitments,
        boundParamsHash,
      });
      const globalTreePosition = BigInt(row.utxoTreeOut) * 65536n + BigInt(row.utxoBatchStartPositionOut);
      txidLeaves.push(
        await worker.call('txidLeaf', { railgunTxid, utxoTreeIn: row.utxoTreeIn, globalTreePosition: globalTreePosition.toString() })
      );
      txidRoots.push(bare((await worker.call('merkle', { kind: 'txid', leaves: txidLeaves })).root));
      rows.push({ ...row, railgunTxid });
    }
    // POI list: the reviewed Shield vector at index 0, then accepted outputs.
    const poiLeaves = [VECTOR.blindedCommitment.toLowerCase(), ...state.poi.accepted.map((row) => row.blindedCommitment)];
    const poiTypes = ['Shield', ...state.poi.accepted.map(() => 'Transact')];
    const poiRoots = [];
    for (let count = 1; count <= poiLeaves.length; count++)
      poiRoots.push(bare((await worker.call('merkle', { kind: 'poi', leaves: poiLeaves.slice(0, count) })).root));
    assert.equal(poiRoots[0], vectorEvent.validatedMerkleroot, 'Vector POI root mismatch');
    const events = poiLeaves.map((blindedCommitment, index) => {
      const signedPOIEvent = { index, blindedCommitment, type: poiTypes[index] };
      const message = Buffer.from(JSON.stringify(signedPOIEvent), 'utf8');
      const signature = crypto.sign(null, message, LIST_KEY).toString('hex');
      return { signedPOIEvent: { ...signedPOIEvent, signature }, validatedMerkleroot: poiRoots[index] };
    });
    assert.equal(events[0].signedPOIEvent.signature, vectorEvent.signedPOIEvent.signature);
    derived = { leaves, roots, spent, rows, txidRoots, poiLeaves, poiRoots, events };
  }
  const ready = () => assert.ok(derived, 'Synthetic chain not initialized');

  const header = (n) => ({
    number: q(n),
    hash: blockHash(n),
    parentHash: n === 0 ? word(0) : blockHash(n - 1),
    timestamp: q(clock.base - (clock.head - n) * 12),
    transactions: state.transactions.filter((tx) => tx.blockNumber === n).map((tx) => tx.hash),
  });
  function blockNumberOf(tag) {
    if (tag === 'latest' || tag === 'pending') return state.head;
    if (tag === 'finalized') return state.finalized;
    assert.ok(typeof tag === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(tag));
    const n = Number(BigInt(tag));
    assert.ok(Number.isSafeInteger(n) && n >= 0 && n <= state.head, 'Block beyond synthetic head');
    return n;
  }
  function blockAt(params) {
    assert.equal(params.length, 2);
    assert.equal(params[1], false);
    if (params[0] === 'latest') clock = { base: Math.floor(Date.now() / 1000), head: state.head };
    return header(blockNumberOf(params[0]));
  }
  function canonicalBlock(selector) {
    assert.deepEqual(Object.keys(selector).sort(), ['blockHash', 'requireCanonical']);
    assert.equal(selector.requireCanonical, true);
    const n = Number(BigInt(selector.blockHash)) - 1000;
    assert.ok(Number.isSafeInteger(n) && n >= 0 && n <= state.head);
    assert.equal(blockHash(n), selector.blockHash.toLowerCase());
    return n;
  }
  const minedThrough = (through) =>
    state.transactions.filter((tx) => tx.blockNumber !== null && tx.blockNumber <= through);
  function nonceAt(params) {
    assert.equal(params.length, 2);
    assert.equal(params[0].toLowerCase(), SUBMITTER);
    if (params[1] === 'pending') return q(state.transactions.length);
    return q(minedThrough(blockNumberOf(params[1])).length);
  }
  const spentAt = (tree, nullifier, through) =>
    derived.spent.some(
      (row) => row.tree === Number(tree) && row.nullifier === nullifier.toLowerCase() && row.blockNumber <= through
    );
  // A narrow semantic simulation: the right contract, a known root and
  // unspent nullifiers. It is not EVM execution or proof verification.
  function simulate(tx, through = state.head) {
    ready();
    assert.deepEqual(
      Object.keys(tx).filter((key) => !['from', 'to', 'value', 'data', 'gas'].includes(key)),
      []
    );
    assert.equal(tx.from.toLowerCase(), SUBMITTER);
    assert.equal(tx.to.toLowerCase(), PROXY);
    assert.ok(tx.value === undefined || BigInt(tx.value) === 0n);
    const inner = decodeTransact(tx.data);
    assert.ok(derived.roots.includes(inner.merkleRoot.toLowerCase()), 'Unknown merkle root');
    for (const nullifier of inner.nullifiers)
      assert.equal(spentAt(inner.boundParams.treeNumber, nullifier, through), false, 'Spent nullifier');
    return inner;
  }
  function send(raw) {
    const tx = ethers.Transaction.from(raw);
    assert.equal(tx.isSigned(), true);
    assert.equal(tx.chainId, BigInt(CHAIN_ID));
    assert.equal(tx.from.toLowerCase(), SUBMITTER);
    assert.equal(tx.to.toLowerCase(), PROXY);
    assert.equal(tx.value, 0n);
    assert.equal(tx.nonce, state.transactions.length);
    assert.equal(tx.type, 0);
    assert.ok(tx.gasPrice > 0n && tx.gasLimit > 0n && tx.gasLimit <= 3000000n);
    assert.ok(tx.gasPrice * tx.gasLimit <= MAX_FEE_WEI, 'Fee exposure above cap');
    const hash = tx.hash.toLowerCase();
    assert.equal(state.transactions.some((row) => row.hash === hash), false);
    simulate({ from: tx.from, to: tx.to, value: q(tx.value), data: tx.data });
    state.transactions.push({
      hash,
      nonce: tx.nonce,
      input: tx.data.toLowerCase(),
      gas: tx.gasLimit.toString(),
      gasPrice: tx.gasPrice.toString(),
      blockNumber: null,
      transactionIndex: null,
      status: null,
      logs: [],
      delivery: sendMode,
      sentAt: Date.now(),
    });
    if (sendMode === 'unknown-after-delivery' && unknownSends++ === 0)
      throw Object.assign(Error('Synthetic delivery outcome withheld'), { code: 'SYNTHETIC_DELIVERY_UNOBSERVED' });
    return hash;
  }
  function transactionObject(tx) {
    return {
      hash: tx.hash,
      from: SUBMITTER,
      to: PROXY,
      chainId: CHAIN_HEX,
      nonce: q(tx.nonce),
      value: '0x0',
      input: tx.input,
      gas: q(tx.gas),
      gasPrice: q(tx.gasPrice),
      type: '0x0',
      blockNumber: tx.blockNumber === null ? null : q(tx.blockNumber),
      blockHash: tx.blockNumber === null ? null : blockHash(tx.blockNumber),
      transactionIndex: tx.transactionIndex === null ? null : q(tx.transactionIndex),
    };
  }
  function receiptObject(tx) {
    return {
      status: tx.status,
      gasUsed: q(ESTIMATE),
      effectiveGasPrice: q(tx.gasPrice),
      cumulativeGasUsed: q(ESTIMATE),
      transactionHash: tx.hash,
      from: SUBMITTER,
      to: PROXY,
      contractAddress: null,
      type: '0x0',
      blockNumber: q(tx.blockNumber),
      blockHash: blockHash(tx.blockNumber),
      transactionIndex: q(tx.transactionIndex),
      logsBloom: '0x' + '0'.repeat(512),
      logs: tx.logs.map((log) => ({ ...log, removed: false })),
    };
  }
  const find = (hash) => {
    assert.ok(typeof hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(hash));
    return state.transactions.find((tx) => tx.hash === hash.toLowerCase()) || null;
  };
  // Logs exactly as the Railgun contract emits them for this calldata; the
  // unshield commitment is never inserted into the UTXO tree.
  function eventsFor(inner, startPosition) {
    const value = BigInt(inner.unshieldPreimage.value);
    const inserted = insertedOf(inner);
    assert.equal(inner.boundParams.commitmentCiphertext.length, inserted.length);
    const events = [[PROXY, 'Nullified', [inner.boundParams.treeNumber, inner.nullifiers]]];
    if (value > 0n) {
      const recipient = '0x' + inner.unshieldPreimage.npk.slice(-40).toLowerCase();
      assert.equal(inner.unshieldPreimage.token.tokenAddress.toLowerCase(), TOKEN);
      const fee = (value * FEE_BASIS_POINTS) / 10000n,
        net = value - fee;
      events.push([TOKEN, 'Transfer', [PROXY, recipient, net]]);
      events.push([TOKEN, 'Transfer', [PROXY, '0x' + '0'.repeat(39) + '1', fee]]);
      events.push([PROXY, 'Unshield', [recipient, [0, TOKEN, 0], net, fee]]);
    }
    if (inserted.length)
      events.push([PROXY, 'Transact', [0, startPosition, inserted, inner.boundParams.commitmentCiphertext]]);
    return events;
  }
  async function mine({ confirmations = 20, finalizedDepth = 5 } = {}) {
    ready();
    const pending = state.transactions.filter((tx) => tx.blockNumber === null);
    const block = state.head + 1;
    let position = derived.leaves.length;
    pending.forEach((tx, index) => {
      const inner = decodeTransact(tx.input);
      let status = '0x1';
      try {
        simulate({ from: SUBMITTER, to: PROXY, value: '0x0', data: tx.input }, block - 1);
      } catch {
        status = '0x0';
      }
      tx.blockNumber = block;
      tx.transactionIndex = index;
      tx.status = status;
      if (status !== '0x1') return;
      tx.logs = eventsFor(inner, position).map(([address, name, values], logIndex) => ({
        ...abi.encodeEventLog(name, values),
        address,
        transactionHash: tx.hash,
        blockNumber: q(block),
        blockHash: blockHash(block),
        transactionIndex: q(index),
        logIndex: q(logIndex),
      }));
      position += insertedOf(inner).length;
    });
    state.head = block + confirmations - 1;
    state.finalized = state.head - finalizedDepth;
    assert.ok(state.finalized >= block);
    clock = { base: Math.floor(Date.now() / 1000), head: state.head };
    await rebuild();
    return Object.freeze({ block, included: pending.map((tx) => tx.hash) });
  }
  function proxyLogs(from, to) {
    const rows = fixture.logs
      .filter((log) => log.blockNumber >= from && log.blockNumber <= to)
      .map((log) => ({
        ...log,
        blockNumber: q(log.blockNumber),
        transactionIndex: q(log.transactionIndex),
        logIndex: q(log.logIndex),
        removed: false,
      }));
    for (const tx of minedThrough(state.head))
      if (tx.blockNumber >= from && tx.blockNumber <= to)
        for (const log of tx.logs) if (log.address === PROXY) rows.push({ ...log, removed: false });
    return rows;
  }
  function contractCall(target, selector) {
    const at = canonicalBlock(selector);
    assert.deepEqual(Object.keys(target).sort(), ['data', 'to']);
    const to = target.to.toLowerCase(),
      data = target.data.toLowerCase();
    if (to === PROXY && data.startsWith(SELECTOR.rootHistory)) {
      const [tree, root] = coder.decode(['uint256', 'bytes32'], '0x' + data.slice(10));
      assert.equal(tree, 0n);
      return word(derived.roots.includes(root.toLowerCase()) ? 1 : 0);
    }
    if (to === PROXY && data.startsWith(SELECTOR.nullifiers)) {
      const [tree, nullifier] = coder.decode(['uint256', 'bytes32'], '0x' + data.slice(10));
      return word(spentAt(tree, nullifier, at) ? 1 : 0);
    }
    const key = 'eth_call:' + to + ':' + data;
    assert.ok(fixed.has(key), 'Undeclared synthetic contract call');
    return fixed.get(key);
  }
  function receipts(method, params) {
    assert.equal(params.length, 1);
    const tx = find(params[0]);
    if (method === 'eth_getTransactionByHash') return tx ? transactionObject(tx) : null;
    return tx && tx.blockNumber !== null ? receiptObject(tx) : null;
  }
  function transactionRpc(method, params) {
    switch (method) {
      case 'eth_chainId':
        assert.deepEqual(params, []);
        return CHAIN_HEX;
      case 'eth_getCode':
      case 'eth_getBalance':
        assert.deepEqual(params, [SUBMITTER, 'pending']);
        return method === 'eth_getCode' ? '0x' : BALANCE;
      case 'eth_gasPrice':
        assert.deepEqual(params, []);
        return q(GAS_PRICE);
      case 'eth_blockNumber':
        assert.deepEqual(params, []);
        return q(state.head);
      case 'eth_getBlockByNumber':
        return blockAt(params);
      case 'eth_getTransactionCount':
        return nonceAt(params);
      case 'eth_estimateGas':
        assert.equal(params.length, 1);
        simulate(params[0]);
        estimated = true;
        return q(ESTIMATE);
      case 'eth_call':
        assert.equal(params.length, 2);
        assert.equal(params[1], 'latest');
        simulate(params[0]);
        return '0x';
      case 'eth_sendRawTransaction':
        assert.equal(params.length, 1);
        return send(params[0]);
      case 'eth_getTransactionReceipt':
      case 'eth_getTransactionByHash':
        return receipts(method, params);
      default:
        throw Error('Undeclared transaction-rpc method');
    }
  }
  function protocolRpc(method, params, url) {
    if (url === LIMITED_ENDPOINT && method === 'eth_getLogs') {
      const span = Number(BigInt(params[0].toBlock)) - Number(BigInt(params[0].fromBlock)) + 1;
      if (span > LIMITED_SPAN)
        throw Object.assign(Error('Synthetic span limit'), { code: 'SYNTHETIC_RPC_ERROR', rpcError: { code: -32602, message: 'invalid params' } });
    }
    switch (method) {
      case 'eth_chainId':
        assert.deepEqual(params, []);
        return CHAIN_HEX;
      case 'eth_blockNumber':
        assert.deepEqual(params, []);
        return q(state.head);
      case 'eth_getBlockByNumber':
        // Deliberate fault reproducing the live L-A 3b refusal: the submission
        // preflight's deployment anchor read fails after the post-proof estimate.
        if (faults.preflightAnchorAfterEstimate && estimated && params[0] === 'latest') {
          injected++;
          throw Object.assign(Error('Synthetic Tor request failure'), { code: 'SYNTHETIC_INJECTED_FAULT' });
        }
        if (
          Number.isSafeInteger(faults.failApplyRefreshTo) &&
          !scanFaults.refreshFired &&
          scanFaults.servedTo.has(faults.failApplyRefreshTo) &&
          params[0] === '0x' + faults.failApplyRefreshTo.toString(16) &&
          ++scanFaults.endReads === 2
        ) {
          scanFaults.refreshFired = true;
          injected++;
          throw rpcError();
        }
        return blockAt(params);
      case 'eth_getLogs': {
        if (Number.isSafeInteger(faults.failLogsFrom) && !scanFaults.logsFired && Number(BigInt(params[0].fromBlock)) === faults.failLogsFrom) {
          scanFaults.logsFired = true;
          injected++;
          throw rpcError();
        }
        if (params[0] && typeof params[0].toBlock === 'string') scanFaults.servedTo.add(Number(BigInt(params[0].toBlock)));
        assert.equal(params.length, 1);
        const filter = params[0];
        assert.deepEqual(Object.keys(filter).sort(), ['address', 'fromBlock', 'toBlock']);
        assert.equal(filter.address.toLowerCase(), PROXY);
        const from = Number(BigInt(filter.fromBlock)),
          to = Number(BigInt(filter.toBlock));
        assert.ok(from >= 0 && to >= from && to <= state.head && to - from < 100000);
        // The windows actually served, for no-gap evidence (bounded).
        servedLogs.push([from, to]);
        if (servedLogs.length > 64) servedLogs.shift();
        return proxyLogs(from, to);
      }
      case 'eth_getCode': {
        assert.equal(params.length, 2);
        canonicalBlock(params[1]);
        const key = 'eth_getCode:' + params[0].toLowerCase();
        assert.ok(fixed.has(key), 'Undeclared synthetic code read');
        return fixed.get(key);
      }
      case 'eth_getStorageAt': {
        assert.equal(params.length, 3);
        canonicalBlock(params[2]);
        const key = 'eth_getStorageAt:' + params[0].toLowerCase() + ':' + params[1].toLowerCase();
        assert.ok(fixed.has(key), 'Undeclared synthetic storage read');
        return fixed.get(key);
      }
      case 'eth_call':
        assert.equal(params.length, 2);
        return contractCall(params[0], params[1]);
      case 'eth_getTransactionReceipt':
      case 'eth_getTransactionByHash':
        return receipts(method, params);
      default:
        throw Error('Undeclared protocol-rpc method');
    }
  }
  const base = (params) => {
    assert.equal(params.chainType, '0');
    assert.equal(params.chainID, '11155111');
    assert.equal(params.txidVersion, TXID_VERSION);
  };
  async function poi(method, params) {
    ready();
    base(params);
    switch (method) {
      case 'ppoi_pois_per_list': {
        assert.deepEqual(Object.keys(params).sort(), ['blindedCommitmentDatas', 'chainID', 'chainType', 'listKeys', 'txidVersion']);
        assert.deepEqual(params.listKeys, [TEST_LIST]);
        const result = {};
        for (const { blindedCommitment, type } of params.blindedCommitmentDatas) {
          const index = derived.poiLeaves.indexOf(blindedCommitment.toLowerCase());
          result[blindedCommitment] = {
            [TEST_LIST]: index >= 0 && derived.events[index].signedPOIEvent.type === type ? 'Valid' : 'Missing',
          };
        }
        return result;
      }
      case 'ppoi_merkle_proofs': {
        assert.equal(params.listKey, TEST_LIST);
        const proofs = [];
        for (const blindedCommitment of params.blindedCommitments) {
          const index = derived.poiLeaves.indexOf(blindedCommitment.toLowerCase());
          assert.ok(index >= 0, 'Unknown POI leaf');
          const path = await worker.call('merkle', { kind: 'poi', leaves: derived.poiLeaves, index });
          proofs.push({
            leaf: bare(blindedCommitment),
            elements: path.elements.map(bare),
            indices: bare(path.indices),
            root: bare(path.root),
          });
        }
        return proofs;
      }
      case 'ppoi_poi_events': {
        assert.equal(params.listKey, TEST_LIST);
        assert.ok(params.startIndex >= 0 && params.endIndex >= params.startIndex && params.endIndex < derived.events.length);
        return derived.events.slice(params.startIndex, params.endIndex + 1);
      }
      case 'ppoi_validate_poi_merkleroots':
        assert.equal(params.listKey, TEST_LIST);
        return params.poiMerkleroots.every((root) => derived.poiRoots.includes(bare(root)));
      case 'ppoi_validated_txid':
        assert.deepEqual(Object.keys(params).sort(), ['chainID', 'chainType', 'txidVersion']);
        assert.ok(derived.rows.length > 0, 'No validated TXID');
        return {
          validatedTxidIndex: derived.rows.length - 1,
          validatedTxidMerkleroot: derived.txidRoots.at(-1),
        };
      case 'ppoi_validate_txid_merkleroot':
        assert.equal(params.tree, 0);
        return derived.txidRoots[params.index] === bare(params.merkleroot);
      case 'ppoi_submit_transact_proof': {
        assert.equal(params.listKey, TEST_LIST);
        const data = params.transactProofData;
        assert.deepEqual(Object.keys(data).sort(), [
          'blindedCommitmentsOut',
          'poiMerkleroots',
          'railgunTxidIfHasUnshield',
          'snarkProof',
          'txidMerkleroot',
          'txidMerklerootIndex',
        ]);
        assert.ok(data.poiMerkleroots.every((root) => derived.poiRoots.includes(bare(root))), 'Unknown POI root');
        assert.equal(derived.txidRoots[data.txidMerklerootIndex], bare(data.txidMerkleroot), 'Unknown TXID root');
        // Structural acceptance only: this synthetic node does not verify the
        // POI snark. The reported scope records that limitation.
        assert.ok(data.snarkProof && data.snarkProof.pi_a && data.snarkProof.pi_b && data.snarkProof.pi_c);
        for (const blindedCommitment of data.blindedCommitmentsOut) {
          const value = blindedCommitment.toLowerCase();
          if (BigInt(value) === 0n || derived.poiLeaves.includes(value)) continue;
          state.poi.accepted.push({ blindedCommitment: value });
        }
        await rebuild();
        return null;
      }
      default:
        throw Error('Undeclared POI method');
    }
  }
  function graph(row) {
    return {
      id: row.graphID,
      nullifiers: row.nullifiers,
      commitments: row.commitments,
      transactionHash: row.transactionHash,
      boundParamsHash: row.boundParamsHash,
      blockNumber: String(row.blockNumber),
      utxoTreeIn: String(row.utxoTreeIn),
      utxoTreeOut: String(row.utxoTreeOut),
      utxoBatchStartPositionOut: String(row.utxoBatchStartPositionOut),
      hasUnshield: !!row.unshield,
      unshieldToken: {
        tokenType: 'ERC20',
        tokenSubID: word(0),
        tokenAddress: row.unshield?.tokenAddress ?? '0x' + '0'.repeat(40),
      },
      unshieldToAddress: row.unshield?.toAddress ?? '0x' + '0'.repeat(40),
      unshieldValue: row.unshield?.value ?? '0',
      blockTimestamp: String(row.timestamp),
      verificationHash: row.verificationHash,
    };
  }
  function indexer(body) {
    ready();
    assert.deepEqual(Object.keys(body).sort(), ['query', 'variables']);
    assert.equal(body.query, GRAPH_QUERY);
    const after = body.variables.after;
    assert.ok(after === '0x00' || /^0x[0-9a-f]{192}$/.test(after));
    return {
      data: {
        transactions: derived.rows
          .filter((row) => after === '0x00' || row.graphID > after)
          .slice(0, 100)
          .map(graph),
      },
    };
  }
  function classify(subject, url) {
    assert.equal(subject.chainId, CHAIN_ID);
    if (url === INDEXER_URL) {
      assert.equal(subject.kind, 'service');
      assert.equal(subject.role, 'indexer');
      return 'indexer';
    }
    if (url === POI_URL) {
      assert.equal(subject.role, 'poi');
      assert.ok(['service', 'private-account'].includes(subject.kind));
      return 'poi';
    }
    assert.ok([ENDPOINT, LIMITED_ENDPOINT].includes(url));
    if (subject.role === 'transaction-rpc') {
      assert.equal(subject.kind, 'public-address');
      assert.equal(subject.principal, SUBMITTER);
      return 'transaction-rpc';
    }
    assert.equal(subject.kind, 'private-account');
    assert.equal(subject.principal, 'railgun:0');
    return 'protocol-rpc';
  }
  // The transport hands JSON-RPC (method/params) or, for the indexer, the
  // GraphQL body. Records carry lane, subject role/kind and method only.
  async function request(subject, url, wire) {
    let lane = 'unclassified',
      method = null;
    if (
      autoMine &&
      derived &&
      state.transactions.some((tx) => tx.blockNumber === null && Date.now() - (tx.sentAt ?? 0) >= autoMine.afterMs)
    )
      await mine();
    try {
      lane = classify(subject, url);
      let result;
      if (lane === 'indexer') {
        method = 'RailgunPublicTxids';
        result = indexer(wire);
      } else {
        assert.deepEqual(Object.keys(wire).sort(), ['id', 'jsonrpc', 'method', 'params']);
        assert.equal(wire.jsonrpc, '2.0');
        method = wire.method;
        assert.equal(typeof method, 'string');
        if (lane === 'transaction-rpc') result = transactionRpc(method, wire.params);
        else if (lane === 'protocol-rpc') result = protocolRpc(method, wire.params, url);
        else result = await poi(method, wire.params);
      }
      const role = subject.role === lane ? '' : '(' + subject.role + ')';
      const key = lane + role + ':' + method;
      counts[key] = (counts[key] || 0) + 1;
      return copy(result);
    } catch (error) {
      if (!['SYNTHETIC_DELIVERY_UNOBSERVED', 'SYNTHETIC_INJECTED_FAULT', 'SYNTHETIC_RPC_ERROR'].includes(error?.code))
        refusals.push({
          lane,
          subjectKind: typeof subject?.kind === 'string' ? subject.kind : null,
          subjectRole: typeof subject?.role === 'string' ? subject.role : null,
          method: typeof method === 'string' ? method : typeof wire?.method === 'string' ? wire.method : null,
          reason: String(error?.message ?? '').slice(0, 80),
        });
      throw error;
    }
  }
  return Object.freeze({
    init: rebuild,
    request,
    mine,
    state: () => copy(state),
    derived: () => ({
      leaves: derived.leaves.length,
      roots: derived.roots.length,
      txidRows: derived.rows.length,
      poiLeaves: derived.poiLeaves.length,
    }),
    report: () => ({ counts: { ...counts }, refusals: copy(refusals), unknownSends, injectedFaults: injected, servedLogs: copy(servedLogs) }),
    assertClean() {
      assert.deepEqual(refusals, [], 'Synthetic chain observed refused requests');
    },
  });
}
module.exports = Object.freeze({
  LIMITED_ENDPOINT,
  SUBMITTER,
  PROXY,
  TOKEN,
  ENDPOINT,
  POI_URL,
  INDEXER_URL,
  ANCHOR,
  HEAD0,
  createJourneyChain,
  initialState,
});
