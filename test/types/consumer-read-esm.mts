// Positive ESM type consumer of the "./read" subpath. typecheck.cjs compiles it
// and never runs it. The subpath resolves by the package's own name through the
// "import" condition (types/read.d.mts). The ports mirror Freedom's main-owned
// read ports over an asynchronous view; their callbacks are trusted test code.
import * as read from '@freedom/railgun-kohaku-adapter/read';
import {
  normalizeRailgunKohakuReadFilter,
  projectRailgunKohakuBalance,
  projectRailgunKohakuNotes,
  dispatchRailgunKohakuRead,
} from '@freedom/railgun-kohaku-adapter/read';
import type { ReadDispatchPorts, ReadDispatchView } from '@freedom/railgun-kohaku-adapter/read';
import type {
  ReadAmount,
  ReadAsset,
  ReadNote,
  SnapshotNote,
} from '@freedom/railgun-kohaku-adapter';
// The same names through the "require" condition share one declaration identity.
import type {
  ReadDispatchPorts as CjsReadDispatchPorts,
  ReadFilterKey as CjsReadFilterKey,
} from '@freedom/railgun-kohaku-adapter/read' with { 'resolution-mode': 'require' };

const ACCOUNT = '0zk1qexample';
const HASH = '0x3333333333333333333333333333333333333333333333333333333333333333';
const NFT = '0x2222222222222222222222222222222222222222';

let received: ReadonlyArray<SnapshotNote> = [
  {
    id: '1:0',
    tree: 1,
    position: 0,
    txid: HASH,
    hash: HASH,
    tokenHash: HASH,
    asset: { __type: 'erc1155', contract: NFT, tokenId: 3n },
    amount: 2n,
    tag: 'unverified',
    spentTxid: HASH,
  },
];

// A view in the shape of Freedom's createRailgunKohakuRead, with its extra method.
const view = Object.freeze({
  async instanceId(): Promise<string> {
    return ACCOUNT;
  },
  async balance(assets?: ReadAsset[]): Promise<ReadonlyArray<Readonly<ReadAmount>>> {
    const filter = normalizeRailgunKohakuReadFilter(assets);
    return projectRailgunKohakuBalance(received, filter);
  },
  async notes(assets?: ReadAsset[], includeSpent = false): Promise<ReadonlyArray<ReadNote>> {
    return read.projectRailgunKohakuNotes(
      received,
      read.normalizeRailgunKohakuReadFilter(assets),
      includeSpent
    );
  },
  async status(): Promise<{ poi: 'unverified' }> {
    return { poi: 'unverified' };
  },
});
const asView: ReadDispatchView = view;
const account = { view };
const work = new Set<Promise<unknown>>();
const ports: ReadDispatchPorts<{ account: typeof account; view: typeof view }> = Object.freeze({
  capture() {
    return { account, view: account.view };
  },
  recheck(captured: { account: typeof account; view: typeof view }) {
    if (captured.view !== account.view) throw new Error('stale');
  },
  retain<T>(pending: Promise<T>): Promise<T> {
    work.add(pending);
    return pending;
  },
  refused: () => new Error('Railgun Kohaku operation unavailable'),
});

const instanceId: string = await dispatchRailgunKohakuRead(ports, 'instanceId', []);
const balances = await dispatchRailgunKohakuRead(ports, 'balance', [undefined]);
const amount: bigint | undefined = balances[0]?.amount;
const notes: ReadonlyArray<ReadNote> = await read.dispatchRailgunKohakuRead(ports, 'notes', [
  [{ __type: 'erc721', contract: NFT, tokenId: 3n }],
  true,
]);
received = projectRailgunKohakuNotes(received, null, false);
const keys: ReadonlyArray<CjsReadFilterKey> = normalizeRailgunKohakuReadFilter([]);
const cjsPorts: CjsReadDispatchPorts<{ account: typeof account; view: typeof view }> = ports;

export { asView, instanceId, amount, notes, keys, cjsPorts };
