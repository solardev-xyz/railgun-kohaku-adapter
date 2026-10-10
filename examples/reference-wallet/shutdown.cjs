"use strict";
/** Own the first quit request. Cancellation is immediate, but process exit
 * waits for original owner work and the proxy guardian. A bounded forced exit
 * is reported distinctly; durable journals determine recovery after restart. */
function createShutdown({
  app,
  lifetime,
  resources,
  timeoutMs = 15000,
  onForced = () => {},
  runtime = null,
  now = () => performance.now(),
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
    throw Error("Invalid shutdown bound");
  let closing,
    allowed = false,
    forced = false,
    firstSignalAt = null;
  function force(code) {
    if (forced) return;
    forced = true;
    lifetime.abort();
    resources().vault?.lock();
    onForced(code);
    app.exit(1);
  }
  // npm and Electron's JS launcher can forward the same terminal signal in
  // addition to its process-group delivery. Preserve the original drain for
  // that burst; a later deliberate interrupt can still force recovery.
  if (runtime) {
    const interrupted = () => {
      const at = now();
      if (firstSignalAt === null) {
        firstSignalAt = at;
        void quit();
      } else if (at - firstSignalAt >= 1500) {
        force("REFERENCE_SHUTDOWN_INTERRUPTED");
      }
    };
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
      runtime.on(signal, interrupted);
  }
  function close() {
    if (closing) return closing;
    lifetime.abort();
    closing = (async () => {
      const timer = setTimeout(() => force("REFERENCE_SHUTDOWN_TIMEOUT"), timeoutMs);
      try {
        // Opening an account or preparing an operation may still own original
        // work before the entry has assigned its returned session/handle.
        try {
          await resources().operation;
        } catch {
          /* The command reports its own failure. */
        }
        const { session, composition, tor } = resources();
        try {
          if (session) {
            await session.close();
            await session.closed;
          }
        } finally {
          try {
            composition?.close();
          } finally {
            if (tor) await tor.close();
          }
        }
      } finally {
        resources().vault?.lock();
        clearTimeout(timer);
      }
    })();
    return closing;
  }
  function quit() {
    return close().then(
      () => {
        if (forced) return;
        allowed = true;
        app.quit();
      },
      () => {
        allowed = true;
        app.exit(1);
      },
    );
  }
  app.on("before-quit", (event) => {
    if (allowed) return;
    event.preventDefault();
    void quit();
  });
  return Object.freeze({ close, quit });
}
module.exports = { createShutdown };
