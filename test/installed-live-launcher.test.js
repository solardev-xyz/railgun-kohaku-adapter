"use strict";
const { headerFor, LIVE_CAPS } = require("../tools/qualification/installed-live/live-launcher.cjs");
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
  const caps = { ...LIVE_CAPS, observePerSend: { max: 40, minSpacingMs: 1000 } };
  expect(headerFor(synthetic, { any: true }, caps).caps.observePerSend.minSpacingMs).toBe(1000);
  expect(() => headerFor(synthetic, { any: true }, { observePerSend: caps.observePerSend })).toThrow();
  expect(headerFor(synthetic, { any: true }, caps).runnerSha256).toBe(
    headerFor(request, binding, null).runnerSha256,
  );
});
