"use strict";
/** Interactive secrets go directly between the controlling terminal and a
 * bounded buffer. Never accept them in argv, environment, files or redirected
 * stdin. JS/terminal history erasure is not a guarantee of this software vault. */
function createTerminal({
  input = process.stdin,
  output = process.stderr,
} = {}) {
  let busy = false;
  function check() {
    if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function")
      throw Object.assign(Error("An interactive terminal is required"), {
        code: "REFERENCE_TTY_REQUIRED",
      });
  }
  async function read(
    prompt,
    { secret = false, signal, maxBytes = 1024 } = {},
  ) {
    check();
    if (
      busy ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > 2048
    )
      throw Error("Terminal input unavailable");
    if (signal?.aborted)
      throw Object.assign(Error("Cancelled"), { code: "REFERENCE_CANCELLED" });
    busy = true;
    const bytes = Buffer.alloc(maxBytes),
      raw = input.isRaw === true;
    let length = 0;
    return new Promise((resolve, reject) => {
      let ended = false;
      function finish(error) {
        if (ended) return;
        ended = true;
        input.removeListener("data", data);
        input.removeListener("end", end);
        input.removeListener("error", end);
        signal?.removeEventListener("abort", abort);
        input.setRawMode(raw);
        input.pause();
        output.write("\n");
        busy = false;
        const result = error ? null : Buffer.from(bytes.subarray(0, length));
        bytes.fill(0);
        if (error) reject(error);
        else resolve(result);
      }
      function abort() {
        finish(
          Object.assign(Error("Cancelled"), { code: "REFERENCE_CANCELLED" }),
        );
      }
      function end() {
        finish(
          Object.assign(Error("Terminal closed"), {
            code: "REFERENCE_TTY_CLOSED",
          }),
        );
      }
      function data(chunk) {
        if (!Buffer.isBuffer(chunk)) {
          end();
          return;
        }
        for (const byte of chunk) {
          if (byte === 3 || byte === 4 || byte === 27) {
            abort();
            return;
          }
          if (byte === 13 || byte === 10) {
            finish();
            return;
          }
          if (byte === 8 || byte === 127) {
            if (length) {
              let start = length - 1;
              while (start > 0 && (bytes[start] & 0xc0) === 0x80) start--;
              bytes.fill(0, start, length);
              length = start;
              if (!secret) output.write("\b \b");
            }
            continue;
          }
          if (byte < 32 || byte === 127 || length === maxBytes) {
            abort();
            return;
          }
          bytes[length++] = byte;
          // Non-secret prompts are ASCII confirmations; secret UTF-8 remains
          // unechoed and is validated by the consuming vault.
          if (!secret) {
            if (byte > 126) {
              abort();
              return;
            }
            output.write(String.fromCharCode(byte));
          }
        }
      }
      output.write(prompt);
      input.setRawMode(true);
      input.on("data", data);
      input.once("end", end);
      input.once("error", end);
      signal?.addEventListener("abort", abort, { once: true });
      input.resume();
    });
  }
  async function confirm(prompt, expected, signal) {
    const answer = await read(`${prompt}\nType ${expected}: `, {
      signal,
      maxBytes: 64,
    });
    try {
      return answer.equals(Buffer.from(expected));
    } finally {
      answer.fill(0);
    }
  }
  function showRecovery(bytes) {
    check();
    if (
      busy ||
      !Buffer.isBuffer(bytes) ||
      !/^[a-z]+(?: [a-z]+){23}$/.test(bytes.toString("ascii"))
    )
      throw Error("Recovery display refused");
    output.write("\nRecovery phrase (keep offline; never share it):\n");
    output.write(bytes);
    output.write("\n\n");
  }
  return Object.freeze({ read, confirm, showRecovery });
}
module.exports = { createTerminal };
