/** Two fixed viewing-only jobs; construction and reconstruction never share a process. */
const assert = require('assert/strict');
exports.run = async (inputText, context) => {
  const input = JSON.parse(inputText);
  assert.equal(input.restore, true);
  for (const name of ['privateIntent', 'privateOperation', 'privateRecovery'])
    assert.equal(input[name], undefined);
  const constructing = input.relayRequest !== undefined;
  assert.equal(constructing, input.relayDraftText === undefined);
  require("../execution/railgun-relay-quote-data.js").shape(input, [
    'archive',
    'descriptor',
    'checkpoint',
    'walletId',
    'restore',
    'prefixes',
    ...(constructing ? ['relayRequest'] : ['relayDraftText']),
  ]);
  const data = require("../execution/railgun-relay-wallet-data.js");
  const request = constructing
    ? data.normalizeRailgunRelayRequest(input.relayRequest, input.walletId)
    : undefined;
  if (!constructing) data.parseRailgunRelayDraft(input.relayDraftText, input.walletId);
  return require("../execution/railgun-wallet-job.js").withWallet(
    inputText,
    context,
    constructing ? 'relay-prepare' : 'relay-reconstruct',
    async (restored) =>
      constructing
        ? {
            relayDraft: await require("./railgun-relay-witness.js").prepareRailgunRelayDraft({
              ...restored,
              request,
            }),
          }
        : {
            relayReconstruction:
              await require("./railgun-relay-reconstruct.js").reconstructRailgunRelayDraft({
                ...restored,
                draftText: input.relayDraftText,
              }),
          }
  );
};
