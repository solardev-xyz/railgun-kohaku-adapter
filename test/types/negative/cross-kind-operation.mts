// Negative: operation tokens are kind-branded. A public token is not a private
// one, a hand-made token lacks the brand, and adapters are not interchangeable.
import {
  createRailgunKohakuPrivateAdapterBroadcaster,
  createRailgunKohakuPublicAdapterSubmitter,
} from '@freedom/railgun-kohaku-adapter';
import type {
  PrivateAdapter,
  PublicAdapter,
  PublicShieldOperation,
} from '@freedom/railgun-kohaku-adapter';

declare const privateAdapter: PrivateAdapter;
declare const publicAdapter: PublicAdapter;
declare const shield: PublicShieldOperation;

const broadcaster = createRailgunKohakuPrivateAdapterBroadcaster(privateAdapter);
const submitter = createRailgunKohakuPublicAdapterSubmitter(publicAdapter);
await broadcaster.broadcast(shield); // expect TS2345
await broadcaster.broadcast({ __type: 'privateOperation' }); // expect TS2345
await submitter.submit({ __type: 'publicOperation' }); // expect TS2345
createRailgunKohakuPrivateAdapterBroadcaster(publicAdapter); // expect TS2345
createRailgunKohakuPublicAdapterSubmitter(privateAdapter); // expect TS2345
