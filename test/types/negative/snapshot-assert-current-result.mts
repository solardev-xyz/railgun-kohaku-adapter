// Negative: assertCurrent must return exactly undefined, and capture() must
// be synchronous; a value-returning or async callback is not a SnapshotHost.
import { createRailgunKohakuSnapshotPlugin } from '@freedom/railgun-kohaku-adapter';
import type { SnapshotHost } from '@freedom/railgun-kohaku-adapter';

const signal = new AbortController().signal;
const valueReturning: SnapshotHost = {
  signal,
  capture: () => ({
    snapshot: { instanceId: '0zk1qexample', received: [] },
    assertCurrent: () => true, // expect TS2322
  }),
};
const asynchronous = {
  signal,
  capture: async () => ({
    snapshot: { instanceId: '0zk1qexample', received: [] },
    assertCurrent: () => undefined,
  }),
};
createRailgunKohakuSnapshotPlugin({ host: valueReturning, signal });
createRailgunKohakuSnapshotPlugin({ host: asynchronous, signal }); // expect TS2322
