/** Trusted-host historical compatibility primitives. Unlike ./data, these do
 * not pre-copy hostile inputs or sanitize every error; callers must validate
 * their objects and contain raw assertion errors. No returned value grants
 * ownership, proof, reservation, signing, storage or submission authority.
 */
import type { RailgunPrivateCapsule, RailgunCapsuleTransaction, RailgunDataHex } from './data.js';

export type RailgunCheckedTransaction = Readonly<
  RailgunCapsuleTransaction &
    RailgunPrivateCapsule['preparation']['expected'] & {
      digest: RailgunDataHex;
      proofVerified: false;
      recipientVerified: false;
      reservationsChecked: false;
      spendingEnabled: false;
    }
>;
export type RailgunPrivateOffer = Readonly<
  RailgunPrivateCapsule['preparation'] & { transactionDigest: RailgunDataHex }
>;
export const TRANSACT_ABI: string;
export const BOUND_PARAMS: string;
export function validateRailgunPrivateTransaction(
  transaction: unknown,
  expected: unknown
): RailgunCheckedTransaction;
export function validateRailgunPrivateSigningIntent(
  transaction: unknown,
  expected: unknown
): RailgunCheckedTransaction;
export function matchRailgunPrivateProvedTransaction(
  intent: unknown,
  transaction: unknown,
  expected: unknown
): RailgunCheckedTransaction;
export function normalizeRailgunPrivateOffer(
  value: unknown,
  selection: RailgunPrivateCapsule['selection']
): RailgunPrivateOffer;
export function normalizeRailgunPrivateCapsule(value: unknown): RailgunPrivateCapsule;
export function digestRailgunPrivateCapsule(value: unknown): string;

/** Shape checks only; zero-valued coordinates remain structurally possible. */
export type RailgunSignature = Readonly<{
  R8: readonly [RailgunDataHex, RailgunDataHex];
  S: RailgunDataHex;
}>;
export type RailgunPrivatePreparation = Readonly<
  RailgunPrivateOffer & {
    witnessRetained: false;
    recipientVerified: false;
    reservationsChecked: false;
    poiVerified: false;
    spendingEnabled: false;
  }
>;
export type RailgunPrivateProvedResult = Readonly<{
  status: 'proved';
  transaction: RailgunCapsuleTransaction;
  transactionDigest: RailgunDataHex;
  independentlyVerified: false;
}>;
export type RailgunPrivateOperationResult =
  RailgunPrivateProvedResult | Readonly<{ status: 'refused' }>;
export type RailgunPrivateRecoveryInput = Readonly<{
  capsule: RailgunPrivateCapsule;
  signature: RailgunSignature;
  proverArchive: string;
  artifactDirectory: string;
}>;
export type RailgunForeignDestination = Readonly<{
  masterPublicKey: bigint;
  // The object is frozen; its detached Uint8Array remains mutable at runtime.
  viewingPublicKey: Uint8Array;
  chain?: Readonly<{ type: 0; id: 11155111 }>;
  version: 1;
}>;
export type RailgunPrivateReceiverResult = Readonly<
  {
    recipientVerified: true;
    transactionDigest: RailgunDataHex;
    recipient: string;
    inputOwnershipVerified: false;
    spendingEnabled: false;
  } & (
    | { amount: string; recipientRelationship?: 'foreign' }
    | { inputAmount: string; unshieldAmount: string; changeAmount: string }
  )
>;
export function normalizeRailgunSignature(value: unknown): RailgunSignature;
export function isRailgunForeignTransfer(selection: unknown): boolean;
export function assertRailgunPrivateTransferRecipient(
  selection: unknown,
  instanceId: string
): 'self' | 'foreign';
/** The caller supplies the pinned engine importer and contains its effects.
 * This function neither loads nor authenticates an engine implementation. */
export function decodeRailgunForeignDestination(
  importer: (specifier: string) => unknown,
  address: string,
  own: unknown
): RailgunForeignDestination;
/** Uses the caller's engine importer, checks the original sent output and wipes
 * its temporary symmetric key. A result is data, not an operation receipt. */
export function verifyRailgunForeignOutput(
  importer: (specifier: string) => unknown,
  options: unknown
): Promise<Readonly<{ notePublicKey: bigint; value: bigint; hash: bigint }>>;
export function selectRailgunPrivatePreparation(
  owned: unknown,
  request: unknown
): RailgunPrivateCapsule['selection'];
export function normalizeRailgunPrivatePreparation(
  value: unknown,
  context: unknown
): RailgunPrivatePreparation;
export function normalizeRailgunPrivateOperation(
  value: unknown,
  preparation: unknown
): RailgunPrivateOperationResult;
export function normalizeRailgunSpendKeyRequest(
  value: unknown,
  context: unknown
): Readonly<{ transactionDigest: RailgunDataHex; expectedHash: RailgunDataHex }>;
export function normalizeRailgunSpendSignature(
  value: unknown,
  context: unknown
): Readonly<{
  signature: RailgunSignature;
  message: RailgunDataHex;
  transactionDigest: RailgunDataHex;
}>;
/** Copies the supplied guarded result after matching data and manifest pins;
 * its true field alone does not establish an independently observed utility. */
export function normalizeRailgunPrivateVerification(
  value: unknown,
  context: unknown
): Readonly<{ transactionDigest: RailgunDataHex; verified: true }>;
export function normalizeRailgunPrivateReceiver(
  value: unknown,
  context: unknown
): RailgunPrivateReceiverResult;
export function normalizeRailgunPrivateRecoveryInput(
  value: unknown,
  context: Readonly<{ walletId: string }>
): RailgunPrivateRecoveryInput;
export function normalizeRailgunPrivateRecoveryResult(
  value: unknown,
  context: unknown
): RailgunPrivateProvedResult;
