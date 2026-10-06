/** Package entry declarations for both the CommonJS and ESM conditions.
 * NOT YET VERIFIED: the contract files import PluginInstance/Broadcaster from
 * @kohaku-eth/plugins, a peer whose addition (0.0.1-alpha.16) awaits approval.
 * Until it is installed these declarations do not resolve; see README.md.
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
