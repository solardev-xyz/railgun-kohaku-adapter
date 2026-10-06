const snapshot = require('./src/railgun-kohaku-snapshot-plugin.js');
const privateAdapter = require('./src/railgun-kohaku-private-adapter.js');
const publicAdapter = require('./src/railgun-kohaku-public-adapter.js');
module.exports = Object.freeze({
  createRailgunKohakuSnapshotPlugin: snapshot.createRailgunKohakuSnapshotPlugin,
  createRailgunKohakuPrivateAdapter: privateAdapter.createRailgunKohakuPrivateAdapter,
  createRailgunKohakuPrivateAdapterBroadcaster:
    privateAdapter.createRailgunKohakuPrivateAdapterBroadcaster,
  createRailgunKohakuPublicAdapter: publicAdapter.createRailgunKohakuPublicAdapter,
  createRailgunKohakuPublicAdapterSubmitter:
    publicAdapter.createRailgunKohakuPublicAdapterSubmitter,
});
