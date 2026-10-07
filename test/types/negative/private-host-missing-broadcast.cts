// Negative: a private host without broadcast() is not a RestrictedPrivateHost.
import { createRailgunKohakuPrivateAdapter } from '@freedom/railgun-kohaku-adapter';

const signal = new AbortController().signal;
const hostWithoutBroadcast = {
  signal,
  closed: Promise.resolve(),
  instanceId: async () => '0zk1qexample',
  balance: async () => [],
  notes: async () => [],
  prepareTransfer: async () => ({ handle: Object.freeze({}) }),
  prepareUnshield: async () => ({ handle: Object.freeze({}) }),
  close: () => undefined,
};
createRailgunKohakuPrivateAdapter({ host: hostWithoutBroadcast, signal }); // expect TS2741
