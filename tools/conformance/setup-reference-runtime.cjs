"use strict";
// Development-only assembly; no account, Tor process, proof or transaction.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { childEnvironment, assertNoParentModules } = require("./install-reference.cjs");
const source = path.resolve(__dirname, "../..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function assertDestination(destination) {
  if (!path.isAbsolute(destination) || path.resolve(destination) !== destination ||
      fs.existsSync(destination) || destination.startsWith(source + path.sep) ||
      fs.realpathSync(path.dirname(destination)) !== path.dirname(destination))
    throw Error("Use a new canonical absolute runtime directory outside the checkout");
}
function assertArchive(file, manifest) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== manifest.size ||
      sha(fs.readFileSync(file)) !== manifest.sha256) throw Error("Runtime archive pin differs");
  return { name: path.basename(file), size: stat.size, sha256: manifest.sha256 };
}
function setup(destination) {
  assertDestination(destination);
  const env = childEnvironment(process.env);
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: source, env, encoding: "utf8" });
    if (result.status !== 0) throw Error("Git identity unavailable");
    return result.stdout.trim();
  };
  if (git(["status", "--porcelain", "--untracked-files=all"])) throw Error("Commit the reviewed runtime setup first");
  const commit = git(["rev-parse", "HEAD"]);
  const circuitPins = JSON.parse(fs.readFileSync(path.join(source, "tools/railgun-runtime-build/CIRCUITS.json"), "utf8"));
  if (sha(fs.readFileSync(path.join(source, "src/execution/railgun-artifacts.js"))) !== circuitPins.runtimeSourceSha256)
    throw Error("Circuit acquisition pins need review against runtime source");
  assertNoParentModules(destination, env.HOME);
  fs.mkdirSync(destination, { mode: 0o700 });
  for (const name of ["empty-user.npmrc", "empty-global.npmrc"])
    fs.writeFileSync(path.join(destination, name), "", { flag: "wx", mode: 0o600 });
  const log = fs.openSync(path.join(destination, "setup.log"), "wx", 0o600);
  try {
    const run = (command, args, cwd, additions = {}) => {
      fs.writeSync(log, JSON.stringify({ command: path.basename(command), args }) + "\n");
      const result = spawnSync(command, args, { cwd, env: { ...env, ...additions },
        stdio: ["ignore", log, log], timeout: 45 * 60000 });
      if (result.status !== 0 || result.error) throw Error("Runtime setup step failed; inspect preserved setup.log");
    };
    const prefix = "tools/railgun-runtime-build/";
    const build = path.join(destination, "build");
    for (const name of git(["ls-files", prefix]).split("\n")) {
      if (!name.startsWith(prefix) || name.split("/").includes("..")) throw Error("Invalid tracked path");
      const from = path.join(source, name), to = path.join(build, name.slice(prefix.length));
      const stat = fs.lstatSync(from);
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error("Build source must be regular files");
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(to, stat.mode & 0o777);
    }
    const npmArgs = ["--userconfig", path.join(destination, "empty-user.npmrc"),
      "--globalconfig", path.join(destination, "empty-global.npmrc"), "ci", "--ignore-scripts",
      "--cache", path.join(destination, "npm-cache"), "--no-audit", "--no-fund"];
    const toolchain = path.join(build, "toolchain");
    run("npm", npmArgs, toolchain);
    run("npm", npmArgs, path.join(build, "scripts/fixtures/railgun-engine"));
    const inputs = path.join(destination, "prover-inputs");
    run("python3", ["-B", path.join(build, "acquire-prover-inputs.py"), inputs], destination);
    const nodePath = { NODE_PATH: path.join(toolchain, "node_modules") };
    run(process.execPath, [path.join(build, "scripts/build-railgun-engine.js"), path.join(destination, "engine")], destination, nodePath);
    run(process.execPath, [path.join(build, "scripts/build-railgun-prover.js"), inputs, path.join(destination, "prover")], destination, nodePath);
    run(process.execPath, [path.join(build, "acquire-circuits.cjs"), path.join(destination, "artifacts")], destination);
    const archives = {};
    for (const kind of ["engine", "prover"]) {
      const authority = fs.readFileSync(path.join(source, `src/execution/railgun-${kind}-manifest.json`));
      if (!authority.equals(fs.readFileSync(path.join(build, `src/main/wallet/railgun-${kind}-manifest.json`))))
        throw Error("Tooling and runtime manifests differ");
      const manifest = JSON.parse(authority.toString("utf8"));
      archives[kind] = assertArchive(path.join(destination, kind, `railgun-${kind}.asar`), manifest);
    }
    if (git(["rev-parse", "HEAD"]) !== commit || git(["status", "--porcelain", "--untracked-files=all"]))
      throw Error("Source changed during runtime setup");
    const npmVersion = spawnSync("npm", ["--version"], { cwd: destination, env, encoding: "utf8", timeout: 30000 });
    if (npmVersion.status !== 0) throw Error("Npm version unavailable");
    const record = { schema: "railgun-reference-runtime-setup-v1", sourceCommit: commit,
      npm: npmVersion.stdout.trim(),
      node: process.version, platform: process.platform, arch: process.arch, archives,
      circuitAcquisitionSha256: sha(fs.readFileSync(path.join(destination, "artifacts/ACQUISITION.json"))),
      proverAcquisitionSha256: sha(fs.readFileSync(path.join(inputs, "ACQUISITION.json"))),
      toolchainLockSha256: sha(fs.readFileSync(path.join(toolchain, "package-lock.json"))),
      configurationPaths: { archive: "engine/railgun-engine.asar", proverArchive: "prover/railgun-prover.asar", artifactDirectory: "artifacts" },
      configurationPathsRelativeTo: "setup directory; resolve to absolute paths in the wallet configuration",
      limits: ["Arti is a separate pinned platform prerequisite.", "No proof execution, account, live acceptance or distribution approval.", "Direct public downloads; not wallet Tor."] };
    fs.writeFileSync(path.join(destination, "RUNTIME.json"), JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return record;
  } finally { fs.closeSync(log); }
}
if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw Error("Usage: node setup-reference-runtime.cjs /absolute/new-runtime-directory");
    process.stdout.write(JSON.stringify(setup(process.argv[2]), null, 2) + "\n");
  } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
module.exports = { assertDestination, assertArchive, setup };
