/** ESM entry declarations (the "import" condition, describing index.mjs).
 * index.mjs has named exports only, so this file has no default export. It
 * forwards the CommonJS declarations instead of copying them, so both entries
 * share one declaration identity for each operation brand and adapter type.
 */
export {
  createRailgunKohakuSnapshotPlugin,
  createRailgunKohakuPrivateAdapter,
  createRailgunKohakuPrivateAdapterBroadcaster,
  createRailgunKohakuPublicAdapter,
  createRailgunKohakuPublicAdapterSubmitter,
} from './index.js';
export type {
  ReadAsset,
  SnapshotAsset,
  SnapshotNote,
  ReadNote,
  ReadAmount,
  SnapshotHost,
  SnapshotExtras,
  SnapshotReadPlugin,
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
  PublicShieldInput,
  PublicShieldOperation,
  PublicShieldAcknowledgement,
  PublicHostHandle,
  RestrictedPublicHost,
  PublicAdapterExtras,
  PublicAdapter,
  PublicCapabilities,
  PublicAdapterSubmitter,
} from './index.js';
