import owner = require("@freedom/railgun-kohaku-adapter/host/owner");
import worker = require("@freedom/railgun-kohaku-adapter/host/owner-worker-bootstrap");
declare const host: owner.RailgunMainHost;
declare const signal: AbortSignal;
const api = owner.initializeRailgunMain({
  host,
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
      summary.chainStateVerified === false && !context.signal.aborted,
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
      summary.originalSpendingSignatureReused && !originalSignal.aborted,
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
  if ("records" in page && page.records[0])
    await cold.resume(page.records[0].operationId);
  cold.close();
  await cold.closed;
  await session.synchronizeTxid({
    mode: "checkpoint",
    signal,
    reviewDisclosure: (summary, context) =>
      summary.maximumAdvancePages === 0 && !context.signal.aborted,
  });
  await session.close();
}
void consume;
// Compile only: bootstrap is worker-only at runtime, and is never invoked here.
const install: () => {
  initialize(options: { context: owner.OwnerContextHost }): void;
} = worker.installRailgunStorageWorkerBootstrap;
void install;
