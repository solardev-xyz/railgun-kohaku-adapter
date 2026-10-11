import owner = require("@freedom/railgun-kohaku-adapter/host/owner");
import worker = require("@freedom/railgun-kohaku-adapter/host/owner-worker-bootstrap");
declare const host: owner.RailgunMainHost;
declare const runtime: owner.RailgunRuntime;
declare const signal: AbortSignal;
declare const session: owner.AccountSession;
declare const lane: owner.PrivateLane;
declare const publicHandle: owner.PublicPreparedHandle;
// @ts-expect-error raw owner initializer is not exported
owner.initializeRailgunOwnerHost(host);
declare const missingSource: Omit<owner.RailgunMainHost, "sourceIdentity">;
// @ts-expect-error missing once-init source identity
owner.initializeRailgunMain({ host: missingSource, runtime });
// @ts-expect-error no runtime policy override
owner.initializeRailgunMain({ host, runtime, policy: {} });
// @ts-expect-error no raw enrollment owner
session.enrollment;
// @ts-expect-error no arbitrary module getter
session.getModule("identity");
// @ts-expect-error no receipt accepting path
session.openRead({ wallet: "active", signal, receipt: {} });
// @ts-expect-error no implicit create through open options
session.openRead({ wallet: "create", signal });
// @ts-expect-error no host closure exposed to facade consumers
session.withSpendingKey(() => undefined);
// @ts-expect-error a forged structural empty object is not a prepared token
lane.broadcast({});
// @ts-expect-error public token cannot enter private lane
lane.broadcast(publicHandle);
// @ts-expect-error no worker filename selector
worker.installRailgunStorageWorkerBootstrap("/entry.js");
const workerBinding = worker.installRailgunStorageWorkerBootstrap();
workerBinding.initialize({
  context: host.context,
  // @ts-expect-error worker binding is context-only
  credentials: host.credentials,
});
// @ts-expect-error no relay transport frontdoor
session.sendRelay({});
const wrongRecovery: owner.RecoveryOptions = {
  signal,
  gasLimit: 1n,
  maxGasFee: 1n,
  // @ts-expect-error recovery callback receives AbortSignal itself
  reviewDisclosures: (_summary, { signal: nested }) => !nested.aborted,
  reviewTransaction: () => true,
};
void wrongRecovery;
declare const foreignThenable: PromiseLike<boolean>;
type TxReview = owner.Review<owner.TxidDisclosureReview>;
// @ts-expect-error native Promise required, not a generic PromiseLike
const thenable: TxReview = () => foreignThenable;
void thenable;
// @ts-expect-error cold lane does not accept fresh quote or review options
session.openRelayRecovery({ signal, quote: { data: "", signature: "" } });
host.platform.spawnUtility({
  entry: "railgun-utility-v1",
  heapMb: 128,
  // @ts-expect-error no key/filename platform selectors
  filename: "/job",
});
// @ts-expect-error opaque host endpoints are not an invocation API
host.rpc.createPrivateRpc({});
// @ts-expect-error private implementation imports remain unexported
import privateOwners = require("@freedom/railgun-kohaku-adapter/src/owners/railgun-identity.js");
void privateOwners;

const mutateReview: owner.Review<owner.RelayReview> = (summary) => {
  // @ts-expect-error public review summaries cannot become authority by mutation
  summary.signingEnabled = true;
  return false;
};
void mutateReview;

declare const cold: owner.RelayRecoveryLane;
async function onlyListData() {
  const page = await cold.list();
  // @ts-expect-error list rejects failures; it never returns a refusal status
  page.status;
}
void onlyListData;
declare const proofOutcome: owner.PrivateProofRecoveryOutcome;
if (proofOutcome.status === "proof-present") {
  // @ts-expect-error stored proof presence is not fresh proof regeneration
  const regenerated: "proof-stored" = proofOutcome.status;
  void regenerated;
}

declare const poi: owner.PoiRecoveryLane;
// @ts-expect-error no raw membership receipt parameter
poi.prepareShield("id", {});
// @ts-expect-error no caller proof or plan accepted
poi.submit({ proof: {}, plan: {} });
// @ts-expect-error no generic type/policy selector
poi.prepare("id", "Shield");
// @ts-expect-error no retained store access
poi.store;
// @ts-expect-error a retry accepts no caller status, evidence or flag
poi.retryAttempted("id", { status: "Missing" });
// @ts-expect-error submit takes no retry flag
poi.submit("id", true);
// @ts-expect-error a replacement accepts no caller proof, payload or circuit
poi.reproveRetiredShield("id", { proof: {} });
// @ts-expect-error no generic replacement route or type selector
poi.reproveRetired("id");
// @ts-expect-error a replacement handoff accepts no caller status or evidence
poi.submitReproof("id", { status: "Missing" });
declare const output: Extract<owner.PoiOutputOutcome, { status: "matched" }>;
// @ts-expect-error output matching cannot grant membership acceptance
const acceptedMembership: true = output.membershipAuthenticated;
void acceptedMembership;

declare const attempted: Extract<
  owner.PoiAttemptedOutputOutcome,
  { status: "matched" }
>;
// @ts-expect-error attempted output matching cannot establish safe retry
const retry: true = attempted.retryEnabled;
void retry;
// @ts-expect-error attempted state is selected by a fixed method, not options
poi.recoverOutput("id", { attempted: true });

// @ts-expect-error selection requires explicit review before any wallet opens
session.observeOwnedPoi({ noteId: "0:1", signal });
session.observeOwnedPoi({
  noteId: "0:1",
  signal,
  reviewDisclosure: () => true,
  // @ts-expect-error no receipt, policy, store or caller proof selection
  receipt: {},
});
declare const observed: owner.OwnedPoiObservation;
// @ts-expect-error observation is not a spending permission
const spendable: true = observed.spendingEnabled;
void spendable;
// @ts-expect-error a selected owned note is not authenticated as a prior transfer output
const transferJoined: true = observed.transferJoinEstablished;
void transferJoined;
// @ts-expect-error the private membership receipt never leaves the observer
observed.receipt;

// @ts-expect-error held-submission recovery requires explicit disclosure review
session.openSubmissionRecovery({ signal });
session.openSubmissionRecovery({
  signal,
  reviewDisclosures: () => true,
  // @ts-expect-error no caller-selected submitter address or journal row
  submitter: "0x",
});
declare const facade: ReturnType<typeof owner.initializeRailgunMain>;
// @ts-expect-error account creation never takes an existing-cache opening mode
facade.createAccount({ accountIndex: 0, signal, publicCache: "new" });
// @ts-expect-error only explicit "new" or "pending" public-cache openings exist
facade.openAccount({ accountIndex: 0, signal, publicCache: "active" });
declare const heldLane: owner.SubmissionRecoveryLane;
// @ts-expect-error resolution requires an explicit confirmation policy
heldLane.resolve("id");
// @ts-expect-error no resend, retry or broadcast method on the observation lane
heldLane.submit("id");
declare const heldObservation: owner.HeldSubmissionObservation;
// @ts-expect-error observation never enables a new submission
const resend: true = heldObservation.submissionEnabled;
void resend;
declare const heldResolution: owner.HeldSubmissionResolution;
// @ts-expect-error resolution never releases the private signing hold
const released: true = heldResolution.releasesHold;
void released;

const invalidCacheHost: owner.RailgunMainHost = { ...host, sourceIdentity: {
  readDigest: () => "digest",
  // @ts-expect-error every cache family must have a synchronous digest
  readCacheDigests: () => ({ public: "digest", wallet: "digest" }),
}};
void invalidCacheHost;

// @ts-expect-error fee policy requires bigint, not a number
owner.initializeRailgunMain({ host, runtime: { archive: "/engine", proverArchive: "/prover", artifactDirectory: "/artifacts" }, applicationPolicy: { maxGasFee: 1 } });

// @ts-expect-error only the qualified deployment identifier is admitted
owner.initializeRailgunMain({ host, runtime, deployment: "mainnet" });
// @ts-expect-error a caller cannot supply custom deployment facts
owner.initializeRailgunMain({ host, runtime, deployment: { chainId: 11155111 } });

// @ts-expect-error amount ceiling is a bigint, never a decimal or number
owner.initializeRailgunMain({host, runtime, applicationPolicy: {maxOperationAmount: "1"}});
// @ts-expect-error supplied policy cannot be empty
owner.initializeRailgunMain({host, runtime, applicationPolicy: {}});

declare const diagnosticSession: owner.AccountSession;
declare const diagnosticPrivateLane: owner.PrivateLane;
declare const diagnosticReadLane: owner.ReadLane;
// @ts-expect-error a read lane cannot produce a private preparation diagnostic
diagnosticSession.readPreparationOutcome(diagnosticReadLane);
const preparationOutcome = diagnosticSession.readPreparationOutcome(diagnosticPrivateLane);
if (preparationOutcome) {
  // @ts-expect-error diagnostic records are immutable
  preparationOutcome.recoveryRequired = false;
  // @ts-expect-error no raw request, transaction or account payload is exposed
  preparationOutcome.payload;
}
