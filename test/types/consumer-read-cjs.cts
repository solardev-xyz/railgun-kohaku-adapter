// Positive CommonJS type consumer of the "./read" subpath. typecheck.cjs
// compiles it and never runs it. The subpath resolves by the package's own name
// through the "require" condition (types/read.d.ts). The ports mirror the
// snapshot plugin's synchronous view; their callbacks are trusted test code.
import read = require('@freedom/railgun-kohaku-adapter/read');
import {
  normalizeRailgunKohakuReadFilter,
  projectRailgunKohakuBalance,
  projectRailgunKohakuNotes,
  dispatchRailgunKohakuRead,
} from '@freedom/railgun-kohaku-adapter/read';
import type {
  ReadDispatchPorts,
  ReadFilter,
  ReadFilterKey,
  ReadMethod,
} from '@freedom/railgun-kohaku-adapter/read';
import type {
  ReadAmount,
  ReadAsset,
  ReadNote,
  SnapshotNote,
} from '@freedom/railgun-kohaku-adapter';
// The same names through the "import" condition. The assignments below only
// compile if both conditions share one declaration identity.
import type {
  ReadDispatchPorts as EsmReadDispatchPorts,
  ReadFilter as EsmReadFilter,
} from '@freedom/railgun-kohaku-adapter/read' with { 'resolution-mode': 'import' };

const ACCOUNT = '0zk1qexample';
const TOKEN = '0x1111111111111111111111111111111111111111';
const HASH = '0x3333333333333333333333333333333333333333333333333333333333333333';

const received: ReadonlyArray<SnapshotNote> = [
  {
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
  },
];

const unfiltered: null = normalizeRailgunKohakuReadFilter();
const explicit: null = normalizeRailgunKohakuReadFilter(undefined);
const keys: ReadonlyArray<ReadFilterKey> = normalizeRailgunKohakuReadFilter([
  { __type: 'native' },
  { __type: 'erc20', contract: TOKEN },
  { __type: 'erc721', contract: TOKEN, tokenId: 7n },
]);
const firstKey: 'native' | `erc20:0x${string}` | `erc721:0x${string}:${bigint}` = keys[0];
const selectable = (assets?: ReadAsset[]): ReadFilter => normalizeRailgunKohakuReadFilter(assets);
const totals: ReadonlyArray<Readonly<ReadAmount>> = projectRailgunKohakuBalance(received, keys);
const spent: ReadonlyArray<ReadNote> = projectRailgunKohakuNotes(received, unfiltered, true);

interface Captured {
  readonly recheck: () => void;
  readonly view: {
    instanceId(): string;
    balance(assets?: ReadAsset[]): ReadonlyArray<Readonly<ReadAmount>>;
    notes(assets?: ReadAsset[], includeSpent?: boolean): ReadonlyArray<ReadNote>;
  };
}
const work = new Set<Promise<unknown>>();
const ports: ReadDispatchPorts<Captured> = {
  capture() {
    return {
      recheck: () => undefined,
      view: {
        instanceId: () => ACCOUNT,
        balance: (assets) => projectRailgunKohakuBalance(received, selectable(assets)),
        notes: (assets, includeSpent = false) =>
          projectRailgunKohakuNotes(received, selectable(assets), includeSpent),
      },
    };
  },
  recheck(captured) {
    captured.recheck();
  },
  retain(pending) {
    work.add(pending);
    const settled = () => work.delete(pending);
    pending.then(settled, settled);
    return pending;
  },
  refused: () => Object.assign(new Error('Kohaku read unavailable'), { code: 'REFUSED' }),
};

export async function consume(method: ReadMethod): Promise<ReadonlyArray<string>> {
  const instanceId: string = await dispatchRailgunKohakuRead(ports, 'instanceId', []);
  const balances: ReadonlyArray<Readonly<ReadAmount>> = await read.dispatchRailgunKohakuRead(
    ports,
    'balance',
    [[{ __type: 'native' }]]
  );
  const notes: ReadonlyArray<ReadNote> = await dispatchRailgunKohakuRead(ports, 'notes', [
    undefined,
    true,
  ]);
  const any: unknown = await dispatchRailgunKohakuRead(ports, method, []);
  const esmPorts: EsmReadDispatchPorts<Captured> = ports;
  const esmFilter: EsmReadFilter = selectable();
  await dispatchRailgunKohakuRead(esmPorts, 'balance', [undefined]);
  return [
    instanceId,
    firstKey,
    String(explicit === esmFilter),
    String(totals.length + spent.length + balances.length + notes.length),
    typeof any,
  ];
}
