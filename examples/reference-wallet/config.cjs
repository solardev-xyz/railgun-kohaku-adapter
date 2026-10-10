"use strict";
const path = require("node:path"),
  fs = require("node:fs");
const { readFile, assertRoot } = require("./host/files.cjs");
const COMMANDS = new Set([
  "init",
  "restore",
  "backup",
  "account-create",
  "account-info",
  "scan",
  "wallet-rebuild",
  "wallet-resume",
  "wallet-sync",
  "address",
  "balance",
  "notes",
  "holds",
  "submit-stored",
  "observe",
  "resolve",
  "poi-status",
  "txid-sync",
  "funding-address",
  "operations",
  "scan-new",
  "receipt",
  "shield-history",
  "shield-observe",
  "shield-resolve",
  "poi-prepare-shield",
  "poi-prepare-transact",
  "poi-submit",
  "poi-recover",
  "shield",
  "pay-note",
  "unshield-note",
]);
function refuse() {
  throw Object.assign(Error("Reference configuration refused"), {
    code: "REFERENCE_CONFIG_REFUSED",
  });
}
function exact(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("\0") !== keys.slice().sort().join("\0")
  )
    refuse();
}
function absolute(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) refuse();
  return value;
}
function parseArguments(args) {
  const [command, ...rest] = args;
  if (!COMMANDS.has(command) || rest.length % 2) refuse();
  const options = Object.create(null);
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i];
    if (
      ![
        "--profile",
        "--config",
        "--cache",
        "--note",
        "--to",
        "--amount",
        "--hold",
        "--transaction",
        "--capsule",
      ].includes(name) ||
      Object.hasOwn(options, name)
    )
      refuse();
    options[name] = ["--profile", "--config"].includes(name)
      ? absolute(rest[i + 1])
      : rest[i + 1];
  }
  if (
    !options["--profile"] ||
    (!["init", "restore", "backup", "funding-address", "operations"].includes(
      command,
    ) &&
      !options["--config"])
  )
    refuse();
  if (
    options["--cache"] !== undefined &&
    (command !== "account-info" ||
      !["active", "pending"].includes(options["--cache"]))
  )
    refuse();
  if (
    [
      "submit-stored",
      "observe",
      "resolve",
      "poi-prepare-shield",
      "poi-prepare-transact",
    ].includes(command)
      ? typeof options["--hold"] !== "string" ||
        !options["--hold"] ||
        options["--hold"].length > 256
      : options["--hold"] !== undefined
  )
    refuse();
  if (
    ["receipt", "shield-observe", "shield-resolve"].includes(command)
      ? !/^0x[0-9a-f]{64}$/.test(options["--transaction"] ?? "")
      : options["--transaction"] !== undefined
  )
    refuse();
  if (
    ["poi-submit", "poi-recover"].includes(command)
      ? !/^[0-9a-f]{64}$/.test(options["--capsule"] ?? "")
      : options["--capsule"] !== undefined
  )
    refuse();
  const privatePayment = ["pay-note", "unshield-note"].includes(command);
  if (
    privatePayment || command === "poi-status"
      ? typeof options["--note"] !== "string" ||
        !options["--note"] ||
        options["--note"].length > 256 ||
        (privatePayment &&
          (typeof options["--to"] !== "string" ||
            !options["--to"] ||
            options["--to"].length > 256)) ||
        (!privatePayment && options["--to"] !== undefined)
      : options["--note"] !== undefined || options["--to"] !== undefined
  )
    refuse();
  if (
    command === "unshield-note" &&
    !/^0x[0-9a-fA-F]{40}$/.test(options["--to"])
  )
    refuse();
  if (
    command === "shield"
      ? !/^[1-9][0-9]{0,23}$/.test(options["--amount"] ?? "")
      : options["--amount"] !== undefined
  )
    refuse();
  return Object.freeze({
    command,
    noteId: options["--note"],
    holdId: options["--hold"],
    transactionHash: options["--transaction"],
    capsuleDigest: options["--capsule"],
    recipient: options["--to"],
    amount: options["--amount"],
    profile: options["--profile"],
    config: options["--config"],
    cache: options["--cache"] ?? "active",
  });
}
function loadConfiguration(filename) {
  absolute(filename);
  const root = fs.realpathSync(path.dirname(filename));
  const value = JSON.parse(readFile(root, filename, 16384).toString("utf8"));
  exact(value, [
    "version",
    "runtime",
    "tor",
    "rpcUrl",
    "serviceOrigins",
    "unlockMinutes",
  ]);
  if (
    value.version !== 1 ||
    !Number.isSafeInteger(value.unlockMinutes) ||
    value.unlockMinutes < 1 ||
    value.unlockMinutes > 60
  )
    refuse();
  exact(value.runtime, ["archive", "proverArchive", "artifactDirectory"]);
  for (const file of Object.values(value.runtime)) absolute(file);
  assertRoot(value.runtime.artifactDirectory);
  exact(value.tor, ["binary", "sha256"]);
  absolute(value.tor.binary);
  if (!/^[0-9a-f]{64}$/.test(value.tor.sha256)) refuse();
  require("./host/registry.cjs").createRegistry({ rpcUrl: value.rpcUrl });
  if (
    !Array.isArray(value.serviceOrigins) ||
    value.serviceOrigins.length > 8 ||
    new Set(value.serviceOrigins).size !== value.serviceOrigins.length
  )
    refuse();
  for (const entry of value.serviceOrigins) {
    let url;
    try {
      url = new URL(entry);
    } catch {
      refuse();
    }
    if (
      url.protocol !== "https:" ||
      url.origin !== entry ||
      url.username ||
      url.password
    )
      refuse();
  }
  // The package fixes its Sepolia POI/indexer destinations. Validate the host
  // allowlist here, before startup, rather than failing every consented page.
  if (
    !["https://ppoi.fdi.network", "https://rail-squid.squids.live"].every(
      (origin) => value.serviceOrigins.includes(origin),
    )
  )
    throw Object.assign(new Error("Required TXID service origins missing"), {
      code: "REFERENCE_TXID_CONFIGURATION_REFUSED",
    });
  return Object.freeze({
    ...value,
    runtime: Object.freeze(value.runtime),
    tor: Object.freeze(value.tor),
    serviceOrigins: Object.freeze(value.serviceOrigins),
  });
}
module.exports = { parseArguments, loadConfiguration };
