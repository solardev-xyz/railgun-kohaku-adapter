import type { OwnerContextHost } from "./host-owner.js";
/** Fixed worker_threads entry, once per genuine worker realm. No path, job,
 * workerData, key or main host is accepted by this installer. */
export function installRailgunStorageWorkerBootstrap(): Readonly<{
  /** Once only; binds worker-local context then loads the fixed session protocol. */
  initialize(options: { context: OwnerContextHost }): void;
}>;
