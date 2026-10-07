// Trusted input structure is separate from runtime ownership/cryptographic authority.
import host = require('@freedom/railgun-kohaku-adapter/host/data');
import type {
  RailgunCheckedTransaction,
  RailgunPrivateOffer,
} from '@freedom/railgun-kohaku-adapter/host/data';
import type { RailgunCheckedTransaction as EsmChecked } from '@freedom/railgun-kohaku-adapter/host/data' with {
  'resolution-mode': 'import',
};
import type { RailgunPrivateCapsule } from '@freedom/railgun-kohaku-adapter/data';
declare const input: unknown;
const capsule: RailgunPrivateCapsule = host.normalizeRailgunPrivateCapsule(input);
const offer: RailgunPrivateOffer = host.normalizeRailgunPrivateOffer(
  capsule.preparation,
  capsule.selection
);
const checked: RailgunCheckedTransaction = host.validateRailgunPrivateTransaction(
  offer.transaction,
  offer.expected
);
const same: EsmChecked = checked;
const intent: RailgunCheckedTransaction = host.validateRailgunPrivateSigningIntent(input, input);
const matched: RailgunCheckedTransaction = host.matchRailgunPrivateProvedTransaction(
  input,
  input,
  input
);
const digest: string = host.digestRailgunPrivateCapsule(capsule);
const abi: readonly string[] = [host.TRANSACT_ABI, host.BOUND_PARAMS];
const noAuthority: readonly false[] = [
  checked.proofVerified,
  checked.recipientVerified,
  checked.reservationsChecked,
  checked.spendingEnabled,
];
export { capsule, offer, same, intent, matched, digest, abi, noAuthority };
