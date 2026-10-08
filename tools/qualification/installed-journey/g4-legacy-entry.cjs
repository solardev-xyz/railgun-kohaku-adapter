/** G4: the LEGACY Freedom 843c0cfc normal private transfer, end to end on the
 * shared synthetic chain, refused at the submission preflight exactly where the
 * live L-A 3b hold was: proved, held, not sent, not journaled. Genuine legacy
 * identity/enrollment/public/wallet/prove/submission owners run unchanged; only
 * the registry, Tor endpoint, availability and lower transport leaves (and the
 * recorded synthetic list literal) differ.
 */
'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { createRequire } = require('module');
const { file, sha } = require('./inventory.cjs');
const { publicFixture, ranges } = require('./read-scenario.cjs');
const { createJourneyChain, ENDPOINT, TOKEN } = require('./journey-chain.cjs');
const { createJourneyCrypto } = require('./journey-crypto.cjs');
const { inventoryProfile } = require('./profile-inventory.cjs');
const PASSWORD = 'public-fixture-password-not-a-user-credential';
const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const CHAIN_ID = 11155111;
const FEE_CAP_WEI = 2000000000000000n;
function write(name, value) {
  fs.writeFileSync(name, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
async function main() {
  assert.equal(process.type, 'browser');
  assert.equal(process.env.FREEDOM_RAILGUN_LEGACY_JOURNEY, '1');
  const [filename, expectedSha] = process.argv.slice(2);
  const bytes = fs.readFileSync(filename);
  assert.equal(sha(bytes), expectedSha);
  const request = JSON.parse(bytes);
  assert.equal(request.schema, 'railgun-journey-legacy-request-v1');
  for (const [name, expected] of Object.entries(request.recipeFiles)) assert.deepEqual(file(name), expected);
  for (const [name, expected] of Object.entries(request.enginePins))
    assert.deepEqual(file(path.join(request.engineModules, name)), expected);
  const root = request.legacyRoot;
  const hostRequire = createRequire(path.join(root, 'package.json'));
  const fixed = (name) => hostRequire('./src/main/' + name);
  const { app } = hostRequire('electron');
  const milestones = [];
  const milestone = (value) => milestones.push(value);
  let chain, worker, lock, locks, manager, ownersClosed = false;
  const clients = new Set(),
    overrides = [],
    endpointLife = new AbortController();
  const replace = (object, key, value) => {
    overrides.push([object, key, object[key], value]);
    object[key] = value;
  };
  let report;
  try {
    const sourceBytes = fs.readFileSync(request.publicSource);
    assert.equal(sha(sourceBytes), request.publicSourceSha256);
    const fixture = publicFixture(sourceBytes);
    fs.mkdirSync(request.outputDirectory, { mode: 0o700 });
    assert.equal(fs.existsSync(request.profileDirectory), false);
    const profile = fixed('profile-resolver.js').initializeProfile(app, {
      env: { FREEDOM_TEST_USER_DATA: request.profileDirectory },
    });
    locks = fixed('profile-lock.js');
    lock = locks.acquireProfileLock(profile, { onCompromised: () => app.exit(1) });
    worker = createJourneyCrypto({ engineModules: request.engineModules });
    chain = createJourneyChain({
      ethers: hostRequire('ethers'),
      transactAbi: require(path.join(root, 'src/main/wallet/railgun-private-policy.js')).TRANSACT_ABI,
      sourceBytes,
      crypto: worker,
      faults: { preflightAnchorAfterEstimate: true },
    });
    await chain.init();
    const registry = fixed('networks/network-registry.js'),
      transport = fixed('networks/wallet-tor-transport.js');
    const tor = fixed('tor-manager.js'),
      settings = fixed('settings-store.js');
    const { getPrivacyContext } = fixed('networks/privacy-context.js');
    const endpoint = Object.freeze({ signal: endpointLife.signal });
    replace(registry, 'getNetwork', () => ({ access: { readOrder: ['direct'] }, quorum: { timeoutMs: 30000 } }));
    replace(registry, 'getEndpoints', () => [ENDPOINT]);
    replace(registry, 'getEndpointSources', () => [{ keyed: false, coverage: { 11155111: ENDPOINT } }]);
    replace(tor, 'getWalletSocksEndpoint', () => endpoint);
    replace(settings, 'isWalletTorExperimentAvailable', () => true);
    replace(transport, 'createWalletTorTransport', () => {
      let closed = false,
        resolve;
      const barrier = new Promise((yes) => {
        resolve = yes;
      });
      const client = Object.freeze({
        closed: barrier,
        release() {},
        close() {
          if (!closed) {
            closed = true;
            resolve();
          }
        },
        async request(handle, url, options) {
          assert.equal(closed, false);
          const { subject } = getPrivacyContext(handle);
          assert.equal(options.method, 'POST');
          const wire = JSON.parse(options.body);
          const result = await chain.request(subject, url, wire);
          return {
            status: 200,
            body: Buffer.from(
              JSON.stringify(Object.hasOwn(wire, 'jsonrpc') ? { jsonrpc: '2.0', id: wire.id, result } : result)
            ),
          };
        },
      });
      clients.add(client);
      return client;
    });
    app.dock?.hide();
    await app.whenReady();
    manager = fixed('identity-manager.js');
    await manager.importExistingMnemonic(PASSWORD, MNEMONIC, false);
    const archive = request.runtime.archive,
      { proverArchive, artifactDirectory } = request.runtime;
    const identity = await fixed('wallet/railgun-identity.js').openRailgunIdentity({ archive });
    let enrollment, publicAccount, account;
    try {
      enrollment = await fixed('wallet/railgun-account-enrollment.js').openRailgunAccountEnrollment({
        identity,
        create: true,
      });
      publicAccount = await fixed('wallet/railgun-account-public.js').openRailgunAccountPublic({
        enrollment,
        archive,
        create: true,
      });
      for (const range of ranges()) await publicAccount.advance(range);
      milestone('legacy-public-advanced');
      const owners = { identity, enrollment, coordinator: publicAccount.coordinator };
      const walletApi = fixed('wallet/railgun-account-wallet.js');
      account = await walletApi.openRailgunAccountWallet({ ...owners, archive, mode: 'new' });
      const owned = walletApi.readRailgunAccountOwnedNotes(account, owners);
      assert.equal(owned.read.instanceId, fixture.instanceId);
      const note = owned.read.received.find((value) => value.id === '0:1');
      assert.ok(note && note.spentTxid === false && note.amount === 2000n);
      assert.equal(note.asset.contract.toLowerCase(), TOKEN);
      assert.equal(owned.ownedPoi.find((value) => value.id === '0:1')?.type, 'Shield');
      const request_ = Object.freeze({
        kind: 'railgun-private-transfer',
        noteId: '0:1',
        recipient: owned.read.instanceId,
      });
      milestone('legacy-prove-called');
      const proved = await fixed('wallet/railgun-private-operation.js').proveRailgunAccountPrivateOperation({
        account,
        owners,
        archive,
        proverArchive,
        artifactDirectory,
        request: request_,
      });
      milestone('legacy-proved:' + JSON.stringify({ status: proved.status, stage: proved.stage ?? null }));
      assert.equal(proved.status, 'proved');
      assert.match(proved.holdId, /^[0-9a-f]{64}$/);
      await account.close();
      account = null;
      const owner = (await fixed('wallet/signers.js').getSigner(0).getAddress()).toLowerCase();
      const stored = await (await enrollment.openPrivateCapsules()).get(proved.holdId);
      const transaction = stored.provedTransaction;
      // Continuity anchors (hashes only) for the installed recovery to match.
      const continuity = {
        capsuleSha256: sha(Buffer.from(JSON.stringify(stored.capsule))),
        signatureSha256: sha(Buffer.from(JSON.stringify(stored.signature))),
        provedTransactionSha256: sha(Buffer.from(JSON.stringify(transaction))),
        provedDataSha256: sha(Buffer.from(transaction.data.slice(2), 'hex')),
        provedTo: transaction.to.toLowerCase(),
        submitter: owner,
      };
      const handle = fixed('wallet/privacy-session.js').openPrivacySession().getContext({
        kind: 'public-address',
        principal: owner,
        chainId: CHAIN_ID,
        role: 'transaction-rpc',
      });
      const network = fixed('wallet/private-transaction-network.js').getPrivateTransactionNetwork(handle);
      const estimate = BigInt(
        (await network.request(CHAIN_ID, 'eth_estimateGas', [{ from: owner, to: transaction.to, value: '0x0', data: transaction.data }]))
          .result
      );
      const gasLimit = (estimate * 5n) / 4n;
      let reviews = 0;
      const submission = await fixed('wallet/railgun-private-submission.js').submitRailgunPrivateTransaction({
        identity,
        enrollment,
        completion: proved.completion.receipt,
        proverArchive,
        artifactDirectory,
        gasLimit,
        maxGasFee: FEE_CAP_WEI,
        review: async () => {
          reviews++;
          return true;
        },
      });
      milestone('legacy-submission:' + JSON.stringify(submission));
      // As the legacy qualifier classified it: a preflight outcome counts as
      // refused-before-send only once the journal readback shows no attempt.
      assert.ok(['refused', 'recovery-required'].includes(submission.status));
      assert.equal(submission.stage, 'preflight');
      assert.equal(reviews, 0);
      const journal = fixed('wallet/private-submission-journal.js').getPrivateSubmissionJournal(handle);
      const snapshot = await journal.readSnapshot();
      assert.equal(snapshot.records.length, 0);
      assert.equal(snapshot.archive.length, 0);
      const chainReport = chain.report();
      assert.equal(chainReport.injectedFaults, 1);
      assert.equal(chain.state().transactions.length, 0);
      report = {
        schema: 'railgun-journey-legacy-hold-v1',
        legacyCommit: request.legacyCommit,
        holdId: proved.holdId,
        prove: { status: proved.status },
        submission: { status: submission.status, stage: submission.stage, reviews, classifiedAs: 'refused-before-send' },
        spend: { attempted: false, journaled: false, submissionStatus: 'not-sent' },
        liveness: 'proved-unsent',
        estimate: estimate.toString(),
        continuity,
        // The live L-A report's binding facts: the Shield that created the
        // held input and the full-value self-transfer request.
        heldInput: {
          shieldTransactionHash: '0x' + String(note.txid).replace(/^0x/, '').toLowerCase(),
          spendRequest: { kind: 'railgun-private-transfer', recipient: 'self', fullInputValue: true },
        },
        syntheticChain: chainReport,
      };
    } finally {
      await account?.close();
      await publicAccount?.close();
      enrollment?.close();
      identity.close();
    }
    ownersClosed = true;
    if (manager) await manager.lockVault();
    manager = null;
    report.profileInventory = inventoryProfile(request.profileDirectory);
    write(path.join(request.outputDirectory, 'chain-state.json'), chain.state());
    write(path.join(request.outputDirectory, 'report.json'), {
      schema: 'railgun-journey-native-v1',
      mode: 'legacy-hold',
      scenario: report,
    });
  } catch (error) {
    try {
      write(path.join(request.evidenceDirectory, 'failure-frames.json'), {
        code: typeof error?.code === 'string' ? error.code : null,
        name: typeof error?.name === 'string' ? error.name : null,
        message: String(error?.message ?? '').slice(0, 240),
        frames: String(error?.stack ?? '')
          .split('\n')
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 14),
        milestones,
        syntheticChain: chain?.report() ?? null,
      });
    } catch {
      /* Diagnostics cannot replace the original failure. */
    }
    report = null;
  } finally {
    try {
      if (manager) await manager.lockVault();
      for (const client of clients) client.close();
      await Promise.all([...clients].map((client) => client.closed));
      endpointLife.abort();
      for (const [object, key, original] of overrides.reverse()) object[key] = original;
      await worker?.close();
      if (ownersClosed && lock) locks.releaseProfileLock(lock);
    } catch {
      report = null;
    }
  }
  app.exit(report ? 0 : 1);
}
main().catch(() => {
  process.stderr.write('Legacy journey entry refused\n');
  process.exitCode = 1;
});
