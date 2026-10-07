// Positive CommonJS type consumer. typecheck.cjs compiles it and never runs it.
// The package resolves by its own name through the "require" condition
// (types/index.d.ts). Each of the five factories is used with typed host objects.
import adapterPackage = require('@freedom/railgun-kohaku-adapter');
import {
  createRailgunKohakuSnapshotPlugin,
  createRailgunKohakuPrivateAdapter,
  createRailgunKohakuPrivateAdapterBroadcaster,
  createRailgunKohakuPublicAdapterSubmitter,
} from '@freedom/railgun-kohaku-adapter';
import type {
  PrivateAdapter,
  PrivateAdapterBroadcaster,
  PrivateHostHandle,
  PrivateInput,
  PrivateOperation,
  PrivateSubmissionOutcome,
  PublicAdapterSubmitter,
  PublicShieldAcknowledgement,
  PublicShieldOperation,
  ReadAmount,
  ReadNote,
  RestrictedPrivateHost,
  RestrictedPublicHost,
  SnapshotHost,
  SnapshotNote,
  SnapshotReadPlugin,
} from '@freedom/railgun-kohaku-adapter';
// The same names through the "import" condition. Assignments below only compile
// if both entries share one declaration identity for each brand.
import type {
  PrivateAdapterBroadcaster as EsmPrivateAdapterBroadcaster,
  PrivateOperation as EsmPrivateOperation,
  PublicShieldOperation as EsmPublicShieldOperation,
} from '@freedom/railgun-kohaku-adapter' with { 'resolution-mode': 'import' };

const ACCOUNT = '0zk1qexample';
const TOKEN = '0x1111111111111111111111111111111111111111';
const RECIPIENT = '0x2222222222222222222222222222222222222222';
const HASH = '0x3333333333333333333333333333333333333333333333333333333333333333';

const signal = new AbortController().signal;
const note: SnapshotNote = {
  id: '0:1',
  tree: 0,
  position: 1,
  txid: HASH,
  hash: HASH,
  tokenHash: HASH,
  asset: { __type: 'erc20', contract: TOKEN },
  amount: 5n,
  tag: 'unverified',
  spentTxid: false,
};
const readNote: ReadNote = { ...note, asset: { __type: 'erc20', contract: TOKEN } };
const readAmount: ReadAmount = {
  asset: { __type: 'erc20', contract: TOKEN },
  amount: 5n,
  tag: 'unverified',
};
const handle: PrivateHostHandle = Object.freeze({});

const snapshotHost: SnapshotHost = {
  signal,
  capture() {
    return {
      snapshot: { instanceId: ACCOUNT, received: [note] },
      assertCurrent() {
        return undefined;
      },
    };
  },
};

const privateHost: RestrictedPrivateHost = {
  signal,
  closed: Promise.resolve(),
  instanceId: () => Promise.resolve(ACCOUNT),
  balance: () => Promise.resolve([readAmount]),
  notes: () => Promise.resolve([readNote]),
  prepareTransfer: () => Promise.resolve({ handle }),
  prepareUnshield: () => Promise.resolve({ handle }),
  broadcast: () => Promise.resolve({ transactionHash: HASH, submissionStatus: 'unknown' }),
  close: () => undefined,
};

const publicHost: RestrictedPublicHost = {
  signal,
  closed: Promise.resolve(),
  instanceId: () => Promise.resolve(ACCOUNT),
  balance: () => Promise.resolve([readAmount]),
  notes: () => Promise.resolve([]),
  prepareShield: () => Promise.resolve({ handle }),
  submit: () =>
    Promise.resolve({
      hash: HASH,
      nonce: 7,
      from: RECIPIENT,
      to: TOKEN,
      value: '1000000000000000',
      chainId: 11155111,
      broadcastSource: 'direct',
      explorerUrl: null,
    }),
  close: () => undefined,
};

function describeOutcome(outcome: PrivateSubmissionOutcome): string {
  if ('hash' in outcome) {
    const value: '0' = outcome.value;
    const chainId: 11155111 = outcome.chainId;
    return `${outcome.hash}:${value}:${chainId}`;
  }
  if ('transactionHash' in outcome) return `${outcome.transactionHash}:${outcome.submissionStatus}`;
  return `${outcome.status}:${outcome.stage}`;
}

export async function consume(): Promise<ReadonlyArray<string>> {
  const snapshot: SnapshotReadPlugin = createRailgunKohakuSnapshotPlugin({
    host: snapshotHost,
    signal,
  });
  const balances: ReadAmount[] = await snapshot.balance([{ __type: 'native' }]);
  const notes: ReadNote[] = await snapshot.notes(undefined, true);
  snapshot.close();
  await snapshot.closed;

  const input: PrivateInput = {
    asset: { __type: 'erc20', contract: TOKEN },
    amount: 10n ** 15n,
    noteId: '0:1',
  };
  const privateAdapter: PrivateAdapter = createRailgunKohakuPrivateAdapter({
    host: privateHost,
    signal,
  });
  const broadcaster: PrivateAdapterBroadcaster =
    createRailgunKohakuPrivateAdapterBroadcaster(privateAdapter);
  const transfer: PrivateOperation = await privateAdapter.prepareTransfer(input, ACCOUNT);
  const transferOutcome = await broadcaster.broadcast(transfer);
  const unshieldAdapter = createRailgunKohakuPrivateAdapter({ host: privateHost, signal });
  const unshield = await unshieldAdapter.prepareUnshield(input, RECIPIENT, {});
  const unshieldOutcome =
    await createRailgunKohakuPrivateAdapterBroadcaster(unshieldAdapter).broadcast(unshield);

  const publicAdapter = adapterPackage.createRailgunKohakuPublicAdapter({
    host: publicHost,
    signal,
  });
  const submitter: PublicAdapterSubmitter =
    createRailgunKohakuPublicAdapterSubmitter(publicAdapter);
  const shield: PublicShieldOperation = await publicAdapter.prepareShield({
    asset: { __type: 'native' },
    amount: 10n ** 15n,
  });
  const acknowledged: PublicShieldAcknowledgement = await submitter.submit(shield);

  const esmOperation: EsmPrivateOperation = transfer;
  const esmShield: EsmPublicShieldOperation = shield;
  const esmBroadcaster: EsmPrivateAdapterBroadcaster = broadcaster;
  await esmBroadcaster.broadcast(esmOperation);
  await submitter.submit(esmShield);

  return [
    String(balances.length + notes.length),
    describeOutcome(transferOutcome),
    describeOutcome(unshieldOutcome),
    `${acknowledged.hash}:${acknowledged.value}`,
  ];
}
