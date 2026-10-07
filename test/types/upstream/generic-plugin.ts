// Upstream bridge (negative): the widened Kohaku views do not flow back into
// the restricted adapters. A generic PluginInstance is not a restricted
// adapter, and Kohaku's UnshieldOptions (tailCalls) are not accepted.
import type { PluginInstance, UnshieldOptions } from '@kohaku-eth/plugins';
import {
  createRailgunKohakuPrivateAdapterBroadcaster,
  createRailgunKohakuPublicAdapterSubmitter,
} from '@freedom/railgun-kohaku-adapter';
import type {
  PrivateAdapter,
  PrivateCapabilities,
  PrivateInput,
  PublicCapabilities,
} from '@freedom/railgun-kohaku-adapter';

declare const genericPrivate: PluginInstance<string, PrivateCapabilities>;
declare const genericPublic: PluginInstance<string, PublicCapabilities>;
declare const adapter: PrivateAdapter;
declare const input: PrivateInput;
declare const options: UnshieldOptions;

createRailgunKohakuPrivateAdapterBroadcaster(genericPrivate); // expect TS2345
createRailgunKohakuPublicAdapterSubmitter(genericPublic); // expect TS2345
adapter.prepareUnshield(input, '0x2222222222222222222222222222222222222222', options); // expect TS2345
