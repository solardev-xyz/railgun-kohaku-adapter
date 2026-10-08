/** Trusted main-process composition only. Structural types do not authenticate
 * contexts, vault loans, scopes, promises or original process handles. Runtime
 * admission requires the genuine same-realm host implementations. No renderer API.
 * Only initializeRailgunMain is a runtime export of this entry. */
import type {
  ReadAsset,
  ReadAmount,
  ReadNote,
} from "./railgun-kohaku-snapshot-contract.js";
import type {
  PrivateInput,
  PrivateUnshieldOptions,
  PrivateSubmissionOutcome,
} from "./railgun-kohaku-private-contract.js";
import type {
  PublicShieldInput,
  PublicShieldAcknowledgement,
} from "./railgun-kohaku-public-contract.js";

/** Original host functions captured once, not an invocation API. The impossible
 * parameter prevents consumers from calling these through this declaration.
 * Their registry-specific values remain opaque; initialization neither mints
 * them nor substitutes structural objects for their runtime identity checks. */
export type CapturedHostOriginal = (
  unavailable: never,
  ...rest: never[]
) => unknown;
export interface PrivacySubject {
  readonly kind: string;
  readonly principal: string;
  readonly chainId: number;
  readonly protocol: string;
  readonly deployment: string;
  readonly role: string;
  readonly operation?: string | null;
}
export interface PrivacyRequirements {
  readonly origin: "tor";
  readonly content: "public" | "pir";
  readonly correctness: "any" | "quorum" | "proof";
  readonly maxAgeMs: number | null;
}
export interface OwnerContextHost {
  getPrivacyContext(
    handle: object,
    chainId?: number,
  ): {
    readonly profileId: string;
    readonly generation: string;
    readonly isolationToken: string;
    readonly subject: PrivacySubject;
    readonly requirements: PrivacyRequirements;
    readonly signal: AbortSignal;
  };
  createPrivacyScope(options: {
    profileId: string;
    signal: AbortSignal;
    isCurrent?: () => boolean;
  }): {
    readonly signal: AbortSignal;
    getContext(
      subject: PrivacySubject,
      requirements?: PrivacyRequirements,
    ): object;
    close(): void;
  };
}
export interface OwnerStorageWorkerInput {
  workerData: {
    profileId: string;
    subject: {
      kind: "private-account";
      principal: `railgun:${number}`;
      chainId: 11155111;
      protocol: "railgun";
      deployment: "sepolia";
      role: "engine";
    };
    requirements: PrivacyRequirements;
    storage: {
      filename: string;
      key: Uint8Array;
      binding: string;
      create: boolean;
      format: "paged-v2";
    };
    revoked: SharedArrayBuffer;
    readOnly?: true;
  };
  /** Exactly the owned 32-byte key ArrayBuffer, transferred without replacement. */
  transferList: [ArrayBuffer];
}
export interface RailgunMainHost {
  context: OwnerContextHost;
  artifacts: {
    createPrivacyArtifactLoader(options: {
      handle: object;
      directory: string;
      manifest: readonly {
        readonly kind: string;
        readonly name: string;
        readonly size: number;
        readonly sha256: string;
      }[];
    }): { load(name: string): Promise<Uint8Array> };
  };
  /** Lowercase SHA-256 of the complete host source-identity inventory. Captured
   * exactly once, before any operational owner algorithm is loaded. */
  sourceIdentity: { readDigest(): string };
  credentials: {
    currentSession(): AbortSignal;
    withMaterial(
      request: {
        handle: object;
        vaultSession: AbortSignal;
        accountIndex: number;
        purpose:
          "storage-root" | "viewing" | "spending-public" | "spending-sign";
        signal: AbortSignal;
      },
      consume: (material: {
        bytes: Uint8Array;
        profileGuard?: object;
      }) => Promise<void>,
    ): Promise<void>;
  };
  platform: {
    applicationLifetime(): AbortSignal;
    spawnUtility(input: {
      entry: "railgun-utility-v1";
      heapMb: number;
    }): object;
    createUtilityChannel(): { port1: object; port2: object };
    memorySamples(): readonly {
      pid: number;
      memory: { workingSetSize: number };
    }[];
    terminateUtility(child: object, signal: "SIGTERM" | "SIGKILL"): unknown;
    spawnStorageWorker(input: OwnerStorageWorkerInput): object;
  };
  profiles: { getActiveProfile(): { id: string; userDataDir: string } };
  sessions: { openPrivacySession: CapturedHostOriginal };
  storage: {
    createPrivacyStorage: CapturedHostOriginal;
    getPrivacyStoragePath: CapturedHostOriginal;
  };
  rpc: {
    assertPrivateRpcDestination: CapturedHostOriginal;
    createPrivateRpc: CapturedHostOriginal;
    createPrivateRpcDestinationConstraint: CapturedHostOriginal;
    createPrivateRpcReadBudget: CapturedHostOriginal;
    getPrivateRpcDestination: CapturedHostOriginal;
    getPrivateRpcDestinationDetails: CapturedHostOriginal;
    getPrivateRpcReadBudgetOutcome: CapturedHostOriginal;
  };
  transport: { createWalletTorTransport: CapturedHostOriginal };
  settings: { isWalletTorExperimentAvailable(): boolean };
  tor: { getWalletSocksEndpoint: CapturedHostOriginal };
  signers: { getSigner: CapturedHostOriginal };
  transactionIntent: {
    transactionIntent: CapturedHostOriginal;
    validIntent: CapturedHostOriginal;
  };
  transactionNetwork: {
    assertPrivateTransactionNetworkDestination: CapturedHostOriginal;
    getPrivateTransactionNetwork: CapturedHostOriginal;
    getPrivateTransactionNetworkDestination: CapturedHostOriginal;
  };
  submissionJournal: {
    getPrivateSubmissionJournal: CapturedHostOriginal;
    readExistingPrivateSubmissionSnapshot: CapturedHostOriginal;
  };
  registry: {
    getNetwork: CapturedHostOriginal;
    getEndpointSources: CapturedHostOriginal;
    getEndpoints: CapturedHostOriginal;
  };
  journalRetention: { validArchive: CapturedHostOriginal };
  transactions: { signAndSendTransaction: CapturedHostOriginal };
  submitter: { readMetadata: CapturedHostOriginal };
}
export interface RailgunRuntime {
  readonly archive: string;
  readonly proverArchive: string;
  readonly artifactDirectory: string;
}
export interface AccountOptions {
  accountIndex: number;
  signal: AbortSignal;
}
export type WalletMode = "active" | "advance" | "new" | "pending";
export interface ReadLaneOptions {
  wallet: WalletMode;
  signal: AbortSignal;
}
/** Native Promise only (not PromiseLike). Only exact true grants consent.
 * Every callback promise MUST settle when its signal/review is cancelled.
 * Cancellation retains exclusion until the original callback has settled.
 * Strict consent gates never assimilate a nonnative thenable: unknown work can
 * quarantine the account until restart. Trusted callback errors carrying an
 * unknown-exit code can likewise self-lock it; this is an availability contract. */
export type Review<Summary> = (
  summary: Summary,
  context: Readonly<{ signal: AbortSignal }>,
) => boolean | Promise<boolean>;
/** Public diagnostic data; never a permit or a receipt. */
export type ReviewData =
  | undefined
  | null
  | string
  | number
  | bigint
  | boolean
  | readonly ReviewData[]
  | { readonly [key: string]: ReviewData };
export interface PublicSubmitter {
  readonly index: number;
  readonly type: string;
  readonly address: string;
}
export type PrivateKind =
  | "railgun-private-transfer"
  | "railgun-token-unshield"
  | "railgun-partial-unshield";
export interface PrivatePreparationReview {
  readonly purpose: "railgun-private-preparation";
  readonly chainId: 11155111;
  readonly operation: PrivateKind;
  readonly asset: { readonly __type: "erc20"; readonly contract: string };
  readonly amount: string;
  readonly recipient: string;
  readonly submitter: string;
  readonly inputType: "Shield" | "Transact";
  readonly selection: {
    readonly noteId: string;
    readonly tree: number;
    readonly position: number;
    readonly checkpointHash: string;
    readonly walletGenerationId: string;
    readonly publicGenerationId: string;
  };
  readonly selectedInputs: 1;
  readonly fullNote: boolean;
  readonly recipientRelationship?: "foreign";
  readonly canonicalDestination?: string;
  readonly destinationVerification?: string;
  readonly foreignOutputPoiDisclosure?: string;
  readonly inputAmount?: string;
  readonly unshieldAmount?: string;
  readonly changeAmount?: string;
  readonly entireInputConsumed?: true;
  readonly changeRecipient?: "same-private-account";
  readonly unshieldAmountIncludesProtocolFee?: true;
  readonly changeRequiresConfirmedScan?: true;
  readonly changeSpendRequiresSeparatePoiSubmission?: true;
  readonly changePoiDisclosure?: string;
  readonly destinations: Readonly<Record<string, string | null>>;
  readonly exposures: Readonly<Record<string, readonly string[]>>;
  readonly privateSigning: true;
  readonly durableSigningHold: true;
  readonly broadcastsTransaction: false;
  readonly broadcastSimulationBeforeTransactionReview: true;
  readonly chainStateVerified: false;
  readonly rpcAdmissionDestinationPinned: true;
  readonly automaticRetry: false;
}
export interface PublicPreparationReview {
  readonly purpose: "railgun-public-shield-preparation";
  readonly operation: "railgun-native-shield";
  readonly chainId: 11155111;
  readonly asset: { readonly __type: "native" };
  readonly amount: string;
  readonly recipient: string;
  readonly funding: PublicSubmitter;
  readonly wrappedAsset: string;
  readonly shieldFeeBps: number;
  readonly protocolFee: string;
  readonly noteValue: string;
  readonly destinations: Readonly<Record<string, string>>;
  readonly exposures: Readonly<Record<string, readonly string[]>>;
  readonly viewingKeyVerification: true;
  readonly privateSpendSigning: false;
  readonly poiQueries: false;
  readonly sourceQueries: false;
  readonly permitsSimulation: true;
  readonly permitsSigning: false;
  readonly broadcastsTransaction: false;
  readonly broadcastSimulationBeforeTransactionReview: true;
  readonly rpcAdmissionDestinationPinned: true;
  readonly chainStateVerified: false;
  readonly automaticRetry: false;
}
/** Original transaction reviewer projection, forwarded unchanged. Fields are
 * detached public transaction/simulation data, not a transaction owner token. */
export interface TransactionReview {
  readonly transaction: Readonly<Record<string, ReviewData>>;
  readonly from: string;
  readonly expiresAt: number;
  readonly unsignedSerialized: string;
  readonly intent: Readonly<Record<string, ReviewData>>;
  readonly operation: PrivateKind | "railgun-native-shield";
  readonly maxGasFee: bigint;
  readonly fundingAddressPublic: true;
  readonly chainStateVerified: false;
  readonly recipientRelationship?: "foreign";
  readonly canonicalDestination?: string;
  readonly amount?: bigint;
  readonly protocolFee?: bigint;
  readonly noteValue?: bigint;
  readonly noteCommitment?: string;
  readonly recipient?: string;
}
export interface GasBudget {
  gasLimit: bigint;
  maxGasFee: bigint;
}
export interface PrivateLaneOptions extends ReadLaneOptions, GasBudget {
  reviewPreparation: Review<PrivatePreparationReview>;
  reviewTransaction: Review<TransactionReview>;
}
export interface PublicLaneOptions extends ReadLaneOptions, GasBudget {
  reviewPreparation: Review<PublicPreparationReview>;
  reviewTransaction: Review<TransactionReview>;
}
export interface LaneLifetime {
  readonly signal: AbortSignal;
  readonly closed: Promise<void>;
  close(): void;
}
export interface ReadLane extends LaneLifetime {
  instanceId(): Promise<string>;
  balance(assets?: readonly ReadAsset[]): Promise<readonly ReadAmount[]>;
  notes(
    assets?: readonly ReadAsset[],
    includeSpent?: boolean,
  ): Promise<readonly ReadNote[]>;
}
/** Empty frozen runtime tokens, bound by private WeakMaps to one genuine lane.
 * The nominal properties exist only in the type system. */
export interface PrivatePreparedHandle {
  readonly __privatePreparedHandle: unique symbol;
}
export interface PublicPreparedHandle {
  readonly __publicPreparedHandle: unique symbol;
}
export interface PrivateLane extends ReadLane {
  prepareTransfer(
    value: PrivateInput,
    to: string,
  ): Promise<Readonly<{ handle: PrivatePreparedHandle }>>;
  prepareUnshield(
    value: PrivateInput,
    to: `0x${string}`,
    options?: PrivateUnshieldOptions,
  ): Promise<Readonly<{ handle: PrivatePreparedHandle }>>;
  broadcast(handle: PrivatePreparedHandle): Promise<PrivateSubmissionOutcome>;
}
export interface PublicLane extends ReadLane {
  prepareShield(
    value: PublicShieldInput,
    to?: string,
  ): Promise<Readonly<{ handle: PublicPreparedHandle }>>;
  submit(handle: PublicPreparedHandle): Promise<PublicShieldAcknowledgement>;
}
export interface RecoveryDisclosureReview {
  readonly purpose: "railgun-recovered-private-submission";
  readonly chainId: 11155111;
  readonly operation: PrivateKind;
  readonly submitter: string;
  readonly recipient: string;
  readonly recipientRelationship?: "foreign";
  readonly foreignOutputPoiDisclosure?: string;
  readonly selection: {
    readonly noteId: string;
    readonly originalCheckpointHash: string;
  };
  readonly destinations: Readonly<Record<string, string>>;
  readonly exposures: Readonly<Record<string, readonly string[]>>;
  readonly requiredList: string;
  readonly inputCreatorDeterminedByCompletedWallet: true;
  readonly originalSpendingSignatureReused: true;
  readonly newSpendingSignature: false;
  readonly eoaSigningAndBroadcast: true;
  readonly simulationBeforeTransactionReview: true;
  readonly automaticRetry: false;
  readonly chainStateVerified: false;
}
export interface RecoveryOptions extends GasBudget {
  signal: AbortSignal;
  /** This original recovery callback receives the signal itself, not {signal}. */
  reviewDisclosures(
    summary: RecoveryDisclosureReview,
    signal: AbortSignal,
  ): boolean | Promise<boolean>;
  /** Original recovery transaction callback receives only the summary. */
  reviewTransaction(summary: TransactionReview): boolean | Promise<boolean>;
}
export type RecoverySubmissionOutcome =
  | Exclude<PrivateSubmissionOutcome, { status: "recovery-required" }>
  | {
      readonly status: "recovery-required";
      readonly stage: string;
      readonly sourceOutcome?: Readonly<Record<string, ReviewData>>;
    };
export interface RecoveryHistory {
  readonly records: readonly {
    readonly holdId: string;
    readonly kind: PrivateKind;
    readonly localState:
      | "signed-unfinished"
      | "proof-present"
      | "signature-unavailable"
      | "capsule-unavailable";
  }[];
  readonly nextAfter: string | null;
  readonly totalSigning: number;
}
export type PrivateProofRecoveryOutcome =
  | {
      /** proof-present checks an existing saved slot; it does not reprove,
       * freshly verify, or grant submission authority. */
      readonly status: "proof-stored" | "proof-present";
      readonly holdId: string;
      readonly transactionDigest: string;
      readonly submissionEnabled: false;
    }
  | {
      readonly status: "recovery-required" | "refused";
      readonly stage: string;
      readonly holdId?: string;
      readonly submissionEnabled: false;
    };
export interface RecoveryLane extends LaneLifetime {
  history(after?: string | null): Promise<RecoveryHistory>;
  resumeProof(holdId: string): Promise<PrivateProofRecoveryOutcome>;
  submitStored(holdId: string): Promise<RecoverySubmissionOutcome>;
}
export interface RelayQuote {
  data: string;
  signature: string;
}
export interface RelayGas {
  transactionType: 0;
  gasEstimate: string;
  gasPrice: string;
  minGasPrice: string;
}
export interface RelayRequest {
  noteId: string;
  quote: RelayQuote;
  gas: RelayGas;
  maxFee: string;
  signal: AbortSignal;
}
export interface RelayIdentity {
  readonly address: string;
  readonly masterPublicKey: string;
  readonly viewingPublicKey: string;
}
export interface RelayReview {
  readonly purpose: "railgun-relay-unsigned-review-v1";
  readonly chainId: 11155111;
  readonly proxy: string;
  readonly token: string;
  readonly walletId: string;
  readonly self: RelayIdentity;
  readonly peer: RelayIdentity;
  readonly amounts: {
    readonly input: string;
    readonly fee: string;
    readonly self: string;
    readonly cap: string;
  };
  readonly gas: Readonly<RelayGas> & {
    readonly gasLimitMultiplierBps: 12000;
    readonly multiplierDenominator: 10000;
    readonly rate: string;
    readonly rateDenominator: "1000000000000000000";
    readonly gasLimit: string;
    readonly maximumGasWei: string;
  };
  readonly quote: {
    readonly quoteSha256: string;
    readonly signedBytesSha256: string;
    readonly expiresAt: number;
    readonly requiredPOIListKeys: readonly string[];
  };
  readonly selection: {
    readonly noteId: string;
    readonly tree: number;
    readonly position: number;
    readonly noteHash: string;
  };
  readonly state: {
    readonly checkpointHash: string;
    readonly walletGenerationId: string;
    readonly publicIdentity: {
      readonly generationId: string;
      readonly sourceId: string;
      readonly publicId: string;
    };
  };
  readonly bindings: {
    readonly intentDigest: string;
    readonly draftDigest: string;
    readonly calldataSha256: string;
    readonly reconstructedExpectedHash: string;
  };
  readonly gasEstimateVerified: false;
  readonly operatorTrusted: false;
  readonly reservationsChecked: false;
  readonly capsulePersisted: false;
  readonly signingEnabled: false;
  readonly proofAuthority: false;
  readonly poiQueriesPermitted: false;
  readonly relaySendPermitted: false;
}
export interface RelayDisclosureReview {
  readonly purpose: "railgun-relay-selected-input-disclosure-v1";
  readonly draftDigest: string;
  readonly summaryDigest: string;
  readonly listKey: string;
  readonly input: {
    readonly id: string;
    readonly noteHash: string;
    readonly nullifier: string;
    readonly blindedCommitment: string;
    readonly type: "Shield" | "Transact";
  };
  readonly disclosures: readonly [
    "selected-poi-membership",
    "selected-nullifier-status",
  ];
  readonly signingEnabled: false;
  readonly relaySendPermitted: false;
}
export interface RelayStagingReview {
  readonly purpose: "railgun-relay-transact-staging-disclosure-v1";
  readonly service: "sepolia-ppoi-fdi";
  readonly queries: readonly [
    { readonly method: "latestTxid" },
    {
      readonly method: "validateTxidRoot";
      readonly tree: 0;
      readonly pointSource: "authenticated-existing-txid-checkpoint";
      readonly exactPointAvailableBeforeOpen: false;
    },
  ];
  readonly publicCreatorSelection: {
    readonly transactionHash: string;
    readonly blockNumber: number;
  };
  readonly canonicalPublicSnapshotRefresh: true;
  readonly publicCreatorSourceVisit: true;
  readonly selectedMembershipPermitted: false;
  readonly selectedNullifierQueryPermitted: false;
  readonly signingEnabled: false;
  readonly relaySendPermitted: false;
}
export interface RelayRootReview {
  readonly purpose: "railgun-relay-selected-root-disclosure-v1";
  readonly draftDigest: string;
  readonly summaryDigest: string;
  readonly checkpointHash: string;
  readonly creatorEvidenceSha256: string;
  readonly witnessInputSha256: string;
  readonly service: "sepolia-ppoi-fdi";
  readonly queries: readonly [
    { readonly method: "latestTxid" },
    {
      readonly method: "validateTxidRoot";
      readonly params: {
        readonly tree: 0;
        readonly index: number;
        readonly root: string;
      };
    },
  ];
  readonly signingEnabled: false;
  readonly relaySendPermitted: false;
}
export interface RelayLocalOptions extends ReadLaneOptions {
  review: Review<RelayReview>;
  reviewDisclosure: Review<RelayDisclosureReview>;
  reviewStagingDisclosure: Review<RelayStagingReview>;
  reviewRootDisclosure: Review<RelayRootReview>;
}
export type RelayRefusal = {
  readonly status: "refused";
  readonly stage: string;
  readonly operationId?: string;
};
export type RelayReady = {
  readonly status: "ready-local";
  readonly operationId: string;
};
export type RelayLocalOutcome =
  | RelayReady
  | RelayRefusal
  | {
      readonly status: "recovery-required";
      readonly stage: string;
      readonly operationId: string;
      readonly signingAttempted: boolean;
      readonly signatureSaved: boolean;
    }
  | {
      readonly status: "refused";
      readonly stage: string;
      readonly originalAccountReusable: boolean;
    };
export interface RelayLocalLane extends LaneLifetime {
  prepare(request: RelayRequest): Promise<RelayLocalOutcome>;
}
export interface RelayHistory {
  readonly records: readonly {
    readonly operationId: string;
    readonly reservationState:
      "held" | "signing-local" | "cancelled-unsigned" | "discarded-signed";
    readonly localState:
      | "held"
      | "signing-local"
      | "signed"
      | "ready-local"
      | "cancelled-unsigned"
      | "discarded-signed"
      | "record-unavailable";
    readonly interruptedStep: string | null;
  }[];
  readonly nextAfter: string | null;
}
export interface RelayRecoveryLane extends LaneLifetime {
  list(after?: string | null): Promise<RelayHistory | RelayRefusal>;
  resume(operationId: string): Promise<RelayReady | RelayRefusal>;
  discard(operationId: string): Promise<
    | {
        readonly status: "cancelled-unsigned" | "discarded-signed";
        readonly operationId: string;
      }
    | RelayRefusal
  >;
}
export type TxidMode = "initialize" | "advance" | "checkpoint";
export interface TxidDisclosureReview {
  readonly purpose: "railgun-public-txid-synchronization-disclosure-v1";
  readonly mode: TxidMode;
  readonly chainId: 11155111;
  readonly txidVersion: "V2_PoseidonMerkle";
  readonly queries: readonly (
    | {
        readonly method: "latestTxid";
        readonly wireMethod: "ppoi_validated_txid";
        readonly endpoint: string;
      }
    | {
        readonly method: "validateTxidRoot";
        readonly wireMethod: "ppoi_validate_txid_merkleroot";
        readonly endpoint: string;
        readonly tree: 0;
        readonly pointSource: "authenticated-local-checkpoint-or-computed-public-page";
        readonly exactPointAvailableBeforeOpen: false;
      }
    | {
        readonly method: "txidPage";
        readonly wireMethod: "RailgunPublicTxids";
        readonly endpoint: string;
        readonly maximumPageRows: 100;
        readonly cursorSource: "authenticated-local-public-txid-state";
        readonly exactCursorAvailableBeforeOpen: false;
      }
  )[];
  readonly createIfMissing: boolean;
  readonly maximumAdvancePages: 0 | 1;
  readonly mayResumeAuthenticatedPendingPage: boolean;
  readonly selectedMembershipPermitted: false;
  readonly selectedNullifierQueryPermitted: false;
  readonly signingEnabled: false;
  readonly relaySendPermitted: false;
}
export interface TxidDiagnostic {
  readonly count: number;
  readonly root: string | null;
  readonly checkpointAvailable: boolean;
  readonly capacityReached: boolean;
  readonly serviceLatestIndex: number | null;
  readonly pending: false;
  readonly unverified: true;
  readonly spendingEnabled: false;
}
export interface AccountSession {
  describe(): Readonly<{
    accountIndex: number;
    instanceId: string;
    chainId: 11155111;
    deployment: "sepolia";
  }>;
  advancePublic(range: {
    to: number;
    anchor: { number: number; hash: string };
  }): Promise<
    Readonly<{
      status: "applied-unverified" | "unscanned";
      to: { number: number; hash: string } | null;
    }>
  >;
  rebuildPublic(): Promise<
    Readonly<{ status: "public-cache-open"; mode: "new" }>
  >;
  resumePublic(): Promise<
    Readonly<{ status: "public-cache-open"; mode: "pending" }>
  >;
  synchronizeTxid(options: {
    mode: TxidMode;
    signal: AbortSignal;
    reviewDisclosure: Review<TxidDisclosureReview>;
  }): Promise<TxidDiagnostic>;
  openRead(options: ReadLaneOptions): Promise<ReadLane>;
  openPrivate(options: PrivateLaneOptions): Promise<PrivateLane>;
  openPublic(options: PublicLaneOptions): Promise<PublicLane>;
  openRecovery(options: RecoveryOptions): Promise<RecoveryLane>;
  openRelayLocal(options: RelayLocalOptions): Promise<RelayLocalLane>;
  openRelayRecovery(options: {
    signal: AbortSignal;
  }): Promise<RelayRecoveryLane>;
  readonly signal: AbortSignal;
  readonly closed: Promise<void>;
  close(): Promise<void>;
}
export interface RailgunMain {
  createAccount(options: AccountOptions): Promise<AccountSession>;
  openAccount(options: AccountOptions): Promise<AccountSession>;
}
/** Once per realm; exact data properties only. Invalid options may throw before
 * returning a promise. No key, raw store, receipt, module getter or policy override.
 * createAccount is explicit fresh cooperative enrollment; openAccount never creates.
 * Closing revokes and waits for original work; the account fence lasts to main exit. */
export function initializeRailgunMain(options: {
  host: RailgunMainHost;
  runtime: RailgunRuntime;
}): RailgunMain;
