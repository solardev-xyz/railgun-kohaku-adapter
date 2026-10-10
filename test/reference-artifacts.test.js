"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { createHash } = require("node:crypto");
const {
  createContextHost,
} = require("../examples/reference-wallet/host/context.cjs");
const {
  createArtifactHost,
} = require("../examples/reference-wallet/host/artifacts.cjs");
function setup() {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "railgun-reference-artifacts-")),
  );
  const bytes = Buffer.from("public artifact fixture"),
    name = "fixture.wasm";
  fs.writeFileSync(path.join(directory, name), bytes);
  const context = createContextHost(),
    scope = context.createPrivacyScope({
      profileId: "public-fixture",
      signal: new AbortController().signal,
    });
  const handle = scope.getContext({
    kind: "private-account",
    principal: "railgun:0",
    protocol: "railgun",
    deployment: "sepolia",
    chainId: 11155111,
    role: "artifacts",
  });
  const host = createArtifactHost(context);
  const options = {
    handle,
    directory,
    manifest: [
      {
        name,
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    ],
  };
  return { host, scope, options, name, bytes };
}
test("fixed manifest returns an owned, exact public artifact buffer", async () => {
  const { host, scope, options, name, bytes } = setup();
  try {
    const loaded = await host.createPrivacyArtifactLoader(options).load(name);
    expect(loaded.equals(bytes)).toBe(true);
    expect(loaded.byteOffset).toBe(0);
    expect(loaded.buffer.byteLength).toBe(bytes.length);
  } finally {
    scope.close();
  }
});
test("unlisted name, wrong digest and substituted symlink refuse", async () => {
  const { host, scope, options, name } = setup();
  try {
    const loader = host.createPrivacyArtifactLoader(options);
    await expect(loader.load("../fixture.wasm")).rejects.toThrow();
    const broken = host.createPrivacyArtifactLoader({
      ...options,
      manifest: [{ ...options.manifest[0], sha256: "0".repeat(64) }],
    });
    await expect(broken.load(name)).rejects.toThrow();
    const file = path.join(options.directory, name);
    fs.renameSync(file, `${file}.preserved`);
    fs.symlinkSync(`${file}.preserved`, file);
    await expect(loader.load(name)).rejects.toThrow();
  } finally {
    scope.close();
  }
});
test("original load settles on cancellation without returning bytes", async () => {
  const { host, scope, options, name } = setup();
  const loader = host.createPrivacyArtifactLoader(options),
    work = loader.load(name);
  scope.close();
  await expect(work).rejects.toThrow();
});
test("load capacity remains bounded across loader instances", async () => {
  const { host, scope, options, name } = setup();
  try {
    const first = host.createPrivacyArtifactLoader(options).load(name);
    const second = host.createPrivacyArtifactLoader(options).load(name);
    await expect(
      host.createPrivacyArtifactLoader(options).load(name),
    ).rejects.toMatchObject({ code: "PRIVATE_ARTIFACT_BUSY" });
    await Promise.all([first, second]);
    await expect(
      host.createPrivacyArtifactLoader(options).load(name),
    ).resolves.toBeInstanceOf(Buffer);
  } finally {
    scope.close();
  }
});
