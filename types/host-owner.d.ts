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
/** Opening an existing account. Without publicCache only an active public
 * generation of the current source policy opens. After a package source change
 * none exists: "new" begins a fresh generation exactly as rebuildPublic and
 * "pending" resumes an interrupted one as resumePublic. Reads, lanes and
 * recovery keep their completed-public requirements; advance ranges first. */
export interface OpenAccountOptions extends AccountOptions {
  publicCache?: "new" | "pending";
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
  readonly index: 0;
  readonly type: "mnemonic";
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
/** Read-only disclosure inventories. Neither summary is an authorization receipt. */
export interface PoiPreparationDisclosure {
  readonly purpose: "railgun-retained-poi-facade-disclosure-v1";
  readonly operation:
    | "prepare-shield"
    | "prepare-transact"
    | "recover-output"
    | "recover-attempted-output";
  readonly chainId: 11155111;
  readonly selection: string;
  readonly destinationSource: "authenticated-account-public-destination";
  readonly endpoints: {
    readonly poi: "https://ppoi.fdi.network";
    readonly indexer: string;
  };
  readonly exposures: readonly string[];
  readonly exactServiceValuesAvailableBeforeAuthenticatedOpen: false;
  readonly mayDiscloseBeforeCreatorTypeMismatchEstablished: true;
  readonly spendingSigningEnabled: false;
  readonly transactionBroadcastEnabled: false;
  readonly poiSubmissionEnabled: false;
}
export interface PoiSubmissionDisclosure {
  readonly version: 1;
  readonly purpose: "validate-retained-poi" | "submit-retained-poi";
  readonly protocol: "railgun";
  readonly deployment: "sepolia";
  readonly chainId: 11155111;
  readonly accountIndex: number;
  readonly listKey: string;
  readonly txidVersion: "V2_PoseidonMerkle";
  readonly operation: "transfer" | "unshield" | "partial-unshield";
  readonly outputCount: number;
  readonly unshieldIdCategory: "railgun-txid" | "absent";
  readonly disclosureExplanation?: string;
  readonly destinations: readonly {
    readonly role: "poi-service" | "source-rpc" | "receipt-rpc";
    readonly origin: string;
  }[];
  readonly requestInventory: readonly {
    readonly method: string;
    readonly maxRequests: number;
  }[];
  readonly disclosureCategories: readonly string[];
  readonly uncertaintyCategories: readonly string[];
  readonly requestIdAllocation: "local-time-once-at-durable-attempt";
  readonly consentGranted: false;
  readonly transportAuthorized: false;
  readonly requestLimitsEnforced: false;
}
export type PoiRefusal = Readonly<{ status: "refused"; stage: string }>;
export type PoiPreparationOutcome =
  | PoiRefusal
  | Readonly<{
      status: "prepared";
      capsuleDigest: string;
      payloadSha256: string;
      revision: number;
      proofAuthenticated: false;
      disclosureEnabled: false;
      spendingEnabled: false;
    }>;
export type PoiSubmissionOutcome = Readonly<{
  status: "refused" | "recovery-required";
  stage: string;
  sourceOutcome?: Readonly<Record<string, ReviewData>>;
  response?: Readonly<{
    classification: string;
    httpStatus: number | null;
    responseBytes: number;
    matchingEnvelope: boolean;
    transportAuthenticated: false;
    acceptanceVerified: false;
    disclosureEnabled: false;
    spendingEnabled: false;
    /** Redacted closed error category; diagnostic only, never acceptance or retry authority. */
    diagnostic: Readonly<{
      envelope: 'matched-id' | 'other-id' | 'invalid';
      rpcCode:
        | 'parse-error'
        | 'invalid-request'
        | 'method-not-found'
        | 'invalid-params'
        | 'internal-error'
        | 'server-error'
        | 'other'
        | null;
      messageCategory:
        | 'invalid-params'
        | 'invalid-proof'
        | 'invalid-txid-merkleroot'
        | 'poi-merkleroots-missing'
        | 'execution-error-hidden'
        | 'internal-server-error'
        | 'method-not-found'
        | 'invalid-list-key'
        | 'other'
        | null;
      dataCategory: 'none' | 'invalid-list-key' | 'schema-errors' | 'other' | null;
    }> | null;
  }>;
}>;
export type PoiOutputOutcome =
  | PoiRefusal
  | Readonly<{
      status: "matched";
      capsuleDigest: string;
      revision: number;
      payloadSha256: string;
      outputMatched: true;
      proofVerified: false;
      originalInputReconstructed: false;
      originalRootsAccepted: false;
      membershipAuthenticated: false;
      sourceAuthenticated: false;
      disclosureEnabled: false;
      spendingEnabled: false;
    }>;
export type PoiAttemptedOutputOutcome =
  | PoiRefusal
  | (Extract<PoiOutputOutcome, { status: "matched" }> &
      Readonly<{
        recordState: "attempted";
        attemptBodySha256: string;
        eligibilityEstablished: false;
        attemptOutcomeKnown: false;
        submissionAccepted: false;
        retryEnabled: false;
      }>);
/** Exclusive companion. Type-specific routes reauthenticate actual creators;
 * a mismatched route can disclose before source classification refuses it.
 * submit is terminal for this lane, including refusal/uncertain delivery. */
export interface PoiRecoveryLane extends LaneLifetime {
  prepareShield(holdId: string): Promise<PoiPreparationOutcome>;
  prepareTransact(holdId: string): Promise<PoiPreparationOutcome>;
  submit(capsuleDigest: string): Promise<PoiSubmissionOutcome>;
  /** Existing output matching only, never list acceptance or spend eligibility. */
  recoverOutput(capsuleDigest: string): Promise<PoiOutputOutcome>;
  /** Attempted-state diagnostic only; never delivery acceptance or retry permission. */
  recoverAttemptedOutput(
    capsuleDigest: string,
  ): Promise<PoiAttemptedOutputOutcome>;
}
/** Reviewed before any transaction-RPC read for one held operation. The fixed
 * wallet-0 submitter is never caller-selected; no signing, send, retry or hold release. */
export interface HeldSubmissionDisclosure {
  readonly purpose: "railgun-held-submission-observation-v1";
  readonly chainId: 11155111;
  readonly holdId: string;
  readonly operation: PrivateKind;
  readonly submitter: string;
  readonly destinationRole: "transaction-rpc";
  /** The actual transaction-RPC endpoint observed locally before consent;
   * reasserted before every request. */
  readonly destination: HeldSubmissionDestination;
  readonly requests: readonly [
    "eth_blockNumber",
    "eth_chainId",
    "eth_getBlockByNumber",
    "eth_getTransactionByHash",
    "eth_getTransactionCount",
    "eth_getTransactionReceipt",
  ];
  readonly disclosures: readonly [
    "public-submitter",
    "journaled-transaction-hash",
    "nonce-reconciliation",
    "observation-timing",
  ];
  readonly signingEnabled: false;
  readonly sendEnabled: false;
  readonly retryEnabled: false;
  readonly holdReleaseEnabled: false;
}
export interface HeldSubmissionDestination {
  readonly url: string;
  readonly transport: string;
}
export interface HeldSubmissionObservationFields {
  readonly status: string;
  readonly blockNumber: number | null;
  readonly blockHash: string | null;
  readonly confirmations: number | null;
}
export type HeldSubmissionTransact =
  | null
  | Readonly<{
      status: "matched";
      operation: PrivateKind;
      blockNumber: number;
      blockHash: string;
    }>
  | Readonly<{ status: "anomaly" }>;
export type HeldSubmissionOutput =
  | null
  | Readonly<{ kind: "shielded"; noteId: string }>
  | Readonly<{
      kind: "unshield";
      recipient: string;
      amount: string;
      received: string;
      fee: string;
      feeDeviation: boolean;
    }>
  | Readonly<{
      kind: "partial-unshield";
      changeNoteId: string;
      recipient: string;
      unshieldAmount: string;
      received: string;
      fee: string;
      feeDeviation: boolean;
    }>;
/** Resolution review: exact true lets the original reconciler resolve this one
 * journaled submission. It never releases the hold or permits replay. */
export interface HeldSubmissionResolutionReview {
  readonly purpose: "railgun-held-submission-resolution-v1";
  readonly chainId: 11155111;
  readonly holdId: string;
  readonly operation: PrivateKind;
  readonly transactionHash: string;
  readonly destination: HeldSubmissionDestination;
  readonly observation: HeldSubmissionObservationFields | null;
  readonly transact: HeldSubmissionTransact;
  readonly output: HeldSubmissionOutput;
  readonly finalizedBlockNumber: number | null;
  readonly minimumConfirmations: number;
  readonly allowsNextTransaction: true;
  readonly releasesHold: false;
  readonly retryEnabled: false;
  readonly trust: "unverified-rpc";
}
/** Absent journal binding is not evidence that nothing was submitted. */
export type HeldSubmissionObservation =
  | Readonly<{
      status: "unjournaled";
      holdId: string;
      kind: PrivateKind;
      transactionHash: null;
      submissionEnabled: false;
      retryEnabled: false;
    }>
  | Readonly<{
      status: "journaled";
      holdId: string;
      kind: PrivateKind;
      transactionHash: string;
      observation: HeldSubmissionObservationFields | null;
      transact: HeldSubmissionTransact;
      output: HeldSubmissionOutput;
      resolved: boolean;
      trust: "unverified-rpc";
      submissionEnabled: false;
      retryEnabled: false;
    }>;
export interface HeldSubmissionResolution {
  readonly status: "resolved";
  readonly holdId: string;
  readonly kind: PrivateKind;
  readonly transactionHash: string;
  readonly outcome: "matched" | "reverted";
  readonly finalizedBlockNumber: number | null;
  readonly output: HeldSubmissionOutput;
  readonly releasesHold: false;
  readonly retryEnabled: false;
  readonly trust: "unverified-rpc";
}
/** Local authenticated custody of one held operation: its input note and,
 * for a transfer, the recipient relationship and amount. No RPC or review. */
export interface HeldSubmissionDescriptor {
  readonly status: "held";
  readonly holdId: string;
  readonly kind: PrivateKind;
  readonly input: { readonly noteId: string };
  readonly transfer: {
    readonly recipient: "own-instance" | "other";
    readonly amount: string;
  } | null;
  readonly submissionEnabled: false;
  readonly retryEnabled: false;
}
/** Exclusive companion. Binds a held operation to its exact journaled own-EOA
 * submission by signing digest/nullifier/tree/operation; never the last row. */
export interface SubmissionRecoveryLane extends LaneLifetime {
  describe(holdId: string): Promise<HeldSubmissionDescriptor>;
  observe(holdId: string): Promise<HeldSubmissionObservation>;
  resolve(
    holdId: string,
    options: { minimumConfirmations: number },
  ): Promise<HeldSubmissionResolution>;
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
  /** Ordinary and unknown failures reject; list has no refusal-value arm. */
  list(after?: string | null): Promise<RelayHistory>;
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
/** Reviewed before a completed wallet opens; exact selected type/blind are not
 * available yet. This consent does not authorize nullifier or transport requests. */
export interface OwnedPoiDisclosureReview {
  readonly purpose: "railgun-owned-note-poi-disclosure-v1";
  readonly noteId: string;
  readonly chainId: 11155111;
  readonly txidVersion: "V2_PoseidonMerkle";
  readonly listKey: string;
  readonly endpoint: string;
  readonly sourceDestination: "authenticated-account-public-destination";
  readonly selectedTypeAndBlindAvailableBeforeOpen: false;
  readonly requiresCurrentUnspentOwnedNote: true;
  readonly disclosures: readonly [
    "completed-wallet-canonical-source-and-timing",
    "selected-blinded-commitment",
    "commitment-type",
    "list",
    "membership-proof-and-event",
    "membership-root",
  ];
  readonly requests: readonly [
    "ppoi_pois_per_list",
    "ppoi_merkle_proofs",
    "ppoi_poi_events",
    "ppoi_validate_poi_merkleroots",
  ];
  readonly transferJoinEstablished: false;
  readonly txidProvenanceVerified: false;
  readonly reservationsChecked: false;
  readonly spendingEnabled: false;
}
/** Snapshot-owned note/list diagnostic only. No prior-transfer join or spending
 * eligibility follows even when allValid is true. All original work has drained. */
export interface OwnedPoiObservation {
  readonly noteId: string;
  readonly inputType: "Shield" | "Transact";
  readonly selectedCount: 1;
  readonly listKey: string;
  readonly statuses: readonly [string];
  readonly rootsAccepted: boolean;
  readonly membershipVerified: boolean;
  readonly allValid: boolean;
  readonly ownershipAtSnapshot: true;
  readonly transferJoinEstablished: false;
  readonly txidProvenanceVerified: false;
  readonly reservationsChecked: false;
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
  /** Exclusive one-shot diagnostic; its original 180s budget includes review.
   * Exact true within 30s is required before opening a wallet or contacting POI.
   * Native callback promises must settle on cancellation; nonnative thenables
   * are not assimilated and conservatively quarantine this account. */
  observeOwnedPoi(options: {
    noteId: string;
    signal: AbortSignal;
    reviewDisclosure: Review<OwnedPoiDisclosureReview>;
  }): Promise<OwnedPoiObservation>;
  openRead(options: ReadLaneOptions): Promise<ReadLane>;
  openPrivate(options: PrivateLaneOptions): Promise<PrivateLane>;
  openPublic(options: PublicLaneOptions): Promise<PublicLane>;
  openRecovery(options: RecoveryOptions): Promise<RecoveryLane>;
  openPoiRecovery(options: {
    signal: AbortSignal;
    /** Exact true required within 30s; native promises must settle on cancellation.
     * Thenables/unknown original settlement quarantine the session. */
    reviewDisclosures: Review<
      PoiPreparationDisclosure | PoiSubmissionDisclosure
    >;
  }): Promise<PoiRecoveryLane>;
  openSubmissionRecovery(options: {
    signal: AbortSignal;
    /** Exact true required within 30s for each disclosure and resolution review. */
    reviewDisclosures: Review<
      HeldSubmissionDisclosure | HeldSubmissionResolutionReview
    >;
  }): Promise<SubmissionRecoveryLane>;
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
  openAccount(options: OpenAccountOptions): Promise<AccountSession>;
}
/** Once per realm; exact data properties only. Invalid options may throw before
 * returning a promise. No key, raw store, receipt, module getter or policy override.
 * createAccount is explicit fresh cooperative enrollment; openAccount never creates.
 * Closing revokes and waits for original work; the account fence lasts to main exit. */
export function initializeRailgunMain(options: {
  host: RailgunMainHost;
  runtime: RailgunRuntime;
}): RailgunMain;
