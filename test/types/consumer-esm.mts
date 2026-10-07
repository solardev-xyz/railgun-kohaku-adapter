// Positive ESM type consumer. typecheck.cjs compiles it and never runs it.
// The package resolves by its own name through the "import" condition
// (types/index.d.mts). Each of the five factories is used with typed host objects.
import * as adapterPackage from '@freedom/railgun-kohaku-adapter';
import {
  createRailgunKohakuSnapshotPlugin,
  createRailgunKohakuPrivateAdapter,
  createRailgunKohakuPrivateAdapterBroadcaster,
  createRailgunKohakuPublicAdapter,
  createRailgunKohakuPublicAdapterSubmitter,
} from '@freedom/railgun-kohaku-adapter';
import type {
  PrivateHostHandle,
  PrivateInput,
  PrivateOperation,
  PrivateSubmissionOutcome,
  PublicHostHandle,
  PublicShieldAcknowledgement,
  PublicShieldInput,
  PublicShieldOperation,
  ReadAmount,
  ReadAsset,
  ReadNote,
  RestrictedPrivateHost,
  RestrictedPublicHost,
  SnapshotHost,
} from '@freedom/railgun-kohaku-adapter';
// The same names through the "require" condition. Assignments below only
// compile if both entries share one declaration identity for each brand.
import type {
  PrivateAdapter as CjsPrivateAdapter,
  PrivateOperation as CjsPrivateOperation,
  PublicAdapter as CjsPublicAdapter,
  PublicShieldOperation as CjsPublicShieldOperation,
} from '@freedom/railgun-kohaku-adapter' with { 'resolution-mode': 'require' };

const ACCOUNT = '0zk1qexample';
const TOKEN = '0x1111111111111111111111111111111111111111';
const RECIPIENT = '0x2222222222222222222222222222222222222222';
const HASH = '0x3333333333333333333333333333333333333333333333333333333333333333';

const controller = new AbortController();
const { signal } = controller;
const privateHandle: PrivateHostHandle = Object.freeze({});
const publicHandle: PublicHostHandle = Object.freeze({});
const nativeAmount: ReadAmount = { asset: { __type: 'native' }, amount: 2n, tag: 'unverified' };

const snapshotHost: SnapshotHost = {
  signal,
  capture: () => ({
    snapshot: { instanceId: ACCOUNT, received: [] },
    assertCurrent: () => undefined,
  }),
};

const privateHost: RestrictedPrivateHost = {
  signal,
  closed: Promise.resolve(),
  instanceId: async () => ACCOUNT,
  balance: async (assets?: ReadonlyArray<ReadAsset>) => (assets?.length ? [] : [nativeAmount]),
  notes: async (): Promise<ReadonlyArray<ReadNote>> => [],
  prepareTransfer: async () => ({ handle: privateHandle }),
  prepareUnshield: async () => ({ handle: privateHandle }),
  broadcast: async (): Promise<PrivateSubmissionOutcome> => ({
    status: 'recovery-required',
    stage: 'submission',
  }),
  close: () => undefined,
};

const publicHost: RestrictedPublicHost = {
  signal,
  closed: Promise.resolve(),
  instanceId: async () => ACCOUNT,
  balance: async () => [nativeAmount],
  notes: async () => [],
  prepareShield: async (value: PublicShieldInput, to?: string) => {
    void value.amount;
    void to;
    return { handle: publicHandle };
  },
  submit: async (): Promise<PublicShieldAcknowledgement> => ({
    hash: HASH,
    nonce: 1,
    from: RECIPIENT,
    to: TOKEN,
    value: '1000',
    chainId: 11155111,
    broadcastSource: 'direct',
    explorerUrl: 'https://sepolia.etherscan.io/tx/' + HASH,
  }),
  close: () => undefined,
};

const snapshot = createRailgunKohakuSnapshotPlugin({ host: snapshotHost, signal });
const instanceId: string = await snapshot.instanceId();

const input: PrivateInput = {
  asset: { __type: 'erc20', contract: TOKEN },
  amount: 1n,
  noteId: '255:65535',
};
const privateAdapter = createRailgunKohakuPrivateAdapter({ host: privateHost, signal });
const unshield: PrivateOperation = await privateAdapter.prepareUnshield(input, RECIPIENT);
const outcome: PrivateSubmissionOutcome =
  await createRailgunKohakuPrivateAdapterBroadcaster(privateAdapter).broadcast(unshield);
const stage = 'status' in outcome ? outcome.stage : null;

const publicAdapter = adapterPackage.createRailgunKohakuPublicAdapter({ host: publicHost, signal });
const shield: PublicShieldOperation = await publicAdapter.prepareShield(
  { asset: { __type: 'native' }, amount: 1000n },
  ACCOUNT
);
const acknowledged = await createRailgunKohakuPublicAdapterSubmitter(publicAdapter).submit(shield);
const explorer: string | null = acknowledged.explorerUrl;

const cjsPrivateAdapter: CjsPrivateAdapter = privateAdapter;
const cjsPublicAdapter: CjsPublicAdapter = createRailgunKohakuPublicAdapter({
  host: publicHost,
  signal,
});
const cjsOperation: CjsPrivateOperation = unshield;
const cjsShield: CjsPublicShieldOperation = shield;
controller.abort();

export {
  instanceId,
  stage,
  explorer,
  cjsPrivateAdapter,
  cjsPublicAdapter,
  cjsOperation,
  cjsShield,
};
