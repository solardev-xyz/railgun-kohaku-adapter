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
test("the fixed Sentio continuation resumes from a stopped first ledger and never begins a generation", () => {
  const env = liveEnvironment();
  const crypto = require("crypto");
  const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
  const ledger = require(
    env.path.join(env.tools, "installed-live/live-ledger.cjs"),
  );
  const first = env.launcher.makeRequest(env.spec());
  for (const kind of ["scan-open:new", "scan-open:pending", "scan-range"])
    ledger.consume(
      first.profileDirectory,
      first.ledgerHeader,
      kind,
      ledger.policyFor(first.ledgerHeader.caps, kind),
    );
  const predecessor = {
    name: ledger.FIRST,
    ledgerSha256: hash(
      env.fs.readFileSync(ledger.ledgerFile(first.profileDirectory)),
    ),
    headerSha256: hash(JSON.stringify(first.ledgerHeader)),
    reason: "frozen endpoint rejects scan windows",
  };
  const continuation = (
    params,
    rpc = { source: "sentio", url: ledger.SENTIO },
  ) => {
    const spec = JSON.parse(env.fs.readFileSync(env.spec(), "utf8"));
    const name = env.spec({
      ledger: ledger.CONTINUATION,
      params,
      binding: { ...spec.binding, rpc, predecessor },
      live: { ...spec.live, rpcSource: rpc.source },
    });
    return env.launcher.makeRequest(name);
  };
  const resumed = continuation({ publicCache: "pending" });
  expect(resumed.ledgerHeader.name).toBe(ledger.CONTINUATION);
  expect(env.launcher.admit(resumed)).toBe(0);
  expect(env.launcher.validate(resumed).budgets["scan-open:new"]).toHaveLength(
    1,
  );
  expect(() =>
    env.launcher.validate(continuation({ publicCache: "new" })),
  ).toThrow();
  expect(() =>
    continuation(
      { publicCache: "pending" },
      { source: "tenderly", url: "https://gateway.tenderly.co/public/sepolia" },
    ),
  ).toThrow();
  // The first ledger cannot bind a predecessor, and stays readable until the continuation writes.
  const spec = JSON.parse(env.fs.readFileSync(env.spec(), "utf8"));
  expect(() =>
    env.launcher.makeRequest(
      env.spec({ binding: { ...spec.binding, predecessor } }),
    ),
  ).toThrow();
  expect(env.launcher.validate(first).budgets["scan-range"]).toHaveLength(1);
});
test("the fixed resume verifies its claim against the stopped continuation and carries the reviewed extension", () => {
  const env = liveEnvironment();
  const crypto = require("crypto");
  const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
  const ledger = require(
    env.path.join(env.tools, "installed-live/live-ledger.cjs"),
  );
  const first = env.launcher.makeRequest(env.spec());
  for (const kind of ["scan-open:new", "scan-open:pending", "scan-range"])
    ledger.consume(
      first.profileDirectory,
      first.ledgerHeader,
      kind,
      ledger.policyFor(first.ledgerHeader.caps, kind),
    );
  const base = JSON.parse(env.fs.readFileSync(env.spec(), "utf8"));
  const sentio = { source: "sentio", url: ledger.SENTIO };
  const link = (name, header, file) => ({
    name,
    ledgerSha256: hash(env.fs.readFileSync(file)),
    headerSha256: hash(JSON.stringify(header)),
    reason: "stopped",
  });
  const continuation = env.launcher.makeRequest(
    env.spec({
      ledger: ledger.CONTINUATION,
      params: { publicCache: "pending" },
      binding: {
        ...base.binding,
        rpc: sentio,
        predecessor: link(
          ledger.FIRST,
          first.ledgerHeader,
          ledger.ledgerFile(first.profileDirectory),
        ),
      },
      live: { ...base.live, rpcSource: "sentio" },
    }),
  );
  ledger.consume(
    continuation.profileDirectory,
    continuation.ledgerHeader,
    "scan-open:pending",
    ledger.policyFor(continuation.ledgerHeader.caps, "scan-open:pending"),
  );
  for (let i = 0; i < 3; i++)
    ledger.consume(
      continuation.profileDirectory,
      continuation.ledgerHeader,
      "scan-range",
      ledger.policyFor(continuation.ledgerHeader.caps, "scan-range"),
    );
  const resume = (resumeFrom, params = { publicCache: "pending" }) =>
    env.launcher.makeRequest(
      env.spec({
        ledger: ledger.RESUME,
        params,
        binding: {
          ...base.binding,
          rpc: sentio,
          predecessor: link(
            ledger.CONTINUATION,
            continuation.ledgerHeader,
            ledger.ledgerFile(
              continuation.profileDirectory,
              ledger.CONTINUATION,
            ),
          ),
          resumeFrom,
        },
        live: { ...base.live, rpcSource: "sentio" },
      }),
    );
  const good = resume({
    checkpoint: 199999,
    failedTarget: 299999,
    evidence: "3 reservations under the 100k plan",
  });
  expect(good.ledgerHeader.caps.scanResumes).toBe(5);
  expect(env.launcher.admit(good)).toBe(0);
  const budgets = env.launcher.validate(good).budgets;
  expect(budgets["scan-open:pending"]).toHaveLength(2);
  expect(budgets["scan-range"]).toHaveLength(4);
  for (const bad of [
    { checkpoint: 99999, failedTarget: 199999, evidence: "x" },
    { checkpoint: 199999, failedTarget: 399999, evidence: "x" },
  ])
    expect(() => env.launcher.validate(resume(bad))).toThrow();
  expect(() =>
    env.launcher.validate(
      resume(good.ledgerHeader.binding.resumeFrom, { publicCache: "new" }),
    ),
  ).toThrow();
  // The continuation and first ledger stay readable until the resume writes.
  expect(
    env.launcher.validate(continuation).budgets["scan-range"],
  ).toHaveLength(4);
});
test("the second resume link carries the same claim, checked against the first resume's windows", () => {
  const env = liveEnvironment();
  const crypto = require("crypto");
  const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
  const ledger = require(
    env.path.join(env.tools, "installed-live/live-ledger.cjs"),
  );
  const base = JSON.parse(env.fs.readFileSync(env.spec(), "utf8"));
  const sentio = { source: "sentio", url: ledger.SENTIO };
  const link = (name, request) => ({
    name,
    ledgerSha256: hash(
      env.fs.readFileSync(ledger.ledgerFile(request.profileDirectory, name)),
    ),
    headerSha256: hash(JSON.stringify(request.ledgerHeader)),
    reason: "stopped",
  });
  const make = (ledgerName, binding, params = { publicCache: "pending" }) =>
    env.launcher.makeRequest(
      env.spec({
        ledger: ledgerName,
        params,
        binding: { ...base.binding, rpc: sentio, ...binding },
        live: { ...base.live, rpcSource: "sentio" },
      }),
    );
  const consume = (request, kind, extra) =>
    ledger.consume(
      request.profileDirectory,
      request.ledgerHeader,
      kind,
      ledger.policyFor(request.ledgerHeader.caps, kind),
      Date.now(),
      extra,
    );
  const first = env.launcher.makeRequest(env.spec());
  for (const kind of ["scan-open:new", "scan-open:pending", "scan-range"])
    consume(first, kind);
  const continuation = make(ledger.CONTINUATION, {
    predecessor: link(ledger.FIRST, first),
  });
  consume(continuation, "scan-open:pending");
  for (let i = 0; i < 3; i++) consume(continuation, "scan-range");
  const claim = {
    checkpoint: 199999,
    failedTarget: 299999,
    evidence: "3 reservations under the 100k plan",
  };
  const resume = make(ledger.RESUME, {
    predecessor: link(ledger.CONTINUATION, continuation),
    resumeFrom: claim,
  });
  consume(resume, "scan-open:pending");
  ledger.resumeAttempt(
    resume.profileDirectory,
    resume.ledgerHeader,
    "first",
    199999,
    299999,
    299999,
  );
  consume(resume, "scan-range", { target: 299999 });
  const second = make(ledger.RESUME2, {
    predecessor: link(ledger.RESUME, resume),
    resumeFrom: claim,
  });
  expect(second.ledgerHeader.caps.scanResumes).toBe(5);
  expect(env.launcher.admit(second)).toBe(0);
  expect(
    env.launcher.validate(second).budgets["scan-open:pending"],
  ).toHaveLength(3);
  // A different claim, or a first-resume window with another target, refuses.
  expect(() =>
    env.launcher.validate(
      make(ledger.RESUME2, {
        predecessor: link(ledger.RESUME, resume),
        resumeFrom: { ...claim, failedTarget: 399999 },
      }),
    ),
  ).toThrow();
  consume(resume, "scan-range", { target: 319999 });
  expect(() =>
    env.launcher.validate(
      make(ledger.RESUME2, {
        predecessor: link(ledger.RESUME, resume),
        resumeFrom: claim,
      }),
    ),
  ).toThrow();
});
test("live polling stays within the vault lifetime and the lifetime override is pinned", () => {
  const env = liveEnvironment();
  expect(() =>
    env.launcher.validate(
      env.launcher.makeRequest(
        env.spec({ mode: "live-observe", params: { maxMs: 11 * 60 * 1000 } }),
      ),
    ),
  ).toThrow();
  expect(() =>
    env.launcher.validate(
      env.launcher.makeRequest(
        env.spec({ mode: "live-observe", params: { unlockMs: 60000 } }),
      ),
    ),
  ).toThrow();
  const request = env.launcher.makeRequest(
    env.spec({ mode: "live-observe", params: { maxMs: 10 * 60 * 1000 } }),
  );
  expect(Object.keys(request.recipeFiles)).toContain(
    env.path.join(env.tools, "installed-live/vault-lifetime.cjs"),
  );
});
test("the post-send header keeps the third link's caps and carries no resume claim", () => {
  const ledger = require("../tools/qualification/installed-live/live-ledger.cjs");
  const sentio = {
    ...binding,
    rpc: { url: ledger.SENTIO },
    predecessor: { name: ledger.RESUME3 },
  };
  const header = headerFor(
    { ...request, ledger: ledger.JOURNEY2 },
    sentio,
    null,
  );
  expect(header.name).toBe(ledger.JOURNEY2);
  expect(header.caps.scanResumes).toBe(17);
  expect(() =>
    headerFor(
      { ...request, ledger: ledger.JOURNEY2 },
      {
        ...sentio,
        resumeFrom: { checkpoint: 1, failedTarget: 2, evidence: "x" },
      },
      null,
    ),
  ).toThrow();
  expect(() =>
    headerFor(
      { ...request, ledger: ledger.JOURNEY2 },
      { ...binding, predecessor: { name: ledger.RESUME3 } },
      null,
    ),
  ).toThrow();
});
test("the upgrade header names this exact identity and derives its phase caps from the bound boundary", () => {
  const ledger = require("../tools/qualification/installed-live/live-ledger.cjs");
  const sentio = {
    ...binding,
    rpc: { url: ledger.SENTIO },
    predecessor: { name: ledger.JOURNEY2 },
  };
  const base = headerFor({ ...request, ledger: ledger.JOURNEY2 }, sentio, null);
  const boundary = {
    scanRanges: 245,
    txidPages: 52,
    scanOpenNew: 1,
    scanOpenPending: 16,
    poiStatus: 1,
  };
  const to = {
    freedomCommit: request.hostCommit,
    packageCommit: request.packageCommit,
    packageTarSha256: request.packageTarPin.sha256,
    runnerSha256: base.runnerSha256,
  };
  const upgrade = {
    from: { ...to, freedomCommit: "9".repeat(40) },
    to,
    reason: "x",
  };
  const phase = { boundary, additions: { ...ledger.UPGRADE_ADDITIONS } };
  const header = headerFor(
    { ...request, ledger: ledger.JOURNEY3 },
    { ...sentio, upgrade, phase },
    null,
  );
  expect(header.caps).toMatchObject({
    scanRanges: 645,
    txidPages: 112,
    rebuildNew: 2,
    scanResumes: 27,
    poiStatus: {
      max: 5,
      minSpacingMs: 600000,
      windowMs: 86400000,
      phaseFrom: 1,
    },
    poiRetries: 1,
    perSendMaxGasFeeWei: "2000000000000000",
    totalMaxFeeWei: "4000000000000000",
  });
  for (const changed of [
    { ...upgrade, to: { ...to, runnerSha256: "0".repeat(64) } },
    { ...upgrade, to: { ...to, packageTarSha256: "0".repeat(64) } },
  ])
    expect(() =>
      headerFor(
        { ...request, ledger: ledger.JOURNEY3 },
        { ...sentio, upgrade: changed, phase },
        null,
      ),
    ).toThrow();
  expect(() =>
    headerFor(
      { ...request, ledger: ledger.JOURNEY3 },
      {
        ...sentio,
        upgrade,
        phase: { ...phase, additions: { ...phase.additions, scanRanges: 401 } },
      },
      null,
    ),
  ).toThrow();
  expect(() =>
    headerFor({ ...request, ledger: ledger.JOURNEY3 }, sentio, null),
  ).toThrow();
  expect(() =>
    headerFor(
      { ...request, ledger: ledger.JOURNEY2 },
      { ...sentio, upgrade, phase },
      null,
    ),
  ).toThrow();
});
test("the circuit header names this identity and the runtime's own POI artifacts, and derives its phase caps", () => {
  const fs = require("fs"),
    os = require("os"),
    path = require("path");
  const ledger = require("../tools/qualification/installed-live/live-ledger.cjs");
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "installed-live-circuit-")),
  );
  for (const kind of ["wasm", "zkey", "vkey"])
    fs.writeFileSync(path.join(directory, "POI_3x3." + kind), "poi " + kind);
  const crypto = require("crypto");
  const pins = Object.fromEntries(
    ["wasm", "zkey", "vkey"].map((kind) => {
      const bytes = fs.readFileSync(path.join(directory, "POI_3x3." + kind));
      return [
        kind,
        {
          bytes: bytes.length,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        },
      ];
    }),
  );
  const runtime = { artifactDirectory: directory };
  const sentio = {
    ...binding,
    rpc: { url: ledger.SENTIO },
    predecessor: { name: ledger.JOURNEY3 },
  };
  const base = headerFor({ ...request, ledger: ledger.JOURNEY2 }, sentio, null);
  const boundary = {
    scanRanges: 622,
    txidPages: 109,
    scanOpenNew: 2,
    scanOpenPending: 11,
    poiStatus: 2,
  };
  const to = {
    freedomCommit: request.hostCommit,
    packageCommit: request.packageCommit,
    packageTarSha256: request.packageTarPin.sha256,
    runnerSha256: base.runnerSha256,
  };
  const artifacts = {
    from: { POI_3x3: { ...ledger.RETIRED_POI_3X3 } },
    to: { POI_3x3: pins },
  };
  const upgrade = {
    from: { ...to, freedomCommit: "9".repeat(40) },
    to,
    reason: "x",
    artifacts,
  };
  const phase = { boundary, additions: { ...ledger.REPROOF_ADDITIONS } };
  const circuit = { ...request, ledger: ledger.JOURNEY4, runtime };
  const header = headerFor(circuit, { ...sentio, upgrade, phase }, null);
  expect(header.caps).toEqual({
    sends: 2,
    perSendMaxGasFeeWei: "2000000000000000",
    totalMaxFeeWei: "4000000000000000",
    ...LIVE_CAPS,
    scanRanges: 1022,
    txidPages: 169,
    rebuildNew: 3,
    scanResumes: 22,
    poiStatus: {
      max: 6,
      minSpacingMs: 600000,
      windowMs: 86400000,
      phaseFrom: 2,
    },
    poiRetries: 1,
    poiReproofs: 1,
  });
  for (const changed of [
    { ...upgrade, to: { ...to, runnerSha256: "0".repeat(64) } },
    { ...upgrade, artifacts: { ...artifacts, to: { POI_3x3: { ...pins, vkey: { ...pins.vkey, bytes: 1 } } } } },
    { ...upgrade, artifacts: { ...artifacts, from: { POI_3x3: pins } } },
    (({ artifacts: _a, ...rest }) => rest)(upgrade),
  ])
    expect(() =>
      headerFor(circuit, { ...sentio, upgrade: changed, phase }, null),
    ).toThrow();
  // Re-read on every derivation: a changed runtime file refuses.
  fs.writeFileSync(path.join(directory, "POI_3x3.zkey"), "other zkey");
  expect(() =>
    headerFor(circuit, { ...sentio, upgrade, phase }, null),
  ).toThrow();
  fs.writeFileSync(path.join(directory, "POI_3x3.zkey"), "poi zkey");
  expect(headerFor(circuit, { ...sentio, upgrade, phase }, null)).toEqual(
    header,
  );
  // The upgrade link never carries an artifact move.
  expect(() =>
    headerFor(
      { ...request, ledger: ledger.JOURNEY3, runtime },
      {
        ...sentio,
        predecessor: { name: ledger.JOURNEY2 },
        upgrade,
        phase: { boundary, additions: { ...ledger.UPGRADE_ADDITIONS } },
      },
      null,
    ),
  ).toThrow();
});
test("each upgrade link admits only its own modes and the continuation stages", () => {
  const { assertModeAdmitted } = require("../tools/qualification/installed-live/live-launcher.cjs");
  const ledger = require("../tools/qualification/installed-live/live-ledger.cjs");
  const continuing = [
    "live-poi-status",
    "live-unshield",
    "live-observe",
    "live-summary",
    "live-reconcile",
  ];
  for (const mode of ["live-reproof-rebuild", "live-poi-reproof", ...continuing])
    expect(() => assertModeAdmitted(ledger.JOURNEY4, mode)).not.toThrow();
  for (const mode of [
    "live-upgrade-rebuild",
    "live-poi-retry",
    "live-rebuild",
    "live-submit",
    "live-poi",
  ])
    expect(() => assertModeAdmitted(ledger.JOURNEY4, mode)).toThrow();
  for (const mode of ["live-upgrade-rebuild", "live-poi-retry", ...continuing])
    expect(() => assertModeAdmitted(ledger.JOURNEY3, mode)).not.toThrow();
  for (const mode of ["live-reproof-rebuild", "live-poi-reproof", "live-poi"])
    expect(() => assertModeAdmitted(ledger.JOURNEY3, mode)).toThrow();
  for (const name of [ledger.JOURNEY2, ledger.RESUME3, ledger.FIRST])
    for (const mode of [
      "live-upgrade-rebuild",
      "live-poi-retry",
      "live-reproof-rebuild",
      "live-poi-reproof",
    ])
      expect(() => assertModeAdmitted(name, mode)).toThrow();
  expect(() => assertModeAdmitted(ledger.JOURNEY2, "live-poi")).not.toThrow();
});
