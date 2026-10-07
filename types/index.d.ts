/** CommonJS entry declarations (the "require" condition and top-level types).
 * index.d.mts forwards this file for the "import" condition. The declarations
 * are self-contained and import nothing from @kohaku-eth/plugins; test/types
 * checks them with TypeScript, including against that package; see README.md.
 * Each type is re-exported from exactly one contract file, so the private and
 * public operation brands keep a single declaration identity.
 */
export { createRailgunKohakuSnapshotPlugin } from './railgun-kohaku-snapshot-contract';
export type {
  ReadAsset,
  SnapshotAsset,
  SnapshotNote,
  ReadNote,
  ReadAmount,
  SnapshotHost,
  SnapshotExtras,
  SnapshotReadPlugin,
} from './railgun-kohaku-snapshot-contract';
export {
  createRailgunKohakuPrivateAdapter,
  createRailgunKohakuPrivateAdapterBroadcaster,
} from './railgun-kohaku-private-contract';
export type {
  PrivateInput,
  PrivateOperation,
  PrivateUnshieldOptions,
  PrivateSubmissionOutcome,
  PrivateHostHandle,
  RestrictedPrivateHost,
  PrivateAdapterExtras,
  PrivateAdapter,
  PrivateCapabilities,
  PrivateAdapterBroadcaster,
} from './railgun-kohaku-private-contract';
export {
  createRailgunKohakuPublicAdapter,
  createRailgunKohakuPublicAdapterSubmitter,
} from './railgun-kohaku-public-contract';
export type {
  PublicShieldInput,
  PublicShieldOperation,
  PublicShieldAcknowledgement,
  PublicHostHandle,
  RestrictedPublicHost,
  PublicAdapterExtras,
  PublicAdapter,
  PublicCapabilities,
  PublicAdapterSubmitter,
} from './railgun-kohaku-public-contract';
