"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
function refused(code = "PRIVATE_ARTIFACT_INVALID") {
  return Object.assign(new Error("Reference proving artifact unavailable"), {
    code,
  });
}
/** Loads only manifest-listed local public bytes. The adapter separately checks
 * its own pinned manifest. There is no download or replacement fallback. */
function createArtifactHost(context) {
  let pending = 0;
  function createPrivacyArtifactLoader({ handle, directory, manifest }) {
    const owner = context.getPrivacyContext(handle);
    if (
      owner.subject.kind !== "private-account" ||
      owner.subject.role !== "artifacts" ||
      owner.subject.chainId !== 11155111 ||
      !path.isAbsolute(directory) ||
      !Array.isArray(manifest) ||
      manifest.length < 1 ||
      manifest.length > 32
    )
      throw refused();
    const root = fs.realpathSync(directory),
      entries = new Map();
    for (const entry of manifest) {
      if (
        !entry ||
        typeof entry.name !== "string" ||
        !/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(entry.name) ||
        !Number.isSafeInteger(entry.size) ||
        entry.size < 1 ||
        entry.size > 256 * 1024 * 1024 ||
        typeof entry.sha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(entry.sha256) ||
        entries.has(entry.name)
      )
        throw refused();
      entries.set(
        entry.name,
        Object.freeze({ size: entry.size, sha256: entry.sha256 }),
      );
    }
    async function load(name) {
      context.getPrivacyContext(handle);
      const entry = entries.get(name);
      if (!entry) throw refused();
      if (pending >= 2) throw refused("PRIVATE_ARTIFACT_BUSY");
      pending++;
      let descriptor,
        bytes,
        success = false;
      function active() {
        context.getPrivacyContext(handle);
        if (owner.signal.aborted) throw refused("PRIVACY_REQUEST_ABORTED");
      }
      try {
        const filename = path.join(root, name);
        const before = await fs.promises.lstat(filename);
        active();
        if (
          !before.isFile() ||
          before.isSymbolicLink() ||
          before.size !== entry.size
        )
          throw refused();
        descriptor = await fs.promises.open(
          filename,
          fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
        );
        active();
        const opened = await descriptor.stat();
        if (
          !opened.isFile() ||
          opened.size !== entry.size ||
          opened.dev !== before.dev ||
          opened.ino !== before.ino
        )
          throw refused();
        bytes = Buffer.alloc(entry.size);
        let offset = 0;
        while (offset < entry.size) {
          active();
          const { bytesRead } = await descriptor.read(
            bytes,
            offset,
            Math.min(1024 * 1024, entry.size - offset),
            offset,
          );
          if (!bytesRead) throw refused();
          offset += bytesRead;
        }
        const after = await descriptor.stat();
        if (
          ["dev", "ino", "size", "mtimeMs", "ctimeMs"].some(
            (field) => after[field] !== opened[field],
          ) ||
          createHash("sha256").update(bytes).digest("hex") !== entry.sha256
        )
          throw refused();
        await descriptor.close();
        descriptor = null;
        active();
        success = true;
        return bytes;
      } catch (error) {
        if (/^PRIVACY_/.test(error?.code)) throw error;
        throw refused();
      } finally {
        if (!success) bytes?.fill(0);
        try {
          // A failed close must not replace the original classified failure.
          if (descriptor) await descriptor.close().catch(() => {});
        } finally {
          pending--;
        }
      }
    }
    return Object.freeze({ load });
  }
  return Object.freeze({ createPrivacyArtifactLoader });
}
module.exports = { createArtifactHost };
