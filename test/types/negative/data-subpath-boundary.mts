import data from '@freedom/railgun-kohaku-adapter/data'; // expect TS1192
import { normalizeRailgunPrivateCapsule } from '@freedom/railgun-kohaku-adapter'; // expect TS2305
import { digestRailgunPrivateCapsule } from '@freedom/railgun-kohaku-adapter/read'; // expect TS2305
import { createRailgunKohakuPrivateAdapter } from '@freedom/railgun-kohaku-adapter/data'; // expect TS2305
import { normalizeRailgunPrivateCapsule as source } from '@freedom/railgun-kohaku-adapter/src/data/railgun-private-capsule.js'; // expect TS2307
import type { RailgunPrivateCapsule } from '@freedom/railgun-kohaku-adapter/types/data'; // expect TS2307
import { digestRailgunPrivateCapsule as entry } from '@freedom/railgun-kohaku-adapter/data.cjs'; // expect TS2307
export { data, normalizeRailgunPrivateCapsule, digestRailgunPrivateCapsule, createRailgunKohakuPrivateAdapter, source, entry };
export type { RailgunPrivateCapsule };
