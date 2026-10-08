"use strict";
const {
  headerFor,
  LIVE_CAPS,
} = require("../tools/qualification/installed-live/live-launcher.cjs");
const request = Object.freeze({
  transport: "live",
  profileDirectory: "/profile",
  hostCommit: "a".repeat(40),
  packageCommit: "b".repeat(40),
  packageTarPin: { sha256: "c".repeat(64) },
});
const binding = Object.freeze({
  heldTransferReportSha256: "d".repeat(64),
  previousLedgers: {},
  finalRecoveryOutcomeSha256: "e".repeat(64),
  authorizationSha256: "f".repeat(64),
  rpc: { url: "https://rpc.example/" },
});
test("a live header always carries the fixed live caps and the full binding", () => {
  const header = headerFor(request, binding, null);
  expect(header.caps).toEqual({
    sends: 2,
    perSendMaxGasFeeWei: "2000000000000000",
    totalMaxFeeWei: "4000000000000000",
    ...LIVE_CAPS,
  });
  expect(header.transport).toBe("live");
  expect(() => headerFor(request, binding, { ...LIVE_CAPS })).toThrow();
  const { rpc, ...partial } = binding;
  void rpc;
  expect(() => headerFor(request, partial, null)).toThrow();
});
test("a synthetic header needs exactly the cap keys and differs from live", () => {
  const synthetic = { ...request, transport: "synthetic" };
  const caps = {
    ...LIVE_CAPS,
    observePerSend: { max: 40, minSpacingMs: 1000 },
  };
  expect(
    headerFor(synthetic, { any: true }, caps).caps.observePerSend.minSpacingMs,
  ).toBe(1000);
  expect(() =>
    headerFor(
      synthetic,
      { any: true },
      { observePerSend: caps.observePerSend },
    ),
  ).toThrow();
  expect(headerFor(synthetic, { any: true }, caps).runnerSha256).toBe(
    headerFor(request, binding, null).runnerSha256,
  );
});

// A disposable live-shaped environment: a committed host with the vendor
// tarball, an ignored Arti binary, runtime files, a profile and a held report.
// No Electron, profile credential or network is involved.
function liveEnvironment() {
  const fs = require("fs"),
    os = require("os"),
    path = require("path"),
    { execFileSync } = require("child_process");
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "installed-live-launcher-")),
  );
  const tools = path.join(root, "tools/qualification");
  for (const name of ["installed-live", "installed-journey"])
    fs.cpSync(
      path.join(__dirname, "../tools/qualification", name),
      path.join(tools, name),
      { recursive: true },
    );
  const host = path.join(root, "host");
  const write = (name, bytes) => {
    fs.mkdirSync(path.dirname(name), { recursive: true });
    fs.writeFileSync(name, bytes);
    return name;
  };
  write(
    path.join(
      host,
      "vendor/railgun-kohaku-adapter/freedom-railgun-kohaku-adapter-0.6.0.tgz",
    ),
    "package",
  );
  write(path.join(host, ".gitignore"), "arti-bin/\n");
  const arti = write(path.join(host, "arti-bin/mac-arm64/arti"), "arti");
  const git = (...args) =>
    execFileSync("/usr/bin/git", ["-C", host, ...args])
      .toString()
      .trim();
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "host");
  const runtime = {
    archive: write(path.join(root, "rt/archive"), "a"),
    proverArchive: write(path.join(root, "rt/prover"), "p"),
  };
  const held = write(path.join(root, "held.json"), '{"held":true}');
  const profile = path.join(root, "profile");
  fs.mkdirSync(profile);
  const { sha } = require(path.join(tools, "installed-journey/inventory.cjs"));
  const spec = (overrides = {}) => {
    const name = path.join(
      root,
      "spec-" + Math.random().toString(16).slice(2) + ".json",
    );
    write(
      name,
      JSON.stringify({
        mode: "live-rebuild",
        transport: "live",
        hostRoot: host,
        hostCommit: git("rev-parse", "HEAD"),
        packageCommit: "c".repeat(40),
        packageTar: write(path.join(root, "package.tgz"), "package"),
        runtime,
        electron: write(path.join(root, "rt/electron"), "e"),
        electronFramework: write(path.join(root, "rt/framework"), "f"),
        electronDefaultApp: write(path.join(root, "rt/app"), "d"),
        profileDirectory: profile,
        outputDirectory: path.join(root, "out"),
        evidenceDirectory: path.join(root, "evidence"),
        previous: null,
        lineage: null,
        params: { publicCache: "new" },
        heldReport: held,
        binding: {
          heldTransferReportSha256: sha(fs.readFileSync(held)),
          previousLedgers: {},
          finalRecoveryOutcomeSha256: "e".repeat(64),
          authorizationSha256: "f".repeat(64),
          rpc: {
            source: "tenderly",
            url: "https://gateway.tenderly.co/public/sepolia",
          },
        },
        live: {
          rpcSource: "tenderly",
          enrolledOwner: "0x" + "1".repeat(40),
          arti,
        },
        ...overrides,
      }),
    );
    return name;
  };
  const launcher = require(
    path.join(tools, "installed-live/live-launcher.cjs"),
  );
  return { fs, path, tools, launcher, spec };
}
test("a live rebuild with explicit publicCache validates before and after its run", () => {
  const env = liveEnvironment();
  for (const publicCache of ["new", "pending"]) {
    const request = env.launcher.makeRequest(
      env.spec({ params: { publicCache } }),
    );
    expect(env.launcher.admit(request)).toBe(0);
    // The post-run check validates the unchanged request.
    expect(env.launcher.validate(request).sends).toEqual([]);
    // Relabelling the mode, as the earlier postcheck did, refuses.
    expect(() =>
      env.launcher.validate({ ...request, mode: "live-observe" }),
    ).toThrow();
  }
  for (const params of [
    { fault: "exit-before-finish" },
    { publicCache: "new", extra: 1 },
  ])
    expect(() =>
      env.launcher.validate(env.launcher.makeRequest(env.spec({ params }))),
    ).toThrow();
  expect(() =>
    env.launcher.validate(
      env.launcher.makeRequest(
        env.spec({ mode: "live-observe", params: { publicCache: "new" } }),
      ),
    ),
  ).toThrow();
});
test("changing any executed launcher, process-owner or copy-contract byte invalidates the request", () => {
  const env = liveEnvironment();
  const request = env.launcher.makeRequest(env.spec());
  env.launcher.validate(request);
  for (const name of [
    "installed-live/live-launcher.cjs",
    "installed-journey/process-owner.cjs",
    "installed-journey/synthetic-copy-contract.cjs",
  ]) {
    const file = env.path.join(env.tools, name);
    const original = env.fs.readFileSync(file);
    expect(Object.keys(request.recipeFiles)).toContain(file);
    env.fs.writeFileSync(file, Buffer.concat([original, Buffer.from("\n")]));
    expect(() => env.launcher.validate(request)).toThrow();
    const changed = env.launcher.headerFor(
      request,
      request.ledgerHeader.binding,
      null,
    );
    expect(changed.runnerSha256).not.toBe(request.ledgerHeader.runnerSha256);
    env.fs.writeFileSync(file, original);
    env.launcher.validate(request);
  }
});
