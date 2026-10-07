// Upstream bridge (negative): Kohaku's generic plugin Host (network, storage,
// keystore, provider) is not one of the restricted trusted-host extensions.
import type { Host } from '@kohaku-eth/plugins';
import {
  createRailgunKohakuPrivateAdapter,
  createRailgunKohakuPublicAdapter,
  createRailgunKohakuSnapshotPlugin,
} from '@freedom/railgun-kohaku-adapter';

declare const host: Host;
declare const signal: AbortSignal;

createRailgunKohakuSnapshotPlugin({ host, signal }); // expect TS2739
createRailgunKohakuPrivateAdapter({ host, signal }); // expect TS2740
createRailgunKohakuPublicAdapter({ host, signal }); // expect TS2740
