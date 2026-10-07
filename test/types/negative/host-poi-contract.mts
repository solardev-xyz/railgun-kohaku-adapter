import poi from '@freedom/railgun-kohaku-adapter/host/poi'; // expect TS1192
import * as data from '@freedom/railgun-kohaku-adapter/host/poi';
import { normalizeRailgunPoiPayload } from '@freedom/railgun-kohaku-adapter/data'; // expect TS2305
import { createRailgunTxidProjection } from '@freedom/railgun-kohaku-adapter'; // expect TS2305
import raw from '@freedom/railgun-kohaku-adapter/src/data/railgun-poi-payload'; // expect TS2307
declare const input: unknown;
const payload = data.normalizeRailgunPoiPayload(input);
payload.proof.pi_b[0][0] = '2'; // expect TS2540
payload.blindedCommitmentsOut.push('0x01'); // expect TS2339
payload.txidMerklerootIndex = 2; // expect TS2540
const diagnostic = data.inspectRailgunPoiResponse(input);
const enabled: true = diagnostic.disclosureEnabled; // expect TS2322
const accepted: true = diagnostic.acceptanceVerified; // expect TS2322
diagnostic.spendingEnabled = false; // expect TS2540
const witness = data.normalizeRailgunNoteTxidWitness(input, input, input);
const owned: true = witness.ownershipVerified; // expect TS2322
witness.witness.elements[0] = ''; // expect TS2542
data.verifyPoiMembership(input, input); // expect TS2554
data.assertRailgunOwnPoiPayloadShape(input); // expect TS2554
export {
  poi,
  normalizeRailgunPoiPayload,
  createRailgunTxidProjection,
  raw,
  enabled,
  accepted,
  owned,
};
