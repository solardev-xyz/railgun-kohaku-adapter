"use strict";
const { privacyError } = require("./errors.cjs");
/** In-process serialization in addition to the mandatory profile process lock.
 * No ordinary-send path, delegation, automatic takeover or expired lease reuse. */
function createLeaseHost(context) {
  const active = new Set();
  function acquireSubmissionLease({ chainId, from, privacyContext }) {
    const owner = context.getPrivacyContext(privacyContext, chainId);
    if (
      chainId !== 11155111 ||
      owner.subject.kind !== "public-address" ||
      owner.subject.role !== "transaction-rpc" ||
      from.toLowerCase() !== owner.subject.principal
    )
      throw privacyError(
        "PRIVATE_JOURNAL_SCOPE",
        "Unsupported submission scope",
      );
    const key = JSON.stringify([
      owner.profileId,
      chainId,
      owner.subject.principal,
    ]);
    if (active.has(key))
      throw privacyError(
        "PRIVATE_SEND_IN_PROGRESS",
        "Another submission is active",
      );
    active.add(key);
    let released = false;
    return Object.freeze({
      assertActive() {
        if (released)
          throw privacyError("PRIVATE_SEND_ENDED", "Submission ended");
        context.getPrivacyContext(privacyContext, chainId);
      },
      release() {
        if (!released) {
          released = true;
          active.delete(key);
        }
      },
    });
  }
  return Object.freeze({ acquireSubmissionLease });
}
module.exports = { createLeaseHost };
