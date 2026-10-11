import owner = require("@freedom/railgun-kohaku-adapter/host/owner");
import worker = require("@freedom/railgun-kohaku-adapter/host/owner-worker-bootstrap");
declare const host: owner.RailgunMainHost;
declare const signal: AbortSignal;
const api = owner.initializeRailgunMain({
  host,
  deployment: "sepolia",
  applicationPolicy: {maxGasFee: 2000000000000000n, maxOperationAmount: 50000000000000000n},
  runtime: {
    archive: "/engine",
    proverArchive: "/prover",
    artifactDirectory: "/artifacts",
  },
});
async function consume() {
  const session = await api.openAccount({ accountIndex: 0, signal });
  await session.advancePublic({ to: 1, anchor: { number: 1, hash: "0x00" } });
  const read = await session.openRead({ wallet: "active", signal });
  await read.notes();
  read.close();
  await read.closed;
  const privateLane = await session.openPrivate({
    wallet: "active",
    signal,
    gasLimit: 100n,
    maxGasFee: 100n,
    reviewPreparation: async (summary, context) =>
      summary.chainStateVerified === false &&
      summary.submitter.startsWith("0x") &&
      !context.signal.aborted,
    reviewTransaction: (summary, context) =>
      summary.maxGasFee <= 100n && !context.signal.aborted,
  });
  const prepared = await privateLane.prepareTransfer(
    { asset: { __type: "erc20", contract: "0x00" }, amount: 1n, noteId: "0:0" },
    "0zk1",
  );
  await privateLane.broadcast(prepared.handle);
  privateLane.close();
  await privateLane.closed;
  const publicLane = await session.openPublic({
    wallet: "active",
    signal,
    gasLimit: 100n,
    maxGasFee: 100n,
    reviewPreparation: (summary) => summary.permitsSigning === false,
    reviewTransaction: async () => true,
  });
  await publicLane.submit(
    (
      await publicLane.prepareShield({
        asset: { __type: "native" },
        amount: 1n,
      })
    ).handle,
  );
  publicLane.close();
  await publicLane.closed;
  const recovery = await session.openRecovery({
    signal,
    gasLimit: 100n,
    maxGasFee: 100n,
    reviewDisclosures: (summary, originalSignal) =>
      summary.originalSpendingSignatureReused &&
      summary.submitter.startsWith("0x") &&
      !originalSignal.aborted,
    reviewTransaction: (summary) => summary.maxGasFee === 100n,
  });
  const history = await recovery.history();
  if (history.records[0]) {
    const proof = await recovery.resumeProof(history.records[0].holdId);
    if (proof.status === "proof-present" || proof.status === "proof-stored") {
      const checked: string = proof.transactionDigest;
      const noSubmission: false = proof.submissionEnabled;
      void checked;
      void noSubmission;
    }
  }
  recovery.close();
  await recovery.closed;
  const local = await session.openRelayLocal({
    wallet: "active",
    signal,
    review: (summary, context) =>
      summary.amounts.fee === "1" && !context.signal.aborted,
    reviewDisclosure: (summary) =>
      summary.disclosures[0] === "selected-poi-membership",
    reviewStagingDisclosure: (summary) => !summary.selectedMembershipPermitted,
    reviewRootDisclosure: (summary) => summary.queries[1].params.tree === 0,
  });
  await local.prepare({
    noteId: "0:0",
    quote: { data: "00", signature: "00" },
    gas: {
      transactionType: 0,
      gasEstimate: "1",
      gasPrice: "1",
      minGasPrice: "1",
    },
    maxFee: "1",
    signal,
  });
  await local.closed;
  const cold = await session.openRelayRecovery({ signal });
  const page = await cold.list();
  if (page.records[0]) await cold.resume(page.records[0].operationId);
  cold.close();
  await cold.closed;
  await session.synchronizeTxid({
    mode: "checkpoint",
    signal,
    reviewDisclosure: (summary, context) =>
      summary.maximumAdvancePages === 0 && !context.signal.aborted,
  });
  const observed = await session.observeOwnedPoi({
    noteId: "0:1",
    signal,
    reviewDisclosure: (summary, context) =>
      summary.selectedTypeAndBlindAvailableBeforeOpen === false &&
      summary.requiresCurrentUnspentOwnedNote &&
      !context.signal.aborted,
  });
  const selectedCount: 1 = observed.selectedCount;
  const notJoined: false = observed.transferJoinEstablished;
  const notSpendable: false = observed.spendingEnabled;
  void selectedCount;
  void notJoined;
  void notSpendable;
  await session.close();
}
void consume;
// Compile only: bootstrap is worker-only at runtime, and is never invoked here.
const install: () => {
  initialize(options: { context: owner.OwnerContextHost }): void;
} = worker.installRailgunStorageWorkerBootstrap;
void install;

async function poi(session: owner.AccountSession) {
  const lane = await session.openPoiRecovery({
    signal,
    reviewDisclosures: (summary, context) => {
      if (summary.purpose === "railgun-retained-poi-facade-disclosure-v1") {
        const disabled: false = summary.poiSubmissionEnabled;
        void disabled;
      } else {
        summary.requestInventory.map((value) => value.maxRequests);
      }
      return !context.signal.aborted;
    },
  });
  const prepared = await lane.prepareShield("a".repeat(64));
  if (prepared.status === "prepared") {
    const outcome = await lane.recoverOutput(prepared.capsuleDigest);
    if (outcome.status === "matched") {
      const unavailable: false = outcome.membershipAuthenticated;
      void unavailable;
    }
    const attempted = await lane.recoverAttemptedOutput(prepared.capsuleDigest);
    if (attempted.status === "matched") {
      const retry: false = attempted.retryEnabled;
      const uncertain: false = attempted.attemptOutcomeKnown;
      void retry;
      void uncertain;
    }
    await lane.submit(prepared.capsuleDigest);
    const retried: "refused" | "recovery-required" = (
      await lane.retryAttempted(prepared.capsuleDigest)
    ).status;
    void retried;
    const replacement = await lane.reproveRetiredShield(prepared.capsuleDigest);
    if (replacement.status === "reproof-prepared") {
      const from: string = replacement.circuit.from;
      const sends: false = replacement.disclosureEnabled;
      void from;
      void sends;
    }
    const replaced: "refused" | "recovery-required" = (
      await lane.submitReproof(prepared.capsuleDigest)
    ).status;
    void replaced;
  }
  lane.close();
  await lane.closed;
}
void poi;

async function held(session: owner.AccountSession) {
  const lane = await session.openSubmissionRecovery({
    signal,
    reviewDisclosures: (summary, context) => {
      if (summary.purpose === "railgun-held-submission-observation-v1") {
        const noSend: false = summary.sendEnabled;
        const chainRead: "eth_chainId" = summary.requests[1];
        const nonce: "nonce-reconciliation" = summary.disclosures[2];
        const url: string = summary.destination.url;
        void noSend;
        void chainRead;
        void nonce;
        void url;
      } else {
        const keepsHold: false = summary.releasesHold;
        void keepsHold;
      }
      return !context.signal.aborted;
    },
  });
  const described = await lane.describe("a".repeat(64));
  const input: string = described.input.noteId;
  if (described.transfer) {
    const self: "own-instance" | "other" = described.transfer.recipient;
    void self;
  }
  const noSubmit: false = described.submissionEnabled;
  void input;
  void noSubmit;
  const observed = await lane.observe("a".repeat(64));
  if (observed.status === "journaled") {
    const hash: string = observed.transactionHash;
    void hash;
    if (observed.output?.kind === "shielded") {
      const noteId: string = observed.output.noteId;
      void noteId;
    }
    const resolved = await lane.resolve(observed.holdId, {
      minimumConfirmations: 3,
    });
    const retry: false = resolved.retryEnabled;
    void retry;
  } else {
    const absent: null = observed.transactionHash;
    void absent;
  }
  lane.close();
  await lane.closed;
}
void held;

async function rebuildOpen(
  api: ReturnType<typeof owner.initializeRailgunMain>,
) {
  const rebuilt = await api.openAccount({
    accountIndex: 0,
    signal,
    publicCache: "new",
  });
  rebuilt.close();
  await rebuilt.closed;
  const resumed = await api.openAccount({
    accountIndex: 0,
    signal,
    publicCache: "pending",
  });
  resumed.close();
  await resumed.closed;
}
void rebuildOpen;

// Implementable context/storage signatures remain self-contained.
const parentScope = host.sessions.openPrivacySession();
const rpcContext = parentScope.getContext({
  kind: "public-address", principal: "0x00", chainId: 11155111, role: "transaction-rpc",
});
const scopedValue: Promise<number> = parentScope.run(rpcContext, async () => 1);
const normalizedOperation: string | null = host.context.getPrivacyContext(rpcContext).subject.operation;
const storagePath: string = host.storage.getPrivacyStoragePath(rpcContext, "/profile");
void scopedValue; void normalizedOperation; void storagePath;

async function authenticatedScanRecovery(session: import("@freedom/railgun-kohaku-adapter/host/owner").AccountSession) {
  const recovered = await session.recoverPublic();
  const cursor: number | undefined = recovered.to?.number;
  // @ts-expect-error recovery never accepts a caller-selected checkpoint
  await session.recoverPublic({ to: 100 });
  return cursor;
}
void authenticatedScanRecovery;

async function shieldRecovery(session: import("@freedom/railgun-kohaku-adapter/host/owner").AccountSession, signal: AbortSignal) {
  const lane = await session.openShieldRecovery({signal,reviewDisclosures: summary => summary.sendEnabled === false,reviewResolution: summary => summary.trust === "unverified-rpc"});
  const rows = await lane.list();
  if (rows[0]) await lane.resolve(rows[0].transactionHash, {minimumConfirmations:12});
  // @ts-expect-error no signer or send authority on recovery
  lane.submit("0x00");
  // @ts-expect-error callers cannot select a foreign EOA
  await session.openShieldRecovery({signal,owner:"0x00",reviewDisclosures:()=>true,reviewResolution:()=>true});
  lane.close(); await lane.closed;
}
void shieldRecovery;

const compatibleHost: owner.RailgunMainHost = { ...host, sourceIdentity: {
  readDigest: () => "full-digest", readCacheDigests: () => ({ public: "public", wallet: "wallet", txid: "txid" }),
}};
void compatibleHost;

owner.initializeRailgunMain({ host, runtime: { archive: "/engine", proverArchive: "/prover", artifactDirectory: "/artifacts" }, applicationPolicy: { maxGasFee: 1000000n } });
