"use strict";
const { LEGACY_MAX } = require("../amount-bounds");
module.exports = require("./railgun-shield-policy-core").createShieldPolicy(LEGACY_MAX);
