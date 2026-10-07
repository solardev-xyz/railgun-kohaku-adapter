/** Trusted-host POI/TXID data. Inputs must already belong to the caller's
 * authenticated context. Raw errors and legacy input handling are preserved;
 * this is not the safe /data boundary. Readonly views do not grant authority.
 * Crypto and read callbacks remain caller-owned, with caller-owned effects. */
import type { RailgunDataHex, RailgunPrivateCapsule } from './data.js';
export const REQUIRED_LIST: 'efc6ddb59c098a13fb2b618fdae94c1c3a807abc8fb1837c93620c9143ee9e88';
export const MAX_NOTES: 3;
export const POI_LAUNCH_BLOCK: 5944700;
export type RailgunPoiNote = Readonly<{
  blindedCommitment: RailgunDataHex;
  type: 'Shield' | 'Transact';
}>;
/** These path fields are canonical unprefixed hex, not branded authority. */
export type RailgunPoiProof = Readonly<{
  leaf: string;
  elements: readonly string[];
  indices: string;
  root: string;
}>;
export type RailgunPoiPayload = Readonly<{
  listKey: typeof REQUIRED_LIST;
  proof: Readonly<{
    pi_a: readonly [string, string];
    pi_b: readonly [readonly [string, string], readonly [string, string]];
    pi_c: readonly [string, string];
  }>;
  poiMerkleroots: readonly [string];
  txidMerkleroot: string;
  txidMerklerootIndex: number;
  blindedCommitmentsOut: readonly [] | readonly [RailgunDataHex];
  railgunTxidIfHasUnshield: RailgunDataHex;
}>;
export type RailgunPoiSubmission = Readonly<{
  version: 1;
  endpoint: 'https://ppoi.fdi.network';
  requestId: number;
  payload: RailgunPoiPayload;
  payloadSha256: string;
  body: string;
  bodySha256: string;
}>;
export type RailgunPoiResponseDiagnostic = Readonly<{
  classification:
    'unavailable' | 'http-failure' | 'malformed' | 'unmatched' | 'rpc-error' | 'rpc-result';
  httpStatus: number | null;
  responseBytes: number;
  matchingEnvelope: boolean;
  transportAuthenticated: false;
  acceptanceVerified: false;
  disclosureEnabled: false;
  spendingEnabled: false;
}>;
export type RailgunTxidContinuity = Readonly<{
  status: 'known-service-omission' | 'unbroken-observed-stream';
  globalTxidCompleteness: false;
  knownServiceOmissions: readonly Readonly<Record<string, unknown>>[];
}>;
export type RailgunTxidState = Readonly<{
  version: 1;
  count: number;
  root: string;
  after: string;
  verificationHash: string | null;
  branches: readonly (string | null)[];
  breaks: readonly Readonly<Record<string, unknown>>[];
  transcript: string;
}>;
export type RailgunTxidWitness = Readonly<{
  row: Readonly<Record<string, unknown>>;
  leaf: string;
  railgunTxid: string;
  rowSha256: string;
  index: number;
  elements: readonly string[];
  root: string;
  checkpointIndex: number;
  transcript: string;
  continuity: RailgunTxidContinuity;
  globalTxidCompleteness: false;
}>;
export type RailgunNoteTxidWitness = Readonly<{
  note: Readonly<Record<string, unknown>>;
  outputIndex: number;
  witness: RailgunTxidWitness;
  ownershipVerified: false;
  eventCoverageVerified: false;
  rootAccepted: false;
  spendingEnabled: false;
}>;
export type RailgunTxidProjection = Readonly<{
  empty(): RailgunTxidState;
  inspect(value: unknown): RailgunTxidState;
  append(
    previous: unknown,
    rows: readonly unknown[],
    read: (key: string) => unknown | Promise<unknown>
  ): Promise<
    Readonly<{
      state: RailgunTxidState;
      writes: readonly Readonly<{ key: string; value: string }>[];
    }>
  >;
  witness(
    state: unknown,
    txid: string,
    read: (key: string) => unknown | Promise<unknown>
  ): Promise<RailgunTxidWitness>;
  historicalRoot(
    state: unknown,
    index: number,
    read: (key: string) => unknown | Promise<unknown>
  ): Promise<
    Readonly<{
      version: 1;
      tree: 0;
      index: number;
      root: string;
      checkpointIndex: number;
      checkpointRoot: string;
      transcript: string;
      localPrefixComputed: true;
      globalTxidCompleteness: false;
      ownershipVerified: false;
      eventCoverageVerified: false;
      rootAccepted: false;
      spendingEnabled: false;
    }>
  >;
  inspectRecord(text: unknown): Readonly<{
    row: Readonly<Record<string, unknown>>;
    leaf: string;
    railgunTxid: string;
    rowSha256: string;
  }>;
  verifyWitness(state: unknown, witness: unknown): RailgunTxidWitness;
}>;
export type RailgunOwnedPoiRecord = Readonly<{
  id: string;
  hash: RailgunDataHex;
  txid: RailgunDataHex;
  npk: RailgunDataHex;
  nullifier: RailgunDataHex;
  blindedCommitment: RailgunDataHex;
  type: 'Shield' | 'Transact';
  blockNumber: number;
}>;
export type RailgunOwnPoiShape = Readonly<{
  kind: RailgunPrivateCapsule['selection']['kind'];
  capsuleVersion: 1 | 2;
  outputCount: 0 | 1;
  hasPrivateOutput: boolean;
  hasUnshield: boolean;
  selectorDomain: 'freedom:railgun:own-selector-v1\0' | 'freedom:railgun:own-selector-v2\0';
}>;
export type RailgunPoiShieldFacts = Readonly<{
  npk: RailgunDataHex;
  token: RailgunDataHex;
  value: string;
  tree: number;
  position: number;
  noteHash: RailgunDataHex;
}>;
export function normalizePoiNotes(input: unknown): readonly RailgunPoiNote[];
export function normalizePoiStatuses(
  input: unknown,
  notes: unknown
): readonly Readonly<
  RailgunPoiNote & { status: 'Valid' | 'ShieldBlocked' | 'ProofSubmitted' | 'Missing' }
>[];
export function normalizePoiProofs(input: unknown, notes: unknown): readonly RailgunPoiProof[];
/** Verifies only against supplied roots and the supplied hash function. */
export function verifyPoiMembership(
  input: unknown,
  notes: unknown,
  hashPair: (left: string, right: string) => string
): readonly RailgunPoiProof[];
/** Verifies the pinned list signature; its message omits chain and root. */
export function verifyPoiEvent(
  input: unknown,
  note: unknown,
  proof: unknown
): Readonly<{
  signedPOIEvent: Readonly<{
    index: number;
    blindedCommitment: string;
    signature: string;
    type: 'Shield' | 'Transact';
  }>;
  validatedMerkleroot: string;
}>;
export function normalizeRailgunPoiPayload(value: unknown): RailgunPoiPayload;
export function bindRailgunOwnPoiPayload(value: unknown, expected: unknown): RailgunPoiPayload;
export function assertRailgunPoiCreatorEvents(
  options: unknown
): Readonly<{ events: readonly Readonly<Record<string, unknown>>[]; hasUnshield: boolean }>;
export function normalizeRailgunPoiCreatorWitness(
  options: unknown
): Readonly<{ noteWitness: RailgunNoteTxidWitness; hasUnshield: boolean }>;
export function assertRailgunPoiCreatorVerification(options: unknown): RailgunNoteTxidWitness;
export function normalizeRailgunPoiShieldFacts(input: unknown): RailgunPoiShieldFacts;
export function normalizeRailgunPoiShieldInput(
  capsule: unknown,
  creator: unknown
): Readonly<{ facts: RailgunPoiShieldFacts; bindingDigest: string }>;
export function prepareRailgunPoiTransactSelectorInput(input: unknown): Readonly<{
  archive: string;
  descriptor: Readonly<Record<string, unknown>>;
  capsule: RailgunPrivateCapsule;
  creator: Readonly<Record<string, unknown>>;
  bindingDigest: string;
}>;
export function normalizeRailgunPoiTransactSelectorInput(
  input: unknown
): ReturnType<typeof prepareRailgunPoiTransactSelectorInput>;
export function assertRailgunOwnPoiCapture(current: unknown, baseline: unknown): void;
export function assertRailgunOwnPoiStableCapture(current: unknown, baseline: unknown): void;
export function getRailgunOwnPoiShape(capsule: unknown): RailgunOwnPoiShape;
export function assertRailgunOwnPoiPayloadShape(payload: unknown, capsule: unknown): void;
/** Caller supplies its authenticated engine functions. Runtime returns a plain
 * object here; the readonly declaration is a consumer view, not a freeze claim. */
export function projectRailgunOwnedPoiRecord(
  txo: unknown,
  leaf: unknown,
  runtime: unknown,
  derivedNullifier: unknown
): RailgunOwnedPoiRecord;
export function normalizeRailgunOwnedPoiRecords(
  input: unknown,
  read: unknown,
  checkpoint: unknown
): readonly RailgunOwnedPoiRecord[];
export function prepareRailgunPoiSubmission(input: unknown): RailgunPoiSubmission;
export function normalizeRailgunPoiSubmission(input: unknown): RailgunPoiSubmission;
/** Response evidence requires a real Node Buffer, checked at runtime. No body
 * content escapes these diagnostics and no response grants safe retry. */
export function inspectRailgunPoiResponse(input: unknown): RailgunPoiResponseDiagnostic;
export function findRailgunNoteTxidWitness(options: unknown): Promise<RailgunNoteTxidWitness>;
export function normalizeRailgunTxidWitness(
  value: unknown,
  state: unknown,
  txid?: string
): RailgunTxidWitness;
export function normalizeRailgunNoteTxidWitness(
  value: unknown,
  state: unknown,
  note: unknown
): RailgunNoteTxidWitness;
export function createRailgunTxidProjection(
  options: Readonly<{
    hashPair: (left: string, right: string) => string;
    transactionHash: (row: unknown) => Readonly<{ hash: string; railgunTxid: string }>;
    verificationHash: (previous: string | undefined, firstNullifier: string) => string;
    zeroNodes: readonly string[];
  }>
): RailgunTxidProjection;
/** Validates and returns the original object, with no copy or freezing. */
export function validateRailgunTxidRow<T>(value: T): T;
export function classifyRailgunTxidContinuity(
  lastIndex: number,
  breaks: unknown
): RailgunTxidContinuity;
