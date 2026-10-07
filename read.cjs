// The "./read" subpath: the same helper function objects the factories require
// from src/, so require() and import() share one identity with the factories.
const readData = require('./src/railgun-kohaku-read-data.js');
const readDispatch = require('./src/railgun-kohaku-read-dispatch.js');
module.exports = Object.freeze({
  normalizeRailgunKohakuReadFilter: readData.normalizeRailgunKohakuReadFilter,
  projectRailgunKohakuBalance: readData.projectRailgunKohakuBalance,
  projectRailgunKohakuNotes: readData.projectRailgunKohakuNotes,
  dispatchRailgunKohakuRead: readDispatch.dispatchRailgunKohakuRead,
});
