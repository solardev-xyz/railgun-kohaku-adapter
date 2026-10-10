import {
  initializeRailgunMain,
  type RailgunMainHost,
  type PrivatePreparedHandle,
} from "@freedom/railgun-kohaku-adapter/host/owner";
import type { PrivatePreparedHandle as CjsHandle } from "../../types/host-owner.js";
import { installRailgunStorageWorkerBootstrap } from "@freedom/railgun-kohaku-adapter/host/owner-worker-bootstrap";
declare const host: RailgunMainHost;
declare const signal: AbortSignal;
declare const cjs: CjsHandle;
const sharedBrand: PrivatePreparedHandle = cjs;
const api = initializeRailgunMain({
  host,
  runtime: {
    archive: "/engine",
    proverArchive: "/prover",
    artifactDirectory: "/artifacts",
  },
});
void api.createAccount({ accountIndex: 1, signal });
void sharedBrand;
void installRailgunStorageWorkerBootstrap;

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
