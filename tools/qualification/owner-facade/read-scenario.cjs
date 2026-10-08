/** Repo-only synthetic acceptance recipe. No private owner imports or capabilities. */
"use strict";
const assert = require("assert/strict");
const { createHash } = require("crypto");
const SOURCE_SHA256 =
  "bfa8684f50b2bb838b026f2c4972653bfc4503d9fd15182c6c5b219ce1bc1e41";
const OFFSET = 5944700;
const THROUGH = OFFSET + 30;
const ANCHOR = OFFSET + 100;
const hash = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function publicFixture(bytes) {
  assert.ok(Buffer.isBuffer(bytes));
  assert.equal(
    sha(bytes),
    SOURCE_SHA256,
    "Only the published disposable vector is admitted",
  );
  const source = JSON.parse(bytes);
  assert.equal(source.publicVaultVector, true);
  assert.deepEqual(
    source.logs.map((log) => log.blockNumber),
    [10, 20, 30],
  );
  const logs = source.logs.map((log) => ({
    ...log,
    blockNumber: OFFSET + log.blockNumber,
    blockHash: hash(OFFSET + log.blockNumber + 1000),
  }));
  return { logs, instanceId: source.instanceId, sourceSha256: SOURCE_SHA256 };
}
function ranges() {
  const result = [];
  for (let from = 0; from <= THROUGH; from += 100000)
    result.push(
      Object.freeze({
        to: Math.min(from + 99999, THROUGH),
        anchor: Object.freeze({ number: ANCHOR, hash: hash(ANCHOR + 1000) }),
      }),
    );
  assert.equal(result.length, 60);
  return Object.freeze(result);
}
function createRouter(bytes) {
  const fixture = publicFixture(bytes),
    counts = {};
  let refused = 0;
  return Object.freeze({
    request(method, params) {
      try {
        let result;
        if (method === "eth_chainId") {
          assert.deepEqual(params, []);
          result = "0xaa36a7";
        } else if (method === "eth_getBlockByNumber") {
          assert.equal(params.length, 2);
          assert.equal(params[1], false);
          const n =
            params[0] === "finalized" ? ANCHOR : Number(BigInt(params[0]));
          assert.ok(Number.isSafeInteger(n) && n >= 0 && n <= ANCHOR);
          result = {
            number: "0x" + n.toString(16),
            hash: hash(n + 1000),
            parentHash: n === 0 ? hash(0) : hash(n + 999),
          };
        } else {
          assert.equal(
            method,
            "eth_getLogs",
            "No POI, preflight, proof or submission route",
          );
          assert.equal(params.length, 1);
          const filter = params[0];
          assert.deepEqual(Object.keys(filter).sort(), [
            "address",
            "fromBlock",
            "toBlock",
          ]);
          assert.equal(
            filter.address.toLowerCase(),
            fixture.logs[0].address.toLowerCase(),
          );
          const from = Number(BigInt(filter.fromBlock)),
            to = Number(BigInt(filter.toBlock));
          assert.ok(
            Number.isSafeInteger(from) &&
              Number.isSafeInteger(to) &&
              from >= 0 &&
              to >= from &&
              to <= ANCHOR &&
              to - from < 100000,
          );
          result = fixture.logs
            .filter((log) => log.blockNumber >= from && log.blockNumber <= to)
            .map((log) => ({
              ...log,
              blockNumber: "0x" + log.blockNumber.toString(16),
              transactionIndex: "0x" + log.transactionIndex.toString(16),
              logIndex: "0x" + log.logIndex.toString(16),
              removed: false,
            }));
        }
        counts[method] = (counts[method] || 0) + 1;
        return result;
      } catch (error) {
        refused++;
        throw error;
      }
    },
    assertClean() {
      assert.equal(refused, 0, "Synthetic router observed refused requests");
    },
    counts: () => Object.freeze({ ...counts }),
  });
}
async function runReadScenario(facade, bytes, signal) {
  const fixture = publicFixture(bytes);
  let session, read;
  try {
    session = await facade.createAccount({ accountIndex: 0, signal });
    const descriptor = session.describe();
    assert.deepEqual(descriptor, {
      accountIndex: 0,
      instanceId: fixture.instanceId,
      chainId: 11155111,
      deployment: "sepolia",
    });
    for (const range of ranges()) await session.advancePublic(range);
    read = await session.openRead({ wallet: "new", signal });
    assert.equal(await read.instanceId(), fixture.instanceId);
    const notes = await read.notes(undefined, true),
      unspent = await read.notes(),
      balance = await read.balance();
    assert.equal(notes.length, 3);
    assert.equal(unspent.length, 2);
    assert.deepEqual(
      notes.map((note) => note.amount).sort((a, b) => (a < b ? -1 : 1)),
      [700n, 1000n, 2000n],
    );
    assert.deepEqual(
      unspent.map((note) => note.amount).sort((a, b) => (a < b ? -1 : 1)),
      [700n, 2000n],
    );
    assert.equal(notes.filter((note) => note.spentTxid !== false).length, 1);
    assert.ok(unspent.every((note) => note.spentTxid === false));
    assert.equal(balance.length, 1);
    assert.equal(balance[0].amount, 2700n);
    assert.equal(balance[0].tag, "unverified");
    assert.equal(balance[0].asset.__type, "erc20");
    assert.equal(
      balance[0].asset.contract.toLowerCase(),
      "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
    );
    assert.ok(
      notes.every(
        (note) =>
          note.asset.contract.toLowerCase() ===
          balance[0].asset.contract.toLowerCase(),
      ),
    );
    read.close();
    await read.closed;
    read = null;
    assert.equal(session.close(), session.closed);
    await session.closed;
    session = null;
    return Object.freeze({
      schema: "railgun-installed-owner-read-scenario-v1",
      sourceSha256: SOURCE_SHA256,
      publicRanges: 60,
      received: 3,
      unspent: 2,
      unspentAmount: "2700",
      instanceMatchesPublicVector: true,
      originalLaneAndSessionClosed: true,
      balanceTag: "unverified",
      syntheticChain: true,
      privatePreparationQualified: false,
      proofRecoveryQualified: false,
      liveTransportQualified: false,
      utilityModuleCacheObserved: false,
    });
  } finally {
    // Original closure remains owned even when a read/assertion fails.
    try {
      if (read) {
        read.close();
        await read.closed;
      }
    } finally {
      if (session) {
        session.close();
        await session.closed;
      }
    }
  }
}
module.exports = Object.freeze({
  SOURCE_SHA256,
  publicFixture,
  ranges,
  createRouter,
  runReadScenario,
});
