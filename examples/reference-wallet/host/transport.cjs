"use strict";
const https = require("node:https");
const tls = require("node:tls");
const { connectSocks } = require("./socks.cjs");
const MAX_BYTES = 4 * 1024 * 1024;
const connectionErrors = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EPIPE"]);
function failure(code, stage, failureCategory) {
  return Object.assign(new Error("Reference private request refused"), {
    code,
    ...(stage ? { stage } : {}),
    ...(failureCategory ? { failureCategory } : {}),
  });
}
/** A deliberately small HTTP/1.1 host: one authenticated SOCKS/TLS connection
 * per request. No connection reuse, redirects, retries or destination DNS.
 * Limits are application policy. The owner must still authenticate responses.
 * ca is constructor-only for local conformance; requests cannot change trust. */
function createTransportHost({ context, getEndpoint, allowedOrigins, ca }) {
  const origins = new Set(
    allowedOrigins.map((value) => {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.origin !== value ||
        url.username ||
        url.password
      )
        throw failure("INVALID_PRIVATE_REQUEST");
      return value;
    }),
  );
  if (!origins.size || origins.size > 16)
    throw failure("INVALID_PRIVATE_REQUEST");
  function createWalletTorTransport() {
    const groups = new Map(),
      work = new Set();
    let terminal = false,
      resolveClosed;
    const closed = new Promise((resolve) => {
      resolveClosed = resolve;
    });
    function checkClosed() {
      if (terminal && !work.size) resolveClosed();
    }
    function groupFor(handle, owner) {
      const endpoint = getEndpoint();
      if (
        !endpoint ||
        !(endpoint.signal instanceof AbortSignal) ||
        endpoint.signal.aborted
      )
        throw failure("TOR_NOT_READY");
      let group = groups.get(handle);
      if (group && group.endpoint !== endpoint) {
        group.controller.abort();
        groups.delete(handle);
        throw failure("TOR_NOT_READY");
      }
      if (!group) {
        if (groups.size >= 64) throw failure("TOR_CONTEXT_LIMIT");
        const controller = new AbortController();
        group = {
          endpoint,
          controller,
          signal: AbortSignal.any([
            controller.signal,
            owner.signal,
            endpoint.signal,
          ]),
        };
        groups.set(handle, group);
        const retained = group;
        group.signal.addEventListener(
          "abort",
          () => {
            if (groups.get(handle) === retained) groups.delete(handle);
          },
          { once: true },
        );
      }
      if (group.signal.aborted) throw failure("PRIVACY_REQUEST_ABORTED");
      return group;
    }
    async function request(handle, input, options = {}) {
      if (terminal) throw failure("TOR_TRANSPORT_CLOSED");
      const owner = context.getPrivacyContext(handle);
      if (
        owner.requirements.content !== "public" ||
        owner.requirements.correctness !== "any" ||
        owner.requirements.maxAgeMs !== null
      )
        throw failure("UNSUPPORTED_PRIVACY_REQUIREMENTS");
      let url;
      try {
        url = new URL(input);
      } catch {
        throw failure("INVALID_PRIVATE_REQUEST");
      }
      const {
        method,
        headers,
        body,
        signal,
        timeoutMs = 30000,
        connectTimeoutMs = Math.min(10000, timeoutMs),
        maxResponseBytes = MAX_BYTES,
        requireFramedResponse = false,
      } = options;
      if (
        !origins.has(url.origin) ||
        url.username ||
        url.password ||
        url.hash ||
        url.search ||
        method !== "POST" ||
        !headers ||
        Object.keys(headers).length !== 1 ||
        headers["content-type"] !== "application/json" ||
        typeof body !== "string" ||
        (signal !== undefined && !(signal instanceof AbortSignal)) ||
        !Number.isFinite(timeoutMs) ||
        timeoutMs <= 0 ||
        timeoutMs > 120000 ||
        !Number.isFinite(connectTimeoutMs) ||
        connectTimeoutMs <= 0 ||
        connectTimeoutMs > timeoutMs ||
        !Number.isSafeInteger(maxResponseBytes) ||
        maxResponseBytes < 1 ||
        maxResponseBytes > MAX_BYTES ||
        typeof requireFramedResponse !== "boolean"
      )
        throw failure("INVALID_PRIVATE_REQUEST");
      const bytes = Buffer.from(body, "utf8");
      if (bytes.length > 1024 * 1024)
        throw failure("PRIVATE_REQUEST_TOO_LARGE");
      if (work.size >= 8) throw failure("TOR_REQUEST_LIMIT");
      const group = groupFor(handle, owner),
        timeout = new AbortController();
      const combined = AbortSignal.any([
        group.signal,
        timeout.signal,
        ...(signal ? [signal] : []),
      ]);
      if (combined.aborted) throw failure("PRIVACY_REQUEST_ABORTED");
      const timer = setTimeout(() => timeout.abort(), timeoutMs);
      timer.unref();
      // Own cancellation always dominates availability, including a timer
      // callback already queued before clearTimeout takes effect.
      const cancelTimer = () => clearTimeout(timer);
      group.signal.addEventListener("abort", cancelTimer, { once: true });
      signal?.addEventListener("abort", cancelTimer, { once: true });
      let finishWork;
      const original = new Promise((resolve) => {
        finishWork = resolve;
      });
      work.add(original);
      const sockets = new Set(),
        barriers = [];
      let req,
        connecting,
        stage = "connect", failureCategory = null;
      function recordFailure(category) {
        // Policy/format/TLS failures dominate availability. Never copy service
        // text or native error strings into this diagnostic.
        if (!["connection", "timeout", "protocol", "tls", "response", "unknown"].includes(category)) category = "unknown";
        if (["protocol", "tls", "response", "unknown"].includes(failureCategory)) return;
        failureCategory = category;
      }
      function nativeFailure(error) {
        if (error?.message === "Reference private request refused") return;
        recordFailure(connectionErrors.has(error?.code) ? "connection"
          : typeof error?.code === "string" && error.code.startsWith("HPE_") ? "response" : "unknown");
      }
      const agent = new https.Agent({
        keepAlive: false,
        maxSockets: 1,
        maxCachedSessions: 0,
      });
      function track(socket) {
        sockets.add(socket);
        socket.on("error", () => {});
        barriers.push(
          new Promise((resolve) =>
            socket.once("close", () => {
              sockets.delete(socket);
              resolve();
            }),
          ),
        );
      }
      function requestFailure() {
        return failure(
          group.signal.aborted || signal?.aborted
            ? "PRIVACY_REQUEST_ABORTED"
            : timeout.signal.aborted ? "TOR_REQUEST_TIMEOUT" : "TOR_REQUEST_FAILED",
          stage,
          group.signal.aborted || signal?.aborted ? "cancelled"
            : ["protocol", "tls", "response", "unknown"].includes(failureCategory) ? failureCategory
              : timeout.signal.aborted ? "timeout" : failureCategory ?? "unknown",
        );
      }
      const abort = () => {
        req?.destroy(requestFailure());
        for (const socket of sockets) socket.destroy();
        agent.destroy();
      };
      combined.addEventListener("abort", abort, { once: true });
      agent.createConnection = (_options, callback) => {
        connecting = (async () => {
          let socket;
          try { socket = await connectSocks(
            {
              endpoint: group.endpoint,
              hostname: url.hostname,
              port: Number(url.port || 443),
              token: owner.isolationToken,
              signal: combined,
              timeoutMs: connectTimeoutMs,
            },
            track,
          ); } catch (error) {
            recordFailure(error?.failureCategory);
            throw requestFailure();
          }
          if (combined.aborted) throw requestFailure();
          stage = "tls";
          const secure = tls.connect({
            socket,
            servername: url.hostname,
            rejectUnauthorized: true,
            ca,
            ALPNProtocols: ["http/1.1"],
          });
          track(secure);
          await new Promise((resolve, reject) => {
            const error = () => { if (!combined.aborted) recordFailure("tls"); done(false); };
            const ready = () => done(secure.authorized && !combined.aborted);
            const done = (ok) => {
              secure.removeListener("error", error);
              secure.removeListener("close", error);
              secure.removeListener("secureConnect", ready);
              if (ok) resolve();
              else { if (!combined.aborted) recordFailure("tls"); reject(requestFailure()); }
            };
            secure.once("error", error);
            secure.once("close", error);
            secure.once("secureConnect", ready);
          });
          stage = "socket-new";
          return secure;
        })();
        connecting.then(
          (socket) => callback(null, socket),
          () => callback(requestFailure()),
        );
      };
      try {
        const response = await new Promise((resolve, reject) => {
          let settled = false;
          function finish(error, value) {
            if (settled) return;
            settled = true;
            if (error) {
              reject(error);
              req?.destroy();
            } else resolve(value);
          }
          req = https.request(
            url,
            {
              method: "POST",
              agent,
              headers: {
                "content-type": "application/json",
                "content-length": String(bytes.length),
                "accept-encoding": "identity",
              },
              maxHeaderSize: 16384,
              insecureHTTPParser: false,
            },
            (res) => {
              stage = "response";
              if (res.statusCode !== 200) recordFailure("response");
              res.on("error", (error) => { nativeFailure(error); finish(requestFailure()); });
              res.on("aborted", () => { recordFailure("connection"); finish(requestFailure()); });
              if (res.statusCode >= 300 && res.statusCode < 400)
                return finish(failure("PRIVATE_REDIRECT_REFUSED"));
              if (
                res.headers["content-encoding"] &&
                res.headers["content-encoding"] !== "identity"
              )
                return finish(failure("PRIVATE_ENCODING_REFUSED"));
              const length = res.headers["content-length"],
                encoding = res.headers["transfer-encoding"];
              if (
                requireFramedResponse &&
                !(
                  (typeof length === "string" &&
                    /^\d+$/.test(length) &&
                    encoding === undefined) ||
                  (length === undefined &&
                    typeof encoding === "string" &&
                    /^chunked$/i.test(encoding))
                )
              )
                return finish(failure("PRIVATE_FRAMING_REFUSED"));
              if (length !== undefined && Number(length) > maxResponseBytes)
                return finish(failure("PRIVATE_RESPONSE_TOO_LARGE"));
              const chunks = [];
              let size = 0;
              res.on("data", (chunk) => {
                if (settled) return;
                size += chunk.length;
                if (size > maxResponseBytes)
                  finish(failure("PRIVATE_RESPONSE_TOO_LARGE"));
                else chunks.push(chunk);
              });
              res.on("end", () => {
                if (!res.complete) finish(requestFailure());
                else
                  finish(null, {
                    status: res.statusCode,
                    body: Buffer.concat(chunks),
                  });
              });
            },
          );
          req.on("error", (error) => { nativeFailure(error); finish(requestFailure()); });
          barriers.push(
            new Promise((resolveClose) => req.once("close", resolveClose)),
          );
          if (combined.aborted) abort();
          else req.end(bytes);
        });
        context.getPrivacyContext(handle);
        if (combined.aborted || getEndpoint() !== group.endpoint)
          throw requestFailure();
        return response;
      } catch (error) {
        // Never pass Node/TLS exceptions, URLs or arbitrary service text out.
        if (error?.message === "Reference private request refused") throw error;
        if (/^PRIVACY_/.test(error?.code)) throw failure(error.code, stage, "cancelled");
        throw requestFailure();
      } finally {
        clearTimeout(timer);
        group.signal.removeEventListener("abort", cancelTimer);
        signal?.removeEventListener("abort", cancelTimer);
        req?.destroy();
        agent.destroy();
        for (const socket of sockets) socket.destroy();
        if (connecting) await connecting.catch(() => {});
        for (const socket of sockets) socket.destroy();
        await Promise.all(barriers);
        combined.removeEventListener("abort", abort);
        work.delete(original);
        finishWork();
        checkClosed();
      }
    }
    function release(handle) {
      const group = groups.get(handle);
      if (group) {
        group.controller.abort();
        groups.delete(handle);
      }
    }
    function close() {
      terminal = true;
      for (const handle of groups.keys()) release(handle);
      checkClosed();
    }
    return Object.freeze({ request, release, close, closed });
  }
  return Object.freeze({ createWalletTorTransport });
}
module.exports = { createTransportHost };
