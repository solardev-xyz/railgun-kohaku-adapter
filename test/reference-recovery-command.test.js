"use strict";
const {
  recoveryCommand,
} = require("../examples/reference-wallet/recovery-command.cjs");
const { poiCommand } = require("../examples/reference-wallet/poi-command.cjs");
function fixture(command) {
  const lane = {
    signal: new AbortController().signal,
    submitStored: jest.fn(async () => ({
      transactionHash: "0x" + "1".repeat(64),
      submissionStatus: "unknown",
    })),
    close: jest.fn(),
    closed: Promise.resolve(),
    list: jest.fn(async () => []),
    observe: jest.fn(async () => ({ status: "observed" })),
    resolve: jest.fn(async () => ({ status: "resolved" })),
    history: jest.fn(async () => ({ records: [], nextAfter: null })),
    prepareShield: jest.fn(async () => ({
      status: "prepared",
      capsuleDigest: "a".repeat(64),
    })),
    prepareTransact: jest.fn(async () => ({ status: "prepared" })),
    submit: jest.fn(async () => ({ status: "recovery-required" })),
    recoverAttemptedOutput: jest.fn(async () => ({ status: "matched" })),
  };
  const options = {
    command,
    holdId: "a".repeat(64),
    capsuleDigest: "b".repeat(64),
    transactionHash: "0x" + "c".repeat(64),
    signal: new AbortController().signal,
    reviews: {
      disclosure: jest.fn(() => true),
      resolution: jest.fn(() => true),
      transaction: jest.fn(() => true),
    },
    session: {
      openRecovery: jest.fn(async () => lane),
      openSubmissionRecovery: jest.fn(async () => lane),
      openShieldRecovery: jest.fn(async () => lane),
      openPoiRecovery: jest.fn(async () => lane),
    },
  };
  return { lane, options };
}
test.each([
  ["shield-history", "list"],
  ["shield-observe", "observe"],
  ["shield-resolve", "resolve"],
])("%s uses the supported companion and drains it", async (command, method) => {
  const f = fixture(command);
  await recoveryCommand(f.options);
  expect(f.options.session.openShieldRecovery).toHaveBeenCalledWith({
    signal: f.options.signal,
    reviewDisclosures: f.options.reviews.disclosure,
    reviewResolution: f.options.reviews.resolution,
  });
  expect(f.lane[method]).toHaveBeenCalledTimes(1);
  expect(f.lane.close).toHaveBeenCalledTimes(1);
  expect(f.options.session.openRecovery).not.toHaveBeenCalled();
});
test("held history requires cursor progress and never resumes or submits", async () => {
  const f = fixture("holds");
  f.lane.history.mockResolvedValue({ records: [], nextAfter: "same" });
  await expect(recoveryCommand(f.options)).rejects.toThrow("cursor");
  expect(f.lane.history).toHaveBeenCalledTimes(2);
  expect(f.lane.submit).not.toHaveBeenCalled();
  expect(f.lane.close).toHaveBeenCalledTimes(1);
});
test("observation failure closes the original lane without a retry", async () => {
  const f = fixture("observe");
  f.lane.observe.mockRejectedValue(Error("unavailable"));
  await expect(recoveryCommand(f.options)).rejects.toThrow("unavailable");
  expect(f.lane.observe).toHaveBeenCalledTimes(1);
  expect(f.lane.close).toHaveBeenCalledTimes(1);
});
test.each([
  ["poi-prepare-shield", "prepareShield"],
  ["poi-prepare-transact", "prepareTransact"],
  ["poi-submit", "submit"],
  ["poi-recover", "recoverAttemptedOutput"],
])("%s delegates exactly one explicit action", async (command, method) => {
  const f = fixture(command);
  await poiCommand(f.options);
  expect(f.lane[method]).toHaveBeenCalledWith(
    command.startsWith("poi-prepare")
      ? f.options.holdId
      : f.options.capsuleDigest,
  );
  expect(f.lane[method]).toHaveBeenCalledTimes(1);
  expect(f.lane.close).toHaveBeenCalledTimes(1);
  if (method !== "submit") expect(f.lane.submit).not.toHaveBeenCalled();
});
test("POI transport failure never causes another handoff", async () => {
  const f = fixture("poi-submit");
  f.lane.submit.mockRejectedValue(Error("unavailable"));
  await expect(poiCommand(f.options)).rejects.toThrow();
  expect(f.lane.submit).toHaveBeenCalledTimes(1);
  expect(f.lane.close).toHaveBeenCalledTimes(1);
});

test("explicit retained submission forwards legacy callback signatures and never prepares a second operation", async () => {
  const f = fixture("submit-stored");
  const result = await recoveryCommand(f.options);
  expect(result.outcome.submissionStatus).toBe("unknown");
  expect(f.lane.submitStored).toHaveBeenCalledTimes(1);
  expect(f.lane.submitStored).toHaveBeenCalledWith(f.options.holdId);
  const callbacks = f.options.session.openRecovery.mock.calls[0][0];
  const summary = { operation: "public-fixture" };
  callbacks.reviewDisclosures(summary, f.options.signal);
  callbacks.reviewTransaction(summary);
  expect(f.options.reviews.disclosure).toHaveBeenCalledWith(summary, {
    signal: f.options.signal,
  });
  expect(f.options.reviews.transaction).toHaveBeenCalledWith(summary, {
    signal: f.lane.signal,
  });
  expect(f.lane.close).toHaveBeenCalledTimes(1);
  expect(f.lane.prepareShield).not.toHaveBeenCalled();
});

test("retained submission failure calls once and waits for the original lane close", async () => {
  const f = fixture("submit-stored");
  let drain;
  f.lane.closed = new Promise((resolve) => {
    drain = resolve;
  });
  f.lane.submitStored.mockRejectedValue(Error("refused"));
  let finished = false;
  const pending = recoveryCommand(f.options).finally(() => {
    finished = true;
  });
  const expected = expect(pending).rejects.toThrow("refused");
  await new Promise((resolve) => setImmediate(resolve));
  expect(finished).toBe(false);
  expect(f.lane.close).toHaveBeenCalledTimes(1);
  expect(f.lane.submitStored).toHaveBeenCalledTimes(1);
  drain();
  await expected;
});
