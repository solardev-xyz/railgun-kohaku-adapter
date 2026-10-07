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

const recovery = host.normalizeRailgunPrivateRecoveryInput(input, { walletId: capsule.walletId });
const signature: readonly [`0x${string}`, `0x${string}`] = recovery.signature.R8;
const recovered = host.normalizeRailgunPrivateRecoveryResult(input, input);
const unverified: false = recovered.independentlyVerified;
const operation = host.normalizeRailgunPrivateOperation(input, capsule.preparation);
if (operation.status === 'proved') {
  const data: `0x${string}` = operation.transaction.data;
  void data;
}
const preparation = host.normalizeRailgunPrivatePreparation(input, input);
const disabled: false = preparation.spendingEnabled;
const selected = host.selectRailgunPrivatePreparation(input, input);
const relationship: 'self' | 'foreign' = host.assertRailgunPrivateTransferRecipient(
  selected,
  'instance'
);
const isForeign: boolean = host.isRailgunForeignTransfer(selected);
const normalizedSignature = host.normalizeRailgunSignature(input);
const request = host.normalizeRailgunSpendKeyRequest(input, input);
const signed = host.normalizeRailgunSpendSignature(input, input);
const verified = host.normalizeRailgunPrivateVerification(input, input);
const recipient = host.normalizeRailgunPrivateReceiver(input, input);
const destination = host.decodeRailgunForeignDestination(() => input, 'address', input);
const output = host.verifyRailgunForeignOutput(() => input, input);
export {
  recovery,
  signature,
  unverified,
  disabled,
  relationship,
  isForeign,
  normalizedSignature,
  request,
  signed,
  verified,
  recipient,
  destination,
  output,
};
