/** Two frozen public dummy fixture outputs; never valid proof/ownership evidence. */
const capsules = require('./poi-selector-capsules.json');
module.exports = {
  sample: (unshield = false) => ({
    capsule: JSON.parse(JSON.stringify(capsules[unshield ? 1 : 0])),
  }),
};
