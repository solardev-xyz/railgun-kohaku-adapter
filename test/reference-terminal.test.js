"use strict";
const { PassThrough } = require("node:stream");
const { createTerminal } = require("../examples/reference-wallet/terminal.cjs");
function fixture() {
  const input = new PassThrough(),
    output = new PassThrough();
  input.isTTY = output.isTTY = true;
  input.setRawMode = jest.fn((value) => {
    input.isRaw = value;
  });
  let transcript = "";
  output.on("data", (value) => {
    transcript += value.toString();
  });
  return {
    input,
    output,
    terminal: createTerminal({ input, output }),
    transcript: () => transcript,
  };
}
test("secret input is bounded, unechoed, and restores terminal state", async () => {
  const f = fixture();
  const work = f.terminal.read("Password: ", { secret: true });
  f.input.write(Buffer.from("public test password\r"));
  const value = await work;
  expect(value.toString()).toBe("public test password");
  value.fill(0);
  expect(f.transcript()).toBe("Password: \n");
  expect(f.input.isRaw).toBe(false);
  expect(f.input.listenerCount("data")).toBe(0);
});
test("redirected streams refuse before accepting or revealing any bytes", async () => {
  const f = fixture();
  f.output.isTTY = false;
  await expect(
    f.terminal.read("Password: ", { secret: true }),
  ).rejects.toMatchObject({ code: "REFERENCE_TTY_REQUIRED" });
  expect(() =>
    f.terminal.showRecovery(Buffer.from(Array(24).fill("word").join(" "))),
  ).toThrow();
  expect(f.transcript()).toBe("");
});
test.each([Buffer.from([3]), Buffer.from([27]), Buffer.from("12345")])(
  "cancellation and overflow wipe the prompt lifecycle",
  async (bytes) => {
    const f = fixture();
    const work = f.terminal.read("Secret: ", { secret: true, maxBytes: 4 });
    const refused = expect(work).rejects.toMatchObject({
      code: "REFERENCE_CANCELLED",
    });
    f.input.write(bytes);
    await refused;
    expect(f.input.isRaw).toBe(false);
    expect(f.input.listenerCount("data")).toBe(0);
    expect(f.transcript()).toBe("Secret: \n");
  },
);
test("external cancellation restores raw mode and a later prompt still works", async () => {
  const f = fixture(),
    controller = new AbortController();
  f.input.isRaw = true;
  const work = f.terminal.read("Secret: ", {
    secret: true,
    signal: controller.signal,
  });
  const refused = expect(work).rejects.toMatchObject({
    code: "REFERENCE_CANCELLED",
  });
  controller.abort();
  await refused;
  expect(f.input.isRaw).toBe(true);
  const next = f.terminal.confirm("Continue?", "YES");
  f.input.write("YES\r");
  expect(await next).toBe(true);
});
