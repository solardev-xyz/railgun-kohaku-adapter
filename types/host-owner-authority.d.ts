/** Trusted main-process bridge to genuine same-instance owner registries.
 * Importing does not initialize owners. Every call refuses before owner loading
 * unless the fixed host composition has been initialized. Unknown inputs are
 * validated by the original private registries, never treated as bearer data.
 */
export interface PrivateSubmissionAdmission {
  /** Monotonic admission deadline; absent on the warm path. */
  readonly admissionDeadline?: number;
}
export function assertRailgunPrivateSubmission(handle: unknown, intent: unknown): PrivateSubmissionAdmission | undefined;
export function assertRailgunShieldSubmission(handle: unknown, intent: unknown): void;
export function assertRailgunTransactResolution(permit: unknown, record: unknown): unknown;
export function assertRailgunShieldResolution(permit: unknown, record: unknown): unknown;
export function authorizeRailgunTransactResolution(handle: unknown, record: unknown, completed?: boolean): unknown;
export function authorizeRailgunShieldResolution(handle: unknown, record: unknown, completed?: boolean): unknown;
