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
