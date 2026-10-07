/** Read helpers of the "./read" subpath, the functions the factories use.
 * Self-contained like the other contracts. The three data helpers normalize and
 * project supplied values; they do not authenticate ownership or currentness.
 * dispatchRailgunKohakuRead sequences trusted callbacks and has no authority.
 */
import type {
  ReadAmount,
  ReadAsset,
  ReadNote,
  SnapshotNote,
} from './railgun-kohaku-snapshot-contract';
/** A canonical key: lowercase contract, decimal ERC-721 token ID. */
export type ReadFilterKey = 'native' | `erc20:0x${string}` | `erc721:0x${string}:${bigint}`;
/** null is unfiltered. At runtime an array must be frozen and hold only strings. */
export type ReadFilter = ReadonlyArray<string> | null;
/** undefined gives null. Up to 1000 assets give frozen, deduplicated keys. */
export declare function normalizeRailgunKohakuReadFilter(assets?: undefined): null;
export declare function normalizeRailgunKohakuReadFilter(
  assets: ReadonlyArray<ReadAsset>
): ReadonlyArray<ReadFilterKey>;
export declare function normalizeRailgunKohakuReadFilter(
  assets?: ReadonlyArray<ReadAsset>
): ReadonlyArray<ReadFilterKey> | null;
/** Unspent totals per asset key, sorted by key. Each entry is frozen and keeps
 * the last matching note's asset object; an unfiltered ERC-1155 note throws.
 */
export declare function projectRailgunKohakuBalance(
  received: ReadonlyArray<SnapshotNote>,
  filter: ReadFilter
): ReadonlyArray<Readonly<ReadAmount>>;
/** The matching supplied note objects themselves, in a frozen array. */
export declare function projectRailgunKohakuNotes(
  received: ReadonlyArray<SnapshotNote>,
  filter: ReadFilter,
  includeSpent: boolean
): ReadonlyArray<ReadNote>;
export type ReadMethod = 'instanceId' | 'balance' | 'notes';
/** Only the dispatched method is called, with the view as `this`. */
export interface ReadDispatchView {
  instanceId(...args: never): unknown;
  balance(...args: never): unknown;
  notes(...args: never): unknown;
}
/** Trusted callbacks, called as methods of the ports object. They carry their
 * own authority and side effects; the dispatcher adds none.
 */
export interface ReadDispatchPorts<Captured extends { readonly view: ReadDispatchView }> {
  /** Synchronous; throws to refuse before the view is called. */
  capture(): Captured;
  /** Called after the view's result fulfils; throws once the capture is stale. */
  recheck(captured: Captured): void;
  /** Receives the pending read synchronously; its result is what dispatch returns. */
  retain<T>(pending: Promise<T>): Promise<T>;
  /** The rejection reason for every failure; original reasons are discarded. */
  refused(): unknown;
}
export declare function dispatchRailgunKohakuRead<
  Captured extends { readonly view: ReadDispatchView },
  Method extends ReadMethod,
>(
  ports: ReadDispatchPorts<Captured>,
  method: Method,
  args: Parameters<Captured['view'][Method]>
): Promise<Awaited<ReturnType<Captured['view'][Method]>>>;
