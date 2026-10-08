'use strict';
// Trusted main entry: the fixed facade owns initialization and account lifetimes.
module.exports = Object.freeze({
  initializeRailgunMain: require('./src/owners/operational-facade').initializeRailgunMain,
});
