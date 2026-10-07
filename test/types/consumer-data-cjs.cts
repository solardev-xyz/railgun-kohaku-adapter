// Compile-only: structural data supplies no operation or host capability.
import data = require('@freedom/railgun-kohaku-adapter/data');
import type { RailgunPrivateCapsule, RailgunDataHex } from '@freedom/railgun-kohaku-adapter/data';
import type { RailgunPrivateCapsule as EsmCapsule } from '@freedom/railgun-kohaku-adapter/data' with {
  'resolution-mode': 'import',
};

declare const untrusted: unknown;
const capsule: RailgunPrivateCapsule = data.normalizeRailgunPrivateCapsule(untrusted);
const same: EsmCapsule = capsule;
const digest: string = data.digestRailgunPrivateCapsule(same);
const path: readonly RailgunDataHex[] = capsule.pathElements;
const chain: 11155111 = capsule.preparation.transaction.chainId;
const zero: '0' = capsule.preparation.transaction.value;
const version: 1 | 2 = capsule.version;
const compatibility = data.railgunPrivateCapsuleCompatibility;
const policy: 'freedom-sepolia-qualification' = compatibility.policy;
const proxy: string = compatibility.proxy;
const bound: string = compatibility.maxQualificationAmount;
const domains: readonly [
  'freedom:railgun:private-capsule-v1\0',
  'freedom:railgun:private-capsule-v2\0',
] = compatibility.digestDomains;
const refused: 'refused' = compatibility.unknownFields;
const noAuthority: readonly false[] = [
  compatibility.proofVerified,
  compatibility.ownershipVerified,
  compatibility.spendingEnabled,
];
if (capsule.version === 2) {
  const partial: 'railgun-partial-unshield' = capsule.selection.kind;
  const change: string = capsule.preparation.changeAmount;
  void [partial, change];
}
export {
  same,
  digest,
  path,
  chain,
  zero,
  version,
  policy,
  proxy,
  bound,
  domains,
  refused,
  noAuthority,
};
