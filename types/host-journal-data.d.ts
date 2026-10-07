/** Trusted-host structural data only; no proof, receipt, or signing authority. */
export interface TransactJournalBase {
  readonly kind: "railgun-transact";
  readonly digest: string;
  readonly tree: number;
  readonly merkleRoot: string;
  readonly nullifier: string;
  readonly boundParamsHash: string;
  readonly intentDigest: string;
}
export type TransactJournalIntent = TransactJournalBase &
  (
    | {
        readonly operation: "railgun-private-transfer";
        readonly commitment: string;
      }
    | {
        readonly operation: "railgun-token-unshield";
        readonly commitment: string;
        readonly recipient: string;
        readonly amount: string;
      }
    | {
        readonly operation: "railgun-partial-unshield";
        readonly version: 2;
        readonly changeCommitment: string;
        readonly unshieldCommitment: string;
        readonly recipient: string;
        readonly unshieldAmount: string;
      }
  );
/** Invalid inputs retain the original refusal/error behavior. */
export function railgunTransactJournalIntent(
  transaction: unknown,
): TransactJournalIntent;
export function validRailgunTransactIntent(value: unknown): boolean;
export function validRailgunTransactResolution(
  value: unknown,
  record: unknown,
): boolean;
/** Freezes the supplied object in place; does not validate it or clone it. */
export function freezeRailgunTransactResolution<T extends object>(
  value: T,
): Readonly<T>;
export interface ShieldIntentBinding {
  npk: string;
  token: string;
  amount: string;
  noteValue: string;
}
/** Returns the original mutable binding object. */
export function shieldIntentBinding(transaction: unknown): ShieldIntentBinding;
/** Historical truthiness result: may retain a nonboolean falsy input. */
export function validShieldIntent(value: unknown): unknown;
export function isRailgunTarget(to: unknown): boolean;
/** Historical truthiness result: a missing nested shield may remain null/undefined. */
export function validRailgunShieldResolution(
  value: unknown,
  record: unknown,
): unknown;
/** Freezes the supplied object in place; does not validate it or clone it. */
export function freezeRailgunShieldResolution<T extends object>(
  value: T,
): Readonly<T>;
