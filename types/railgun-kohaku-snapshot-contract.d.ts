/** Restricted snapshot extension, not CreatePluginFn<..., Host>.
 * Self-contained; test/types checks it against @kohaku-eth/plugins 0.0.1-alpha.16.
 * Callback code is trusted application code. Currency is host-relative.
 */
export type ReadAsset =
  | { __type: 'native' }
  | { __type: 'erc20'; contract: `0x${string}` }
  | { __type: 'erc721'; contract: `0x${string}`; tokenId: bigint };
export type SnapshotAsset =
  ReadAsset | { __type: 'erc1155'; contract: `0x${string}`; tokenId: bigint };
export interface SnapshotNote {
  id: string;
  tree: number;
  position: number;
  txid: `0x${string}`;
  hash: `0x${string}`;
  tokenHash: `0x${string}`;
  asset: SnapshotAsset;
  amount: bigint;
  tag: 'unverified';
  spentTxid: false | `0x${string}`;
}
export type ReadNote = Omit<SnapshotNote, 'asset'> & { asset: ReadAsset };
export interface ReadAmount {
  asset: ReadAsset;
  amount: bigint;
  tag: 'unverified';
}
export interface SnapshotHost {
  signal: AbortSignal;
  capture(): {
    snapshot: { instanceId: string; received: ReadonlyArray<SnapshotNote> };
    // Exactly undefined at runtime. TS's ordinary void callback assignment alone
    // would also allow value-returning functions, so express the stricter result.
    assertCurrent(): undefined;
  };
}
export type SnapshotExtras = {
  readonly provenance: 'host-supplied';
  readonly signal: AbortSignal;
  readonly closed: Promise<void>;
  close(): void;
};
export type SnapshotReadPlugin = SnapshotExtras & {
  instanceId(): Promise<string>;
  balance(assets?: ReadAsset[]): Promise<ReadAmount[]>;
  notes(assets?: ReadAsset[], includeSpent?: boolean): Promise<ReadNote[]>;
};
export declare function createRailgunKohakuSnapshotPlugin(options: {
  host: SnapshotHost;
  signal: AbortSignal;
}): SnapshotReadPlugin;
