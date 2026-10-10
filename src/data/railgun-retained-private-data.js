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
const preparation = require("./railgun-private-preparation-core").createPrivatePreparation(NOTE_MAX, offer, intent);
// Selection must use the main-captured spending ceiling (or the independent
// relay ceiling), not the storage format's capacity. Do not export that selector.
const { selectRailgunPrivatePreparation: _formatSelector, ...preparationData } = preparation;
const results = require("./railgun-private-results-core").createPrivateResults(NOTE_MAX, intent);
const recovery = require("./railgun-private-recovery-data-core").createPrivateRecoveryData(NOTE_MAX, capsule, preparation);
const poiShape = require("./railgun-own-poi-shape-data-core").createOwnPoiShapeData(capsule);
const shieldSelector = require("./railgun-poi-shield-selector-data-core").createPoiShieldSelectorData(capsule);
const transactSelector = require("./railgun-poi-transact-selector-data-core").createPoiTransactSelectorData(capsule);
module.exports = Object.freeze({ ...policy, ...intent, ...offer, ...capsule,
  ...preparationData, ...results, ...recovery, ...poiShape, ...shieldSelector, ...transactSelector });
