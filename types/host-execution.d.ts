/** Trusted, once-per-process-realm host composition. No renderer access, raw
 * filesystem binding, key lease, permit, signing result or operation callback. */
export type RailgunExecutionJob =
  | 'spending-public'
  | 'viewing-identity'
  | 'spending-sign'
  | 'wallet-viewing'
  | 'private-prepare'
  | 'private-operate'
  | 'private-recover'
  | 'private-receive'
  | 'private-verify';
export interface RailgunExecutionHost {
  context: {
    getPrivacyContext(handle: object): { subject: { protocol: string }; signal: AbortSignal };
    createPrivacyScope(options: { profileId: string; signal: AbortSignal }): {
      signal: AbortSignal;
      getContext(subject: Readonly<Record<string, string | number>>): object;
      close(): void;
    };
  };
  artifacts: {
    createPrivacyArtifactLoader(options: {
      handle: object;
      directory: string;
      manifest: readonly Readonly<{ kind: string; name: string; size: number; sha256: string }>[];
    }): {
      /** Runtime requires a Node Buffer; ownership is transferred to the kernel,
       * which snapshots, wipes and independently checks its pinned contents. */
      load(name: string): Promise<Uint8Array>;
    };
  };
}
/** Any second attempt, even identical or after a failed attempt, throws. */
export function initializeRailgunExecutionHost(host: RailgunExecutionHost): undefined;
/** A path is an inventory location, never key-loan or process admission. Utility
 * initialization receives the job enum itself and uses a separate static switch. */
export function getRailgunExecutionJob(job: RailgunExecutionJob): string;
