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
      !["--profile", "--config", "--cache"].includes(name) ||
      Object.hasOwn(options, name)
    )
      refuse();
    options[name] = name === "--cache" ? rest[i + 1] : absolute(rest[i + 1]);
  }
  if (
    !options["--profile"] ||
    (command.startsWith("account-") && !options["--config"])
  )
    refuse();
  if (
    options["--cache"] !== undefined &&
    (command !== "account-info" ||
      !["active", "pending"].includes(options["--cache"]))
  )
    refuse();
  return Object.freeze({
    command,
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
  return Object.freeze({
    ...value,
    runtime: Object.freeze(value.runtime),
    tor: Object.freeze(value.tor),
    serviceOrigins: Object.freeze(value.serviceOrigins),
  });
}
module.exports = { parseArguments, loadConfiguration };
