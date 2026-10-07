import * as host from '@freedom/railgun-kohaku-adapter/host/data';
import type {
  RailgunCheckedTransaction as CjsChecked,
  RailgunPrivateOffer,
} from '@freedom/railgun-kohaku-adapter/host/data' with {
  'resolution-mode': 'require',
};
declare const input: unknown;
const capsule = host.normalizeRailgunPrivateCapsule(input);
const offer: RailgunPrivateOffer = host.normalizeRailgunPrivateOffer(input, capsule.selection);
const checked: CjsChecked = host.validateRailgunPrivateSigningIntent(
  offer.transaction,
  offer.expected
);
if (checked.kind === 'railgun-partial-unshield') {
  const commitment: `0x${string}` = checked.changeCommitment;
  const amount: string = checked.unshieldAmount;
  void [commitment, amount];
}
export { capsule, offer, checked };

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
