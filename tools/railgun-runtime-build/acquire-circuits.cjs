"use strict";
// Public artifact acquisition only. No profile, proof execution or pin changes.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { brotliDecompressSync } = require("node:zlib");
const { manifest } = require("./CIRCUITS.json");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const transactionBundle = "QmUsmnK4PFc7zDp2cmC4wBZxYLjNyRgWfs5GNcJJ2uLcpU";
const poiBundle = "QmZ2MyM6TKxffkv6stuo2hFwmUfs3q4xgMYN164Sje8new";
function location(circuit, kind) {
  const shape = circuit === "POI_3x3" ? "03x03" : circuit;
  if (!Object.hasOwn(manifest, circuit) || !["wasm", "zkey", "vkey"].includes(kind))
    throw Error("CIRCUIT_SELECTION_REFUSED");
  const member = kind === "wasm" ? `prover/snarkjs/${shape}.wasm.br`
    : `circuits/${shape}/${kind === "zkey" ? "zkey.br" : "vkey.json"}`;
  return `https://ipfs-lb.com/ipfs/${circuit === "POI_3x3" ? poiBundle : transactionBundle}/${member}`;
}
function decode(raw, entry) {
  const bytes = entry.kind === "vkey"
    ? (raw.length === entry.size && sha(raw) === entry.sha256 ? raw
      : Buffer.from(JSON.stringify(JSON.parse(raw.toString("utf8")), null, 1)))
    : brotliDecompressSync(raw, { maxOutputLength: entry.size + 1 });
  if (bytes.length !== entry.size || sha(bytes) !== entry.sha256)
    throw Error("CIRCUIT_PIN_MISMATCH");
  return bytes;
}
async function download(url, limit) {
  const response = await fetch(url, { redirect: "error", headers: { "Accept-Encoding": "identity" }, signal: AbortSignal.timeout(120000) });
  if (response.status !== 200 || !response.body) throw Error("CIRCUIT_HTTP_REFUSED");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw Error("CIRCUIT_DOWNLOAD_BOUND");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function acquire(destination) {
  if (!path.isAbsolute(destination) || path.resolve(destination) !== destination ||
      fs.realpathSync(path.dirname(destination)) !== path.dirname(destination) ||
      fs.existsSync(destination)) throw Error("CIRCUIT_DESTINATION_REFUSED");
  fs.mkdirSync(destination, { mode: 0o700 });
  const rawDirectory = path.join(destination, "downloads");
  fs.mkdirSync(rawDirectory, { mode: 0o700 });
  const records = [];
  for (const [circuit, entries] of Object.entries(manifest)) {
    for (const entry of entries) {
      const url = location(circuit, entry.kind);
      const raw = await download(url, entry.kind === "vkey" ? 65536 : entry.size + 1048576);
      const rawName = `${entry.name}.${entry.kind === "vkey" ? "json" : "br"}`;
      fs.writeFileSync(path.join(rawDirectory, rawName), raw, { flag: "wx", mode: 0o600 });
      const bytes = decode(raw, entry);
      fs.writeFileSync(path.join(destination, entry.name), bytes, { flag: "wx", mode: 0o600 });
      records.push({ circuit, kind: entry.kind, url, downloadedBytes: raw.length,
        downloadedSha256: sha(raw), bytes: bytes.length, sha256: sha(bytes) });
      process.stdout.write(JSON.stringify({ circuit, kind: entry.kind, pinsMatch: true }) + "\n");
    }
  }
  const record = { schema: "railgun-circuit-acquisition-v1", records,
    limits: ["Gateway is untrusted transport; CIDs are not locally verified; acceptance requires exact pinned size and SHA-256.",
      "downloads/ holds raw, potentially unverified bytes retained for diagnosis.",
      "Verification keys normalized and matched to previously derived pins; not freshly derived here.",
      "No circuit execution, proof, account or service-verifier check.",
      "Public downloads use HTTPS directly; no wallet or Tor context."] };
  fs.writeFileSync(path.join(destination, "ACQUISITION.json"), JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return record;
}
if (require.main === module) {
  if (process.argv.length !== 3) {
    process.stderr.write("Usage: node acquire-circuits.cjs /absolute/new-artifact-directory\n");
    process.exitCode = 1;
  } else acquire(process.argv[2]).catch(() => {
    process.stderr.write("CIRCUIT_ACQUISITION_REFUSED: partial directory preserved\n");
    process.exitCode = 1;
  });
}
module.exports = { location, decode, acquire };
