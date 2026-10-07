import host from '@freedom/railgun-kohaku-adapter/host/data'; // expect TS1192
import * as data from '@freedom/railgun-kohaku-adapter/host/data';
import { validateRailgunPrivateSigningIntent } from '@freedom/railgun-kohaku-adapter/data'; // expect TS2305
declare const input: unknown;
const checked = data.validateRailgunPrivateTransaction(input, input);
checked.digest = '0x00'; // expect TS2540
checked.proofVerified = false; // expect TS2540
const verified: true = checked.proofVerified; // expect TS2322
const proofBytes: { proof: string } = checked; // expect TS2322
data.normalizeRailgunPrivateOffer(input, {
  kind: 'railgun-relay-self-transfer', // expect TS2322
  tree: 0,
  position: 0,
  recipient: '0x00',
});
data.matchRailgunPrivateProvedTransaction(input, input); // expect TS2554
export { host, validateRailgunPrivateSigningIntent, verified, proofBytes };

const recovery = data.normalizeRailgunPrivateRecoveryInput(input, { walletId: 'wallet' });
recovery.signature.R8[0] = '0x00'; // expect TS2540
recovery.capsule.preparation.transaction.data = '0x00'; // expect TS2540
recovery.signature.S = '0x00'; // expect TS2540
const recovered = data.normalizeRailgunPrivateRecoveryResult(input, input);
const proofValid: true = recovered.independentlyVerified; // expect TS2322
const readyToSpend: true = data.normalizeRailgunPrivatePreparation(input, input).spendingEnabled; // expect TS2322
const operation = data.normalizeRailgunPrivateOperation(input, input);
operation.transaction; // expect TS2339
data.normalizeRailgunPrivateRecoveryInput(input); // expect TS2554
import { normalizeRailgunSignature } from '@freedom/railgun-kohaku-adapter/data'; // expect TS2305
import { normalizeRailgunPrivateRecoveryResult } from '@freedom/railgun-kohaku-adapter'; // expect TS2305
export {
  proofValid,
  readyToSpend,
  normalizeRailgunSignature,
  normalizeRailgunPrivateRecoveryResult,
};
