import data = require('@freedom/railgun-kohaku-adapter/data');
import type { RailgunPartialUnshieldCapsule, RailgunTransferCapsule, RailgunCapsuleTransaction } from '@freedom/railgun-kohaku-adapter/data';
declare const input: unknown;
const result = data.normalizeRailgunPrivateCapsule(input);
result.walletId = 'changed'; // expect TS2540
result.selection.tree = 2; // expect TS2540
result.preparation.transaction.data = '0x00'; // expect TS2540
result.preparation.expected.nullifier = '0x00'; // expect TS2540
result.pathElements.push('0x00'); // expect TS2339
data.railgunPrivateCapsuleCompatibility.digestDomains[0] = 'freedom:railgun:private-capsule-v1\0'; // expect TS2540
data.railgunPrivateCapsuleCompatibility.supported[0].version = 2; // expect TS2540
const proof: true = data.railgunPrivateCapsuleCompatibility.proofVerified; // expect TS2322
const signed: { signature: string } = result; // expect TS2322
const amount: string = result.preparation.amount; // expect TS2339
declare const transfer: RailgunTransferCapsule;
declare const partial: RailgunPartialUnshieldCapsule;
const wrongVersion: RailgunPartialUnshieldCapsule = transfer; // expect TS2322
const wrongKind: RailgunTransferCapsule = partial; // expect TS2322
const wrongChain: RailgunCapsuleTransaction = { chainId: 1, to: '0x00', value: '0', data: '0x00' }; // expect TS2322
const nonzero: RailgunCapsuleTransaction = { chainId: 11155111, to: '0x00', value: '1', data: '0x00' }; // expect TS2322
data.normalizeRailgunPrivateCapsule(); // expect TS2554
data.digestRailgunPrivateCapsule(input, {}); // expect TS2554
export { proof, signed, amount, wrongVersion, wrongKind, wrongChain, nonzero };
