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
