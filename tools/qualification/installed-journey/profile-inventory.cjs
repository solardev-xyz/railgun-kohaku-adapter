/** Synthetic-profile file inventory for continuity evidence: relative path to
 * size and sha256 of each regular file; symbolic links are listed, never
 * followed. Hashes only, never contents. */
'use strict';
const fs = require('fs'),
  path = require('path'),
  { createHash } = require('crypto');
function inventoryProfile(root) {
  const files = {},
    links = [];
  const visit = (folder) => {
    for (const name of fs.readdirSync(folder).sort()) {
      const full = path.join(folder, name),
        rel = path.relative(root, full),
        st = fs.lstatSync(full);
      if (st.isSymbolicLink()) links.push(rel);
      else if (st.isDirectory()) visit(full);
      else if (st.isFile())
        files[rel] = {
          bytes: st.size,
          sha256: createHash('sha256').update(fs.readFileSync(full)).digest('hex'),
        };
    }
  };
  visit(root);
  return { files, links };
}
function diffInventory(before, after) {
  const result = { unchanged: [], changed: [], added: [], removed: [] };
  for (const [name, value] of Object.entries(after.files)) {
    const old = before.files[name];
    if (!old) result.added.push(name);
    else if (old.sha256 === value.sha256) result.unchanged.push(name);
    else result.changed.push(name);
  }
  for (const name of Object.keys(before.files)) if (!after.files[name]) result.removed.push(name);
  return result;
}
module.exports = { inventoryProfile, diffInventory };
