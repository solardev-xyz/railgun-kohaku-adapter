"use strict";
// A structural selector is not spending admission. Only the parent's captured
// policy can admit a direct selected input; relay selection remains separate.
const assert = require("node:assert/strict");
const { NOTE_MAX } = require("../amount-bounds");
const retained = require("../data/railgun-retained-private-data");
const { createPrivatePreparation } = require("../data/railgun-private-preparation-core");
const { isRailgunOperationAmount } = require("./application-policy");
const selector = createPrivatePreparation(NOTE_MAX, retained, retained).selectRailgunPrivatePreparation;
function selectRailgunPrivatePreparation(owned, request) {
  const selection = selector(owned, request);
  const note = owned.read.received.find(value => value.id === request.noteId);
  assert.ok(isRailgunOperationAmount(note.amount));
  return selection;
}
module.exports = { selectRailgunPrivatePreparation };
