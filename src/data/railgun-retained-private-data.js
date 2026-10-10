"use strict";
// Internal persisted-format reader, never exported through /data or /host/data.
// Structural agreement confers no ownership, freshness or spending authority.
const { NOTE_MAX } = require("../amount-bounds");
const { assertCapsuleFormat } = require("../operation-formats");
const { createPrivatePolicy } = require("./railgun-private-policy-core");
const { createPrivateIntent } = require("./railgun-private-intent-core");
const { createPrivateOffer } = require("./railgun-private-offer-core");
const { createPrivateCapsule } = require("./railgun-private-capsule-core");
const policy = createPrivatePolicy(NOTE_MAX);
const intent = createPrivateIntent(policy);
const offer = createPrivateOffer(NOTE_MAX, intent);
const capsule = createPrivateCapsule(offer, (value, partial) =>
  assertCapsuleFormat(value.version, value.selection.kind,
    partial ? value.preparation?.inputAmount : value.preparation?.amount).version);
module.exports = Object.freeze({ ...policy, ...intent, ...offer, ...capsule });
