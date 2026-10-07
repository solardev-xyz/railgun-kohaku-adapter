import host from '@freedom/railgun-kohaku-adapter/host/data'; // expect TS1192
import * as data from '@freedom/railgun-kohaku-adapter/host/data';
import { validateRailgunPrivateSigningIntent } from '@freedom/railgun-kohaku-adapter/data'; // expect TS2305
declare const input: unknown;
const checked = data.validateRailgunPrivateTransaction(input, input);
checked.digest = '0x00'; // expect TS2540
checked.proofVerified = false; // expect TS2540
const verified: true = checked.proofVerified; // expect TS2322
const proofBytes: { proof: string } = checked; // expect TS2322
data.normalizeRailgunPrivateOffer(input, { kind: 'railgun-relay-self-transfer', tree: 0, position: 0, recipient: '0x00' }); // expect TS2322
data.matchRailgunPrivateProvedTransaction(input, input); // expect TS2554
export { host, validateRailgunPrivateSigningIntent, verified, proofBytes };
