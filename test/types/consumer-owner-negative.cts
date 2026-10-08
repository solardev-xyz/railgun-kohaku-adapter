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
