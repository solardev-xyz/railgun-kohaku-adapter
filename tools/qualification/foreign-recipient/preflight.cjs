/** Authenticate the separately installed fixture before Jest imports its engine. */
const path = require('path');
const {
  assertRailgunFixture,
} = require('../../railgun-runtime-build/scripts/railgun-fixture-integrity');
module.exports = () => {
  assertRailgunFixture(
    path.join(__dirname, '../../railgun-runtime-build/scripts/fixtures/railgun-engine/node_modules')
  );
};
