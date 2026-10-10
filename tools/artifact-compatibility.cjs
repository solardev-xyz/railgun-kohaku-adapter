"use strict";
/** Maintainer preflight for public artifact files. No download, execution,
 * account access, manifest update, or claim about a deployed service's key. */
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { manifest } = require("../src/execution/railgun-artifacts");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function read(file, limit) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
    throw Error("ARTIFACT_INPUT_REFUSED");
  const bytes = fs.readFileSync(file);
  if (bytes.length > limit) throw Error("ARTIFACT_INPUT_REFUSED");
  return bytes;
}
function checkArtifacts(manifestFile, artifactDirectory) {
  const bytes = read(manifestFile, 1024 * 1024);
  const upstream = JSON.parse(bytes.toString("utf8"));
  if (!upstream || typeof upstream !== "object" || Array.isArray(upstream))
    throw Error("ARTIFACT_INPUT_REFUSED");
  if (artifactDirectory !== undefined) {
    const directory = fs.lstatSync(artifactDirectory);
    if (!directory.isDirectory() || directory.isSymbolicLink())
      throw Error("ARTIFACT_INPUT_REFUSED");
  }
  const unpinned = [];
  for (const [circuit, entry] of Object.entries(upstream)) {
    if (!Object.hasOwn(manifest, circuit)) {
      unpinned.push({ circuit, kind: null });
      continue;
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry))
      for (const kind of Object.keys(entry))
        if (!["wasm", "zkey"].includes(kind)) unpinned.push({ circuit, kind });
  }
  const checks = [];
  for (const [circuit, entries] of Object.entries(manifest)) {
    for (const entry of entries) {
      if (["wasm", "zkey"].includes(entry.kind)) {
        const observed = upstream[circuit]?.[entry.kind];
        const valid = typeof observed === "string" && /^[0-9a-f]{64}$/.test(observed);
        checks.push({ circuit, kind: entry.kind, source: "supplied-manifest",
          status: !valid ? "missing-or-invalid" : observed === entry.sha256 ? "match" : "changed",
          expected: entry.sha256, observed: valid ? observed : null });
      }
      if (artifactDirectory !== undefined) {
        let observed = null, size = null, status;
        try {
          const local = read(path.join(artifactDirectory, entry.name), entry.size + 1);
          observed = sha(local); size = local.length;
          status = size === entry.size && observed === entry.sha256 ? "match" : "changed";
        } catch { status = "missing-or-refused"; }
        checks.push({ circuit, kind: entry.kind, source: "local-artifact", status,
          expected: entry.sha256, observed, expectedBytes: entry.size, observedBytes: size });
      }
    }
  }
  return { schema: "railgun-artifact-compatibility-v1", scope: "artifact-pin-comparison", pinsMatch: checks.every((c) => c.status === "match"),
    suppliedManifestSha256: sha(bytes), localArtifactsChecked: artifactDirectory !== undefined,
    checks, unpinned, limits: ["Supplied manifest provenance and freshness must be established separately.",
      "A matching published manifest does not establish the deployed POI node's verifier.",
      "No proof, signature, download, profile or network operation was performed.",
      "Verification keys are compared to pinned bytes, not derived from the supplied zkey."] };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length < 1 || args.length > 2) throw Error("ARTIFACT_INPUT_REFUSED");
    const result = checkArtifacts(...args);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.pinsMatch) process.exitCode = 2;
  } catch {
    process.stderr.write(JSON.stringify({ pinsMatch: false, code: "ARTIFACT_INPUT_REFUSED" }) + "\n");
    process.exitCode = 1;
  }
}
module.exports = { checkArtifacts };
