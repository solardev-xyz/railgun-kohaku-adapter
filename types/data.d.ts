/** Structural data only. No value returned here is an ownership, proof,
 * reservation, signing or submission capability. Runtime validation is required.
 */
export type RailgunDataHex = `0x${string}`;
export type RailgunCapsuleTransaction = Readonly<{
  chainId: 11155111;
  to: RailgunDataHex;
  value: '0';
  data: RailgunDataHex;
}>;
type Position = { readonly tree: number; readonly position: number };
type ExpectedBase = {
  readonly tree: number;
  readonly merkleRoot: RailgunDataHex;
  readonly nullifier: RailgunDataHex;
  readonly boundParamsHash: RailgunDataHex;
};
type PreparationBase = {
  readonly transaction: RailgunCapsuleTransaction;
  readonly expectedHash: RailgunDataHex;
  readonly recipient: string;
};
type Capsule<Version, Selection, Preparation> = Readonly<{
  version: Version;
  walletId: string;
  engineSha256: string;
  selection: Readonly<Selection>;
  preparation: Readonly<Preparation>;
  noteHash: RailgunDataHex;
  pathElements: readonly RailgunDataHex[];
}>;
export type RailgunTransferCapsule = Capsule<
  1,
  Position & {
    kind: 'railgun-private-transfer';
    recipient: string;
    recipientRelationship?: 'foreign';
  },
  PreparationBase & {
    amount: string;
    expected: Readonly<
      ExpectedBase & {
        kind: 'railgun-private-transfer';
        commitment: RailgunDataHex;
      }
    >;
  }
>;
export type RailgunUnshieldCapsule = Capsule<
  1,
  Position & { kind: 'railgun-token-unshield'; recipient: RailgunDataHex },
  PreparationBase & {
    amount: string;
    expected: Readonly<
      ExpectedBase & {
        kind: 'railgun-token-unshield';
        commitment: RailgunDataHex;
        recipient: RailgunDataHex;
        amount: string;
      }
    >;
  }
>;
export type RailgunPartialUnshieldCapsule = Capsule<
  2,
  Position & {
    kind: 'railgun-partial-unshield';
    recipient: RailgunDataHex;
    unshieldAmount: string;
  },
  PreparationBase & {
    inputAmount: string;
    unshieldAmount: string;
    changeAmount: string;
    expected: Readonly<
      ExpectedBase & {
        kind: 'railgun-partial-unshield';
        changeCommitment: RailgunDataHex;
        unshieldCommitment: RailgunDataHex;
        recipient: RailgunDataHex;
        unshieldAmount: string;
      }
    >;
  }
>;
export type RailgunPrivateCapsule =
  RailgunTransferCapsule | RailgunUnshieldCapsule | RailgunPartialUnshieldCapsule;

/** Accepts bounded plain data, validates the restricted historical format and
 * returns a detached, deeply frozen value. Throws RAILGUN_CAPSULE_DATA_REFUSED.
 */
export function normalizeRailgunPrivateCapsule(input: unknown): RailgunPrivateCapsule;
/** Returns the historical domain-separated SHA-256 after the same validation.
 * An unkeyed digest alone authenticates neither a record nor its owner.
 */
export function digestRailgunPrivateCapsule(input: unknown): string;
/** In supported entries, self means the capsule marker is absent. Records only
 * admit the explicit foreign marker; a literal self marker is refused. */
export const railgunPrivateCapsuleCompatibility: Readonly<{
  schema: 'freedom-railgun-private-capsule';
  chainId: 11155111;
  proxy: string;
  maxQualificationAmount: string;
  policy: 'freedom-sepolia-qualification';
  digestDomains: readonly [
    'freedom:railgun:private-capsule-v1\0',
    'freedom:railgun:private-capsule-v2\0',
  ];
  unknownFields: 'refused';
  maxCalldataBytes: 4096;
  supported: readonly Readonly<{
    version: 1 | 2;
    kind: 'railgun-private-transfer' | 'railgun-token-unshield' | 'railgun-partial-unshield';
    recipientRelationship?: 'self' | 'foreign';
  }>[];
  engineBinding: 'recorded-provenance-only';
  proofVerified: false;
  ownershipVerified: false;
  spendingEnabled: false;
}>;

// Keep local composition helpers out of the public declaration exports.
export {};
