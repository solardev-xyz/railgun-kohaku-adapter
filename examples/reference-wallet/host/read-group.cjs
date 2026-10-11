"use strict";
// Bounded, independent reads only. Never use for journal writes, nonce selection,
// signing or sends. Every original request settles before the group returns.
async function readGroup(reads) {
  if (!Array.isArray(reads) || reads.length < 1 || reads.length > 3 ||
      reads.some(read => typeof read !== "function")) throw Error("Invalid read group");
  let failed = false, first;
  const results = await Promise.allSettled(reads.map(async read => {
    try { return await read(); }
    catch (error) {
      if (!failed) { failed = true; first = error; }
      throw error;
    }
  }));
  if (failed) throw first;
  return results.map(result => result.value);
}
module.exports = { readGroup };
