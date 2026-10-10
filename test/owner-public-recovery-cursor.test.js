/** Actual coordinator, source ledger and worker, with controlled public RPC. */
require("../tools/owner-test-staging/context-host.cjs");
jest.mock("../src/owners/host-bindings.js", () => ({
  ...jest.requireActual("../src/owners/host-bindings.js"),
  rpc: { createPrivateRpc: jest.fn() },
}));
const fs = require("fs"),
  os = require("os"),
  path = require("path");
const { createPrivateRpc } = require("../src/owners/host-bindings.js").rpc;
const {
  createPrivacyScope,
  getPrivacyContext,
} = require("../src/owners/context-bindings.js");
const {
  startRailgunSessionWorker,
} = require("../src/owners/railgun-session-worker.js");
const {
  createRailgunSourceLedger,
} = require("../src/owners/railgun-source-ledger.js");
const {
  createRailgunScanSource,
} = require("../src/owners/railgun-scan-source.js");
const {
  createRailgunScanCoordinator,
} = require("../src/owners/railgun-scan-coordinator.js");
const { emptyPublicState } = require("../src/owners/railgun-public-records.js");
const hash = (n) => "0x" + n.toString(16).padStart(64, "0");
let scope,
  directory,
  instances,
  providerHost,
  sourceUnavailable,
  sourceLogs,
  acquisitions;
const subject = {
  kind: "private-account",
  principal: "fixture",
  protocol: "railgun",
  chainId: 11155111,
  deployment: "fixture",
};
const request = (id, method = "batch") =>
  JSON.stringify({
    id,
    method,
    args:
      method === "rpc"
        ? { method: "eth_getLogs", params: [] }
        : {
            operations: [
              {
                type: "put",
                key: Buffer.from("fixture-cursor").toString("base64"),
                value: Buffer.from("applied").toString("base64"),
              },
            ],
          },
  });
async function open(create, applyRange = async () => {}) {
  const handle = scope.getContext({ ...subject, role: "engine" }),
    rpcHandle = scope.getContext({ ...subject, role: "protocol-rpc" });
  const ledger = await createRailgunSourceLedger({
    handle: rpcHandle,
    filename: path.join(directory, "source.sqlite"),
    key: Buffer.alloc(32, 52),
    binding: "d".repeat(64),
    create,
  });
  const source = createRailgunScanSource({
    handle: rpcHandle,
    ledger,
    beforeAcquire: (range) =>
      acquisitions.push({ from: range.from, to: range.to }),
    projectRange: async ({ range }, { visit }) => {
      await visit(() => {});
      return emptyPublicState(range.storeId);
    },
  });
  const storeSession = startRailgunSessionWorker({
    handle,
    storage: {
      format: "paged-v2",
      filename: path.join(directory, "engine.sqlite"),
      key: Buffer.alloc(32, 53),
      binding: "e".repeat(64),
      create,
    },
    createProvider: ({ signal }) => ({
      signal,
      request: async () => {
        throw Error("No engine RPC");
      },
    }),
    onClose: () => {},
  });
  const entry = { ledger, source, storeSession };
  instances.push(entry);
  await storeSession.ready;
  entry.coordinator = await createRailgunScanCoordinator({
    handle,
    storeSession,
    source,
    journalStorage: {
      directory,
      key: Buffer.alloc(32, 54),
      binding: "f".repeat(64),
    },
    applyRange,
  });
  return entry;
}
async function close(entry) {
  entry.coordinator?.close();
  entry.source.close();
  entry.ledger.close();
  entry.storeSession.close();
  await Promise.all([entry.ledger.closed, entry.storeSession.closed]);
}
beforeEach(() => {
  scope = createPrivacyScope({
    profileId: "coordinator-fixture",
    signal: new AbortController().signal,
  });
  directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "railgun-scan-coordinator-"),
  );
  instances = [];
  providerHost = "first.example";
  sourceUnavailable = false;
  sourceLogs = [];
  acquisitions = [];
  createPrivateRpc.mockImplementation((handle, _role, { signal }) => {
    const lifetime = AbortSignal.any([
      getPrivacyContext(handle).signal,
      signal,
    ]);
    return {
      signal: lifetime,
      trust: { queried: [providerHost] },
      release: () => {},
      assertActive: () => {
        if (lifetime.aborted) throw Error("closed");
      },
      request: async (method, params) => {
        if (sourceUnavailable) throw Error("source unavailable");
        if (method === "eth_getLogs") return { result: sourceLogs };
        const number =
          params[0] === "finalized" ? 100 : Number(BigInt(params[0]));
        return {
          result: {
            number: "0x" + number.toString(16),
            hash: hash(number + 1),
            parentHash: hash(number),
          },
        };
      },
    };
  });
});
afterEach(async () => {
  scope.close();
  for (const entry of instances) await close(entry);
});
const next = (to) => ({ to, anchor: { number: 100, hash: hash(101) } });

test.each(["committed", "pending"])(
  "returned %s cursor is exactly the next acquisition predecessor",
  async (mode) => {
    const first = await open(true, async (_range, { dispatch }) => {
      await dispatch(request(1));
      if (mode === "pending") throw Error("crash after apply");
    });
    if (mode === "pending")
      await expect(first.coordinator.advance(next(10))).rejects.toThrow();
    else await first.coordinator.advance(next(10));
    await close(first);
    const second = await open(false, async (_range, { dispatch }) => {
      await dispatch(request(1));
    });
    const recovered = await second.coordinator.recover();
    expect(recovered).toEqual({
      status: "applied-unverified",
      to: { number: 10, hash: hash(11) },
    });
    await second.coordinator.advance(next(20));
    const inspection = second.coordinator.inspect();
    expect(inspection.to).toEqual({ number: 20, hash: hash(21) });
    // The real source enforces predecessor hash continuity; record its actual
    // acquisition boundary in the source's beforeAcquire hook.
    expect(acquisitions.at(-1)).toEqual({
      from: recovered.to.number + 1,
      to: 20,
    });
  },
);
