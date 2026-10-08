// @ts-expect-error ESM facade has no default export
import ownerDefault from "@freedom/railgun-kohaku-adapter/host/owner";
// @ts-expect-error raw bootstrap is not the operational facade
import { initializeRailgunOwnerHost } from "@freedom/railgun-kohaku-adapter/host/owner";
import type {
  PublicPreparedHandle,
  PrivateLane,
} from "@freedom/railgun-kohaku-adapter/host/owner";
declare const publicHandle: PublicPreparedHandle;
declare const privateLane: PrivateLane;
// @ts-expect-error opaque handle brands remain distinct in ESM
privateLane.broadcast(publicHandle);
void ownerDefault;
void initializeRailgunOwnerHost;
