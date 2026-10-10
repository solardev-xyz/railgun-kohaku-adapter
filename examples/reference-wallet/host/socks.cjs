"use strict";
const net = require("node:net");
function failure(code) {
  return Object.assign(new Error("Reference SOCKS connection refused"), {
    code,
  });
}

/** One SOCKS5 username/password CONNECT to loopback Arti, with remote DNS.
 * No no-auth negotiation, destination DNS, retry, fallback or application bytes.
 * onSocket receives the real socket before connect so the transport can track
 * actual close even when the handshake fails. */
function connectSocks(
  { endpoint, hostname, port, token, signal, timeoutMs },
  onSocket,
) {
  return new Promise((resolve, reject) => {
    if (
      !endpoint ||
      !["127.0.0.1", "::1"].includes(endpoint.host) ||
      !Number.isSafeInteger(endpoint.port) ||
      endpoint.port < 1 ||
      endpoint.port > 65535 ||
      typeof hostname !== "string" ||
      !/^[a-zA-Z0-9._-]+$/.test(hostname) ||
      Buffer.byteLength(hostname) > 255 ||
      !Number.isSafeInteger(port) ||
      port < 1 ||
      port > 65535 ||
      typeof token !== "string" ||
      !/^[0-9a-f]{64}$/.test(token) ||
      !(signal instanceof AbortSignal) ||
      !(endpoint.signal instanceof AbortSignal) ||
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > 120000 ||
      typeof onSocket !== "function"
    ) {
      reject(failure("INVALID_SOCKS_REQUEST"));
      return;
    }
    const socket = new net.Socket();
    let buffered = Buffer.alloc(0),
      phase = "method",
      settled = false,
      authentication;
    const timer = setTimeout(() => finish(failure("SOCKS_TIMEOUT")), timeoutMs);
    timer.unref();
    const abort = () => finish(failure("PRIVACY_REQUEST_ABORTED"));
    const error = () => finish(failure("SOCKS_CONNECTION_FAILED"));
    const closed = () => finish(failure("SOCKS_CONNECTION_CLOSED"));
    function finish(reason) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      endpoint.signal.removeEventListener("abort", abort);
      socket.removeListener("data", receive);
      socket.removeListener("error", error);
      socket.removeListener("close", closed);
      socket.on("error", () => {});
      authentication?.fill(0);
      if (reason) {
        socket.destroy();
        reject(reason);
      } else {
        socket.pause();
        if (buffered.length) socket.unshift(buffered);
        resolve(socket);
      }
    }
    function receive(chunk) {
      try {
        buffered = Buffer.concat([buffered, chunk]);
        if (buffered.length > 512)
          return finish(failure("SOCKS_PROTOCOL_ERROR"));
        if (phase === "method" && buffered.length >= 2) {
          if (buffered[0] !== 5 || buffered[1] !== 2)
            return finish(failure("SOCKS_AUTH_REQUIRED"));
          buffered = buffered.subarray(2);
          const username = "<torS0X>0";
          authentication = Buffer.alloc(3 + username.length + token.length);
          authentication[0] = 1;
          authentication[1] = username.length;
          authentication.write(username, 2);
          authentication[2 + username.length] = token.length;
          authentication.write(token, 3 + username.length);
          socket.write(authentication, () => authentication.fill(0));
          phase = "auth";
        }
        if (phase === "auth" && buffered.length >= 2) {
          if (buffered[0] !== 1 || buffered[1] !== 0)
            return finish(failure("SOCKS_AUTH_FAILED"));
          buffered = buffered.subarray(2);
          const target = Buffer.from(hostname, "ascii"),
            request = Buffer.alloc(7 + target.length);
          request.set([5, 1, 0, 3, target.length]);
          target.copy(request, 5);
          request.writeUInt16BE(port, 5 + target.length);
          socket.write(request);
          phase = "connect";
        }
        if (phase === "connect" && buffered.length >= 5) {
          if (buffered[0] !== 5 || buffered[1] !== 0 || buffered[2] !== 0)
            return finish(failure("SOCKS_PROTOCOL_ERROR"));
          const length =
            buffered[3] === 1
              ? 10
              : buffered[3] === 4
                ? 22
                : buffered[3] === 3
                  ? 7 + buffered[4]
                  : 0;
          if (!length) return finish(failure("SOCKS_PROTOCOL_ERROR"));
          if (buffered.length < length) return;
          buffered = buffered.subarray(length);
          finish();
        }
      } catch {
        finish(failure("SOCKS_PROTOCOL_ERROR"));
      }
    }
    socket.on("data", receive);
    socket.once("error", error);
    socket.once("close", closed);
    signal.addEventListener("abort", abort, { once: true });
    endpoint.signal.addEventListener("abort", abort, { once: true });
    try {
      onSocket(socket);
      if (signal.aborted || endpoint.signal.aborted) return abort();
      socket.once("connect", () => socket.write(Buffer.from([5, 1, 2])));
      socket.connect(endpoint.port, endpoint.host);
    } catch {
      finish(failure("SOCKS_CONNECTION_FAILED"));
    }
  });
}
module.exports = { connectSocks };
