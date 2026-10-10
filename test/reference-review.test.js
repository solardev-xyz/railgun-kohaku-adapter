"use strict";
const { createReviews } = require("../examples/reference-wallet/review.cjs");
test.each([
  "railgun-shield-resolution-v1",
  "railgun-held-submission-resolution-v1",
])(
  "%s clearly reviews journal settlement rather than a read",
  async (purpose) => {
    const terminal = { confirm: jest.fn(async () => true) };
    const reviews = createReviews(terminal),
      signal = new AbortController().signal;
    await reviews.disclosure(
      { purpose, allowsNextTransaction: true },
      { signal },
    );
    const [text, word, actualSignal] = terminal.confirm.mock.calls[0];
    expect(word).toBe("RESOLVE");
    expect(text).toContain("settled in the local journal");
    expect(text).toContain("It does not credit a note");
    expect(actualSignal).toBe(signal);
  },
);
test("resolution renderer refuses an unrelated purpose without asking", () => {
  const terminal = { confirm: jest.fn() };
  expect(
    createReviews(terminal).resolution(
      { purpose: "unrecognized" },
      { signal: new AbortController().signal },
    ),
  ).toBe(false);
  expect(terminal.confirm).not.toHaveBeenCalled();
});

test("transaction prompt is cancelled at its original review expiry", async () => {
  jest.useFakeTimers();
  try {
    const terminal = {
      confirm: jest.fn(
        (_text, _word, signal) =>
          new Promise((resolve) =>
            signal.addEventListener("abort", () => resolve(false), {
              once: true,
            }),
          ),
      ),
    };
    const pending = createReviews(terminal).transaction(
      {
        transaction: {},
        unsignedSerialized: "0x",
        expiresAt: Date.now() + 1000,
      },
      { signal: new AbortController().signal },
    );
    expect(terminal.confirm).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test("expired transaction review is refused without prompting", async () => {
  const terminal = { confirm: jest.fn() };
  await expect(
    createReviews(terminal).transaction(
      { expiresAt: Date.now() - 1 },
      { signal: new AbortController().signal },
    ),
  ).resolves.toBe(false);
  expect(terminal.confirm).not.toHaveBeenCalled();
});
