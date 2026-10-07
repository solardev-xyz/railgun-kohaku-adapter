// Named-only ESM wrapper shares the CJS declaration identities.
import {
  normalizeRailgunPrivateCapsule,
  digestRailgunPrivateCapsule,
  railgunPrivateCapsuleCompatibility,
} from '@freedom/railgun-kohaku-adapter/data';
import type {
  RailgunPrivateCapsule,
  RailgunTransferCapsule,
  RailgunUnshieldCapsule,
  RailgunPartialUnshieldCapsule,
  RailgunCapsuleTransaction,
} from '@freedom/railgun-kohaku-adapter/data';
import type { RailgunPrivateCapsule as CjsCapsule } from '@freedom/railgun-kohaku-adapter/data' with {
  'resolution-mode': 'require',
};

declare const input: unknown;
const parsed: CjsCapsule = normalizeRailgunPrivateCapsule(input);
const capsule: RailgunPrivateCapsule = parsed;
const digest: string = digestRailgunPrivateCapsule(parsed);
const tx: RailgunCapsuleTransaction = parsed.preparation.transaction;
declare const transfer: RailgunTransferCapsule;
declare const unshield: RailgunUnshieldCapsule;
declare const partial: RailgunPartialUnshieldCapsule;
const kinds: readonly [
  'railgun-private-transfer',
  'railgun-token-unshield',
  'railgun-partial-unshield',
] = [transfer.selection.kind, unshield.selection.kind, partial.selection.kind];
const foreign: 'foreign' | undefined = transfer.selection.recipientRelationship;
const amount: string = unshield.preparation.expected.amount;
const partialAmount: string = partial.preparation.unshieldAmount;
const partialCommitment: `0x${string}` = partial.preparation.expected.changeCommitment;
const recordedOnly: 'recorded-provenance-only' = railgunPrivateCapsuleCompatibility.engineBinding;
export {
  capsule,
  digest,
  tx,
  kinds,
  foreign,
  amount,
  partialAmount,
  partialCommitment,
  recordedOnly,
};
