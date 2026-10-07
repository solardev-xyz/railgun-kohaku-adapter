// Upstream bridge (positive). typecheck.cjs compiles it against the installed
// @kohaku-eth/plugins 0.0.1-alpha.16 declarations with Bundler resolution and
// one "~/*" alias into that package's dist/. The alias is needed only because
// those published files import "~/host" and "~/shared" and re-export
// "./base" without an extension, which NodeNext cannot resolve.
import type { PluginInstance } from '@kohaku-eth/plugins';
import type { Broadcaster } from '@kohaku-eth/plugins/broadcaster';
import type {
  PrivateAdapter,
  PrivateAdapterBroadcaster,
  PrivateCapabilities,
  PrivateOperation,
  PrivateSubmissionOutcome,
  PublicAdapter,
  PublicCapabilities,
  ReadAmount,
  ReadNote,
  SnapshotExtras,
  SnapshotReadPlugin,
} from '@freedom/railgun-kohaku-adapter';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

// The Kohaku targets that types/ declared as Pinned*Target before 0.1.0 went
// self-contained, specialized exactly as they were.
type PinnedReadTarget = PluginInstance<
  string,
  {
    features: {};
    note: ReadNote;
    assetAmounts: { input: ReadAmount; internal: ReadAmount; output: ReadAmount; read: ReadAmount };
    extras: SnapshotExtras;
  }
>;
type PinnedPrivateTarget = PluginInstance<string, PrivateCapabilities>;
type PinnedPublicTarget = PluginInstance<string, PublicCapabilities>;

declare const snapshot: SnapshotReadPlugin;
declare const privateAdapter: PrivateAdapter;
declare const publicAdapter: PublicAdapter;

// Each restricted object is assignable to its Kohaku plugin-instance target.
export const readTarget: PinnedReadTarget = snapshot;
export const privateTarget: PinnedPrivateTarget = privateAdapter;
export const publicTarget: PinnedPublicTarget = publicAdapter;

// The self-contained broadcaster type is identical to Kohaku's Broadcaster.
export type BroadcasterMatches = Assert<
  Equal<PrivateAdapterBroadcaster, Broadcaster<PrivateOperation, PrivateSubmissionOutcome>>
>;

// The Kohaku view enables only the restricted features: no Multi variants and
// no cross-kind preparation.
type Prepare<T> = Extract<keyof T, `prepare${string}`>;
export type ReadFeatures = Assert<Equal<Prepare<PinnedReadTarget>, never>>;
export type PrivateFeatures = Assert<
  Equal<Prepare<PinnedPrivateTarget>, 'prepareTransfer' | 'prepareUnshield'>
>;
export type PublicFeatures = Assert<Equal<Prepare<PinnedPublicTarget>, 'prepareShield'>>;
