// Negative: index.mjs has named exports only. The "import" condition's
// declarations must not offer a default export that would fail at runtime.
import adapterPackage from '@freedom/railgun-kohaku-adapter'; // expect TS1192

export const factory = adapterPackage.createRailgunKohakuPublicAdapter;
