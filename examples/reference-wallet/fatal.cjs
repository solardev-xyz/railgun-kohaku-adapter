"use strict";
/** Install before loading application modules. Electron's default uncaught
 * exception dialog can block a headless main process indefinitely. Fatal errors
 * exit without arbitrary messages; durable custody is recovered next launch. */
function installFatalHandlers({ app, resources, runtime = process }) {
  let failed = false;
  function restore() {
    try {
      if (runtime.stdin?.isTTY && runtime.stdin.isRaw)
        runtime.stdin.setRawMode(false);
    } catch {
      /* The terminal may already be closed. */
    }
  }
  function fatal() {
    if (failed) return;
    failed = true;
    restore();
    try {
      resources().lifetime?.abort();
    } catch {
      /* Exit still revokes the process. */
    }
    try {
      resources().vault?.lock();
    } catch {
      /* Exit still revokes the process. */
    }
    try {
      runtime.stderr.write(
        '{"status":"recovery-required","code":"REFERENCE_FATAL_EXIT"}\n',
      );
    } catch {
      /* No alternate logging of the original error. */
    }
    app.exit(1);
  }
  runtime.on("uncaughtException", fatal);
  runtime.on("unhandledRejection", fatal);
  runtime.once("exit", restore);
  return fatal;
}
module.exports = { installFatalHandlers };
