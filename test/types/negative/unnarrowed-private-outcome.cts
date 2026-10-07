// Negative: a private broadcast result is a three-way union, not an
// acknowledgement, and it is not a public Shield acknowledgement either.
import { createRailgunKohakuPrivateAdapterBroadcaster } from '@freedom/railgun-kohaku-adapter';
import type {
  PrivateAdapter,
  PrivateOperation,
  PublicShieldAcknowledgement,
} from '@freedom/railgun-kohaku-adapter';

declare const adapter: PrivateAdapter;
declare const operation: PrivateOperation;

export async function misuse(): Promise<void> {
  const outcome = await createRailgunKohakuPrivateAdapterBroadcaster(adapter).broadcast(operation);
  const hash: string = outcome.hash; // expect TS2339
  const acknowledged: PublicShieldAcknowledgement = outcome; // expect TS2322
  void hash;
  void acknowledged;
}
