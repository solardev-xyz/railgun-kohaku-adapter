/** Test-only host facade. It models context identity and revocation; it is not
 * Freedom enrollment, a real key owner, or a source of execution authority. */
const contexts = new WeakMap();
function createPrivacyScope({ signal }) {
  const controller = new AbortController();
  const close = () => controller.abort();
  signal.addEventListener('abort', close, { once: true });
  if (signal.aborted) close();
  return {
    signal: controller.signal,
    getContext(subject) {
      if (controller.signal.aborted) throw new Error('Test context revoked');
      const handle = Object.freeze({});
      contexts.set(handle, { subject, signal: controller.signal });
      return handle;
    },
    close() {
      signal.removeEventListener('abort', close);
      close();
    },
  };
}
function getPrivacyContext(handle) {
  const context = contexts.get(handle);
  if (!context || context.signal.aborted) throw new Error('Test context revoked');
  return context;
}
module.exports = { createPrivacyScope, getPrivacyContext };
