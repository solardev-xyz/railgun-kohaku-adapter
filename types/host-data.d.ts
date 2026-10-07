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
