"use strict";
const { AbiCoder, keccak256 } = require("ethers");
const {
  railgunTransactJournalIntent,
  validRailgunTransactIntent,
  shieldIntentBinding,
  validShieldIntent,
} = require("@freedom/railgun-kohaku-adapter/host/journal-data");
const { privacyError } = require("./errors.cjs");
function validIntent(value) {
  if (value?.kind === "railgun-transact")
    return validRailgunTransactIntent(value);
  if (value?.kind === "railgun-native-shield") return validShieldIntent(value);
  return false;
}
function transactionIntent(kind, tx) {
  try {
    if (kind === "railgun-transact") return railgunTransactJournalIntent(tx);
    if (kind !== "railgun-native-shield") throw new Error();
    return Object.freeze({
      kind,
      ...shieldIntentBinding(tx),
      digest: keccak256(
        AbiCoder.defaultAbiCoder().encode(
          ["string", "uint256", "address", "address", "uint256", "bytes"],
          [kind, tx.chainId, tx.from, tx.to, tx.value, tx.data],
        ),
      ),
    });
  } catch {
    throw privacyError("PRIVATE_INTENT_INVALID", "Invalid transaction intent");
  }
}
module.exports = { validIntent, transactionIntent };
