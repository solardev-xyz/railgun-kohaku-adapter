"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { brotliCompressSync } = require("node:zlib");
const { createHash } = require("node:crypto");
const { location, decode, acquire } = require("../tools/railgun-runtime-build/acquire-circuits.cjs");
const entry = (kind, bytes) => ({ kind, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
test("circuit locations are fixed to the reviewed bundles", () => {
  expect(location("POI_3x3", "wasm")).toBe("https://ipfs-lb.com/ipfs/QmZ2MyM6TKxffkv6stuo2hFwmUfs3q4xgMYN164Sje8new/prover/snarkjs/03x03.wasm.br");
  expect(location("01x01", "zkey")).toBe("https://ipfs-lb.com/ipfs/QmUsmnK4PFc7zDp2cmC4wBZxYLjNyRgWfs5GNcJJ2uLcpU/circuits/01x01/zkey.br");
  expect(() => location("../other", "wasm")).toThrow("CIRCUIT_SELECTION_REFUSED");
});
test("compressed bytes must match both size and hash, within the output bound", () => {
  const bytes = Buffer.from("pinned fixture");
  const pin = entry("wasm", bytes);
  expect(decode(brotliCompressSync(bytes), pin)).toEqual(bytes);
  expect(() => decode(brotliCompressSync(Buffer.from("pinned fixturE")), pin)).toThrow("CIRCUIT_PIN_MISMATCH");
  expect(() => decode(brotliCompressSync(Buffer.alloc(4096)), pin)).toThrow();
});
test("published verification key formatting is normalized without changing values", () => {
  const bytes = Buffer.from(JSON.stringify({ protocol: "groth16", nPublic: 8 }, null, 1));
  const pin = entry("vkey", bytes);
  expect(decode(Buffer.from('{"protocol":"groth16","nPublic":8}'), pin)).toEqual(bytes);
  expect(() => decode(Buffer.from('{"protocol":"groth16","nPublic":9}'), pin)).toThrow("CIRCUIT_PIN_MISMATCH");
});
test("existing directories and relative paths refuse before networking or mutation", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "circuit-acquisition-"));
  await expect(acquire(root)).rejects.toThrow("CIRCUIT_DESTINATION_REFUSED");
  await expect(acquire("relative")).rejects.toThrow("CIRCUIT_DESTINATION_REFUSED");
  expect(fs.readdirSync(root)).toEqual([]);
});
