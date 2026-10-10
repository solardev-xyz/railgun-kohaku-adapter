"use strict";
// Installs a disposable, independent application from this checkout's npm pack.
// No account, runtime archive, Tor process or wallet service is opened here.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const source = path.resolve(__dirname, "../..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function assertEnvironment(env) {
  for (const name of Object.keys(env)) {
    if (
      /^(ELECTRON_|electron_|npm_config_)/i.test(name) ||
      ["NODE_OPTIONS", "NODE_PATH"].includes(name)
    )
      throw new Error(`Unset runtime override before installing: ${name}`);
  }
}
function childEnvironment(env) {
  assertEnvironment(env);
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) =>
        ["PATH", "HOME", "TMPDIR", "LANG"].includes(name) ||
        /^LC_[A-Z_]+$/.test(name),
    ),
  );
}
function assertNoParentModules(app, home) {
  let parent = path.dirname(app);
  for (;;) {
    if (fs.existsSync(path.join(parent, "node_modules")))
      throw new Error("Parent node_modules would permit dependency borrowing");
    const next = path.dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  for (const name of [".node_modules", ".node_libraries"])
    if (fs.existsSync(path.join(home, name)))
      throw new Error("Global user modules would permit dependency borrowing");
}
function assertLockedDependencies(before, after) {
  for (const [name, row] of Object.entries(before.packages)) {
    if (!name) continue;
    for (const field of ["version", "resolved", "integrity"])
      if (row[field] !== after.packages[name]?.[field])
        throw new Error(`Locked dependency changed: ${name}`);
  }
}
function treeIdentity(directory) {
  const root = fs.realpathSync(directory),
    rows = [];
  function walk(current) {
    for (const name of fs.readdirSync(current).sort()) {
      const file = path.join(current, name),
        stat = fs.lstatSync(file);
      const relative = path.relative(root, file).split(path.sep).join("/");
      if (stat.isSymbolicLink()) {
        const resolved = fs.realpathSync(file);
        if (resolved !== root && !resolved.startsWith(root + path.sep))
          throw new Error("Runtime symlink escapes distribution");
        rows.push([relative, "symlink", fs.readlinkSync(file)]);
      } else if (stat.isDirectory()) walk(file);
      else if (stat.isFile())
        rows.push([
          relative,
          "file",
          hash(fs.readFileSync(file)),
          stat.mode & 0o777,
        ]);
      else throw new Error("Unexpected runtime file type");
    }
  }
  walk(root);
  rows.sort((a, b) => a[0].localeCompare(b[0], "en"));
  return { sha256: hash(JSON.stringify(rows)), entries: rows.length };
}
function measuredZip(cache, name, expected) {
  const matches = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Unexpected cache symlink");
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === name) matches.push(file);
    }
  }
  walk(cache);
  if (matches.length !== 1)
    throw new Error("Expected exactly one downloaded Electron zip");
  const actual = hash(fs.readFileSync(matches[0]));
  if (actual !== expected)
    throw new Error("Downloaded Electron zip checksum differs");
  return { name, expectedSha256: expected, measuredSha256: actual };
}
function install(destination) {
  if (
    !path.isAbsolute(destination) ||
    path.resolve(destination) !== destination ||
    fs.existsSync(destination) ||
    destination.startsWith(source + path.sep) ||
    fs.realpathSync(path.dirname(destination)) !== path.dirname(destination)
  )
    throw new Error(
      "Use a new absolute directory outside the checkout, under a canonical existing parent",
    );
  const env = childEnvironment(process.env);
  const git = (args) => {
    const result = spawnSync("git", args, {
      cwd: source,
      env,
      encoding: "utf8",
    });
    if (result.status !== 0) throw new Error("Git source identity unavailable");
    return result.stdout.trim();
  };
  if (git(["status", "--porcelain", "--untracked-files=all"]))
    throw new Error("Commit the reviewed source before the qualifying install");
  const sourceCommit = git(["rev-parse", "HEAD"]);
  fs.mkdirSync(destination, { mode: 0o700 });
  const npmrc = path.join(destination, "empty-user.npmrc");
  const globalNpmrc = path.join(destination, "empty-global.npmrc");
  fs.writeFileSync(npmrc, "", { flag: "wx", mode: 0o600 });
  fs.writeFileSync(globalNpmrc, "", { flag: "wx", mode: 0o600 });
  env.electron_config_cache = path.join(destination, "electron-cache");
  const log = fs.openSync(
    path.join(destination, "installation.log"),
    "wx",
    0o600,
  );
  const run = (command, args, cwd, capture = false) => {
    if (command === "npm")
      args = [
        "--userconfig",
        npmrc,
        "--globalconfig",
        globalNpmrc,
        "--cache",
        path.join(destination, "npm-cache"),
        ...args,
      ];
    const result = spawnSync(command, args, {
      cwd,
      env,
      encoding: "utf8",
      timeout: 15 * 60 * 1000,
      stdio: capture ? ["ignore", "pipe", log] : ["ignore", log, log],
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0)
      throw new Error(
        `Installation step failed: ${command}; inspect installation.log`,
      );
    return result.stdout;
  };
  try {
    const packed = JSON.parse(
      run(
        "npm",
        [
          "pack",
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          destination,
        ],
        source,
        true,
      ),
    )[0];
    const tar = path.join(destination, packed.filename);
    const app = path.join(destination, "app");
    assertNoParentModules(app, env.HOME);
    fs.mkdirSync(app, { mode: 0o700 });
    const example = path.join(source, "examples/reference-wallet");
    const inventory = JSON.parse(
      fs.readFileSync(path.join(example, "host/sources.json")),
    );
    for (const name of [...inventory, "README.md", "JOURNEY.md", "ARTI.md"]) {
      const to = path.join(app, name);
      fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
      fs.copyFileSync(path.join(example, name), to, fs.constants.COPYFILE_EXCL);
    }
    // Registry packages come from the committed lock. Lifecycle scripts are off;
    // Electron's pinned downloader is the sole explicit installation script.
    run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], app);
    const originalLock = JSON.parse(
      fs.readFileSync(path.join(app, "package-lock.json")),
    );
    run(
      "npm",
      [
        "install",
        "--save-exact",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        `../${packed.filename}`,
      ],
      app,
    );
    const installedLock = JSON.parse(
      fs.readFileSync(path.join(app, "package-lock.json")),
    );
    assertLockedDependencies(originalLock, installedLock);
    const local = createRequire(path.join(app, "package.json"));
    run(
      process.execPath,
      [path.join(app, "node_modules/electron/install.js")],
      app,
    );
    const adapter = path.join(
      app,
      "node_modules/@freedom/railgun-kohaku-adapter",
    );
    if (fs.realpathSync(adapter) !== adapter)
      throw new Error("Adapter must be a physical installed package");
    run("npm", ["ls", "--all", "--json"], app);
    for (const [name, row] of Object.entries(installedLock.packages)) {
      if (!name) continue;
      const directory = path.join(app, name);
      if (
        fs.realpathSync(directory) !== directory ||
        JSON.parse(fs.readFileSync(path.join(directory, "package.json")))
          .version !== row.version
      )
        throw new Error(`Locked package is not physically installed: ${name}`);
    }
    const expected = path.join(destination, "unpacked");
    fs.mkdirSync(expected, { mode: 0o700 });
    run("tar", ["-xzf", tar, "-C", expected], destination);
    const fileSet = (directory, base = directory) =>
      fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
          const file = path.join(directory, entry.name);
          if (entry.isSymbolicLink())
            throw new Error("Installed package contains a symlink");
          return entry.isDirectory()
            ? fileSet(file, base)
            : [path.relative(base, file).split(path.sep).join("/")];
        })
        .sort();
    if (
      JSON.stringify(fileSet(adapter)) !==
      JSON.stringify(packed.files.map((row) => row.path).sort())
    )
      throw new Error("Installed adapter file set differs from tar");
    for (const row of packed.files) {
      const original = fs.readFileSync(
        path.join(expected, "package", row.path),
      );
      if (!original.equals(fs.readFileSync(path.join(adapter, row.path))))
        throw new Error(`Installed adapter differs from tar: ${row.path}`);
    }
    const dependencies = {};
    for (const [name, version] of Object.entries({
      electron: "44.7.0",
      ethers: "6.17.0",
      "better-sqlite3": "13.0.3",
    })) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(app, "node_modules", name, "package.json")),
      );
      if (manifest.version !== version)
        throw new Error(`Unexpected runtime version: ${name}`);
      dependencies[name] = manifest.version;
    }
    const electron = local("electron");
    if (
      !fs
        .realpathSync(electron)
        .startsWith(path.join(app, "node_modules/electron/dist") + path.sep)
    )
      throw new Error("Electron must be installed under this application");
    const version = run(electron, ["--version"], app, true).trim();
    if (version !== "v44.7.0")
      throw new Error("Electron executable version mismatch");
    const checksums = JSON.parse(
      fs.readFileSync(path.join(app, "node_modules/electron/checksums.json")),
    );
    const zipName = `electron-v44.7.0-${process.platform}-${process.arch}.zip`;
    if (!/^[0-9a-f]{64}$/.test(checksums[zipName] ?? ""))
      throw new Error("Electron checksum absent for this platform");
    const host = local("./host/source-identity.cjs").createSourceIdentityHost();
    const record = {
      version: 1,
      passed: true,
      sourceCommit,
      nodeExecutable: process.execPath,
      npm: run("npm", ["--version"], app, true).trim(),
      environmentNames: Object.keys(env).sort(),
      caches: "isolated, initially empty",
      committedManifestSha256: hash(
        fs.readFileSync(path.join(example, "package.json")),
      ),
      committedLockSha256: hash(
        fs.readFileSync(path.join(example, "package-lock.json")),
      ),
      electronLauncherSha256: hash(fs.readFileSync(electron)),
      electronDistribution: treeIdentity(
        path.join(app, "node_modules/electron/dist"),
      ),
      electronZip: measuredZip(
        env.electron_config_cache,
        zipName,
        checksums[zipName],
      ),
      electronChecksumManifestSha256: hash(
        fs.readFileSync(path.join(app, "node_modules/electron/checksums.json")),
      ),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      package: {
        name: packed.name,
        version: packed.version,
        sha256: hash(fs.readFileSync(tar)),
        integrity: packed.integrity,
        files: packed.files.length,
      },
      dependencies,
      electronVersion: version,
      installedManifestSha256: hash(
        fs.readFileSync(path.join(app, "package.json")),
      ),
      installedLockSha256: hash(
        fs.readFileSync(path.join(app, "package-lock.json")),
      ),
      hostSourceSha256: host.readDigest(),
      cacheDigests: host.readCacheDigests(),
      scope:
        "fresh dependency installation and executable version only; no account or network wallet operation",
    };
    if (
      git(["rev-parse", "HEAD"]) !== sourceCommit ||
      git(["status", "--porcelain", "--untracked-files=all"])
    )
      throw new Error("Source changed during installation");
    fs.writeFileSync(
      path.join(destination, "INSTALLATION.json"),
      JSON.stringify(record, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    return { destination, ...record };
  } finally {
    fs.closeSync(log);
  }
}
if (require.main === module) {
  try {
    if (process.argv.length !== 3)
      throw new Error(
        "Usage: node tools/conformance/install-reference.cjs /absolute/new-directory",
      );
    console.log(JSON.stringify(install(process.argv[2]), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = {
  install,
  assertEnvironment,
  childEnvironment,
  assertLockedDependencies,
  assertNoParentModules,
  treeIdentity,
  measuredZip,
};
