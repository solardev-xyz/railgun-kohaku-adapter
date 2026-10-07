import poi = require('@freedom/railgun-kohaku-adapter/host/poi');
import type { RailgunPoiPayload as OtherPayload } from '@freedom/railgun-kohaku-adapter/host/poi' with {
  'resolution-mode': 'import',
};
declare const input: unknown;
const payload: OtherPayload = poi.normalizeRailgunPoiPayload(input);
const blinded: readonly [] | readonly [`0x${string}`] = payload.blindedCommitmentsOut;
const submission = poi.prepareRailgunPoiSubmission({ payload, requestId: 1 });
const diagnostic = poi.inspectRailgunPoiResponse({ submission, evidence: input });
const disabled: false = diagnostic.disclosureEnabled;
const proofs = poi.verifyPoiMembership(input, input, (left, _right) => left);
const event = poi.verifyPoiEvent(input, input, input);
const projection = poi.createRailgunTxidProjection({
  hashPair: (left, _right) => left,
  transactionHash: (_row) => ({ hash: '', railgunTxid: '' }),
  verificationHash: (_previous, first) => first,
  zeroNodes: [],
});
const state = projection.empty();
const writes = projection.append(state, [], async (_key) => null);
const shape = poi.getRailgunOwnPoiShape(input);
const continuity = poi.classifyRailgunTxidContinuity(0, []);
const incomplete: false = continuity.globalTxidCompleteness;
const observed = poi.normalizeRailgunNoteTxidWitness(input, state, input);
const unowned: false = observed.ownershipVerified;
export {
  payload,
  blinded,
  diagnostic,
  disabled,
  proofs,
  event,
  writes,
  shape,
  incomplete,
  unowned,
};
