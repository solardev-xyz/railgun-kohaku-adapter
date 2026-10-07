import type { RailgunExecutionHost } from './host-execution.js';
/** Electron utility realm only. Clears the environment, installs the real
 * Electron/Node guards, then permits one host initialization. No argument may
 * replace electron.net, the guard callback, the parent port or the filesystem. */
export function installRailgunExecutionBootstrap(): Readonly<{
  initialize(host: RailgunExecutionHost): void;
}>;
