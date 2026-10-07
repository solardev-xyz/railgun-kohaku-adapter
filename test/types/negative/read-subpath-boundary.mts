// Negative: the package exports only "." and "./read". Source files, entry files
// and declaration paths are not importable subpaths, the root entry does not
// export the read helpers, and read.mjs has named exports only.
import { dispatchRailgunKohakuRead } from '@freedom/railgun-kohaku-adapter/src/railgun-kohaku-read-dispatch.js'; // expect TS2307
import { projectRailgunKohakuNotes } from '@freedom/railgun-kohaku-adapter/read.cjs'; // expect TS2307
import type { ReadFilter } from '@freedom/railgun-kohaku-adapter/types/read'; // expect TS2307
import { normalizeRailgunKohakuReadFilter } from '@freedom/railgun-kohaku-adapter'; // expect TS2305
import read from '@freedom/railgun-kohaku-adapter/read'; // expect TS1192

export const helpers: ReadonlyArray<unknown> = [
  dispatchRailgunKohakuRead,
  projectRailgunKohakuNotes,
  normalizeRailgunKohakuReadFilter,
  read,
];
export type Filter = ReadFilter;
