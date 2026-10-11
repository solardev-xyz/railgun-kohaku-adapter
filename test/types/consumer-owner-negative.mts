import * as owner from "@freedom/railgun-kohaku-adapter/host/owner";
import { initializeRailgunMain } from "@freedom/railgun-kohaku-adapter/host/owner";
// @ts-expect-error ESM facade has no default export
import ownerDefault from "@freedom/railgun-kohaku-adapter/host/owner";
// @ts-expect-error raw bootstrap is not the operational facade
import { initializeRailgunOwnerHost } from "@freedom/railgun-kohaku-adapter/host/owner";
import type {
  RailgunMainHost,
  RailgunRuntime,
  PublicPreparedHandle,
  PrivateLane,
} from "@freedom/railgun-kohaku-adapter/host/owner";
declare const publicHandle: PublicPreparedHandle;
declare const privateLane: PrivateLane;
// @ts-expect-error opaque handle brands remain distinct in ESM
privateLane.broadcast(publicHandle);
void ownerDefault;
void initializeRailgunOwnerHost;

declare const host: RailgunMainHost;
declare const runtime: RailgunRuntime;
const invalidCacheHost: RailgunMainHost = { ...host, sourceIdentity: {
  readDigest: () => "digest",
  // @ts-expect-error every cache family must have a synchronous digest
  readCacheDigests: () => ({ public: "digest", wallet: "digest" }),
}};
void invalidCacheHost;

// @ts-expect-error fee policy requires bigint, not a number
initializeRailgunMain({ host, runtime: { archive: "/engine", proverArchive: "/prover", artifactDirectory: "/artifacts" }, applicationPolicy: { maxGasFee: 1 } });

// @ts-expect-error only the qualified deployment identifier is admitted
initializeRailgunMain({ host, runtime, deployment: "mainnet" });
// @ts-expect-error a caller cannot supply custom deployment facts
initializeRailgunMain({ host, runtime, deployment: { chainId: 11155111 } });

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
