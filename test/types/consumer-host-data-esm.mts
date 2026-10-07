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
