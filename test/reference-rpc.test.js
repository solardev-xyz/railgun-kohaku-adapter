"use strict";
const {
  createContextHost,
} = require("../examples/reference-wallet/host/context.cjs");
const {
  createRegistry,
} = require("../examples/reference-wallet/host/registry.cjs");
const { createRpcHost } = require("../examples/reference-wallet/host/rpc.cjs");
function fixture() {
  const context = createContextHost(),
    lifetime = new AbortController(),
    caller = new AbortController();
  const scope = context.createPrivacyScope({
    profileId: "public-fixture",
    signal: lifetime.signal,
  });
  const subject = {
    kind: "private-account",
    principal: "railgun:0",
    chainId: 11155111,
    protocol: "railgun",
    deployment: "sepolia",
    role: "protocol-rpc",
  };
  const handle = scope.getContext(subject),
    endpoint = Object.freeze({
      host: "127.0.0.1",
      port: 12345,
      signal: lifetime.signal,
    });
  const registry = createRegistry({ rpcUrl: "https://fixture.invalid/rpc" });
  let respond = async (request) => ({
    jsonrpc: "2.0",
    id: request.id,
    result: request.method === "eth_chainId" ? "0xaa36a7" : { number: "0x1" },
  });
  const wire = {
    request: jest.fn(async (_handle, _url, options) => ({
      status: 200,
      body: Buffer.from(
        JSON.stringify(await respond(JSON.parse(options.body))),
      ),
    })),
    release: jest.fn(),
  };
  const rpc = createRpcHost({
    context,
    registry,
    transport: { createWalletTorTransport: () => wire },
    tor: { getWalletSocksEndpoint: () => endpoint },
    settings: { isWalletTorExperimentAvailable: () => true },
  });
  const client = rpc.createPrivateRpc(handle, "protocol-rpc");
  const destination = rpc.getPrivateRpcDestination(client, handle);
  const options = {
    client,
    handle,
    destination,
    signal: caller.signal,
    deadline: performance.now() + 10000,
    envelope: { headers: [{ tag: "finalized", maxRequests: 1 }] },
  };
  return {
    context,
    scope,
    subject,
    handle,
    lifetime,
    caller,
    wire,
    rpc,
    client,
    destination,
    options,
    setResponse: (fn) => {
      respond = fn;
    },
    close: () => {
      caller.abort();
      scope.close();
    },
  };
}
test("pinned RPC checks the chain once and preserves the unverified trust boundary", async () => {
  const f = fixture();
  try {
    const response = await f.client.request(
      "eth_getBlockByNumber",
      ["finalized", false],
      (value) => value.number === "0x1",
    );
    expect(response).toMatchObject({
      source: "direct",
      verified: false,
      trust: { level: "unverified", method: "direct" },
      privacy: { circuitIsolation: "unqualified" },
    });
    await f.client.ready();
    expect(
      f.wire.request.mock.calls.map((row) => JSON.parse(row[2].body).method),
    ).toEqual(["eth_chainId", "eth_getBlockByNumber"]);
    expect(f.rpc.getPrivateRpcDestinationDetails(f.destination)).toEqual({
      version: 1,
      url: "https://fixture.invalid/rpc",
      chainId: 11155111,
      role: "protocol-rpc",
      transport: "tor-experimental",
    });
    expect(JSON.stringify(f.destination)).toBe("{}");
  } finally {
    f.close();
  }
});
test.each(["wrong-id", "error", "missing-result", "wrong-chain"])(
  "%s refuses before the requested read",
  async (kind) => {
    const f = fixture();
    f.setResponse(async (request) =>
      kind === "wrong-id"
        ? { jsonrpc: "2.0", id: "other", result: "0xaa36a7" }
        : kind === "error"
          ? {
              jsonrpc: "2.0",
              id: request.id,
              result: "0xaa36a7",
              error: { code: -1 },
            }
          : kind === "missing-result"
            ? { jsonrpc: "2.0", id: request.id }
            : { jsonrpc: "2.0", id: request.id, result: "0x1" },
    );
    try {
      await expect(
        f.client.request(
          "eth_getBlockByNumber",
          ["finalized", false],
          () => true,
        ),
      ).rejects.toThrow();
      expect(f.wire.request).toHaveBeenCalledTimes(1);
    } finally {
      f.close();
    }
  },
);
test("destination tokens require the same client and handle, not structural equality", () => {
  const f = fixture();
  try {
    expect(() =>
      f.rpc.assertPrivateRpcDestination(f.client, f.handle, {}),
    ).toThrow();
    expect(() => f.rpc.getPrivateRpcDestination({}, f.handle)).toThrow();
    expect(() => f.rpc.getPrivateRpcDestination(f.client, {})).toThrow();
    f.scope.close();
    expect(() =>
      f.rpc.getPrivateRpcDestinationDetails(f.destination),
    ).toThrow();
  } finally {
    f.close();
  }
});
test("a genuine destination constraint permits a new operation but not a changed subject or URL", () => {
  const f = fixture();
  const constraint = f.rpc.createPrivateRpcDestinationConstraint({
    observation: f.destination,
    signal: f.caller.signal,
    deadline: performance.now() + 10000,
  });
  try {
    const next = f.scope.getContext({
      ...f.subject,
      operation: "source-check",
    });
    const client = f.rpc.createPrivateRpc(next, "protocol-rpc", {
      destinationConstraint: constraint.constraint,
    });
    expect(() => client.assertActive()).not.toThrow();
    const other = f.scope.getContext({ ...f.subject, principal: "railgun:1" });
    expect(() =>
      f.rpc.createPrivateRpc(other, "protocol-rpc", {
        destinationConstraint: constraint.constraint,
      }),
    ).toThrow();
    constraint.close();
    expect(() => client.assertActive()).toThrow();
  } finally {
    constraint.close();
    f.close();
  }
});
test("expired admission makes no hidden chain-ID request", async () => {
  const f = fixture();
  try {
    await expect(
      f.client.request(
        "eth_getBlockByNumber",
        ["finalized", false],
        () => true,
        undefined,
        { admissionDeadline: performance.now() - 1 },
      ),
    ).rejects.toMatchObject({ code: "PRIVATE_RPC_ADMISSION_EXPIRED" });
    expect(f.wire.request).not.toHaveBeenCalled();
  } finally {
    f.close();
  }
});
test("admission deadline is checked again after chain readiness", async () => {
  const f = fixture();
  let release;
  const paused = new Promise((resolve) => {
    release = resolve;
  });
  f.setResponse(async (request) => {
    await paused;
    return { jsonrpc: "2.0", id: request.id, result: "0xaa36a7" };
  });
  const work = f.client.request(
    "eth_getBlockByNumber",
    ["finalized", false],
    () => true,
    undefined,
    { admissionDeadline: performance.now() + 15 },
  );
  const assertion = expect(work).rejects.toMatchObject({
    code: "PRIVATE_RPC_ADMISSION_EXPIRED",
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 25));
    release();
    await assertion;
    expect(f.wire.request).toHaveBeenCalledTimes(1);
  } finally {
    release();
    f.close();
  }
});
test("budgeted scan admits only its copied envelope and preserves counters", async () => {
  const f = fixture(),
    budget = f.rpc.createPrivateRpcReadBudget(f.options);
  f.options.envelope.headers[0].maxRequests = 4;
  try {
    await f.client.request(
      "eth_getBlockByNumber",
      ["finalized", false],
      () => true,
      budget.budget,
    );
    await expect(
      f.client.request(
        "eth_getBlockByNumber",
        ["finalized", false],
        () => true,
        budget.budget,
      ),
    ).rejects.toThrow();
    await budget.closed;
    expect(f.rpc.getPrivateRpcReadBudgetOutcome(budget.budget)).toMatchObject({
      status: "closed",
      reason: "admission-refused",
      fatal: false,
      pending: 0,
      admissions: { chainId: 1, headers: 1, eventHeaders: 0, logs: 0 },
    });
    expect(f.wire.request).toHaveBeenCalledTimes(2);
  } finally {
    budget.close();
    f.close();
  }
});
test("event headers are unique and logs use the exact admitted address and range", async () => {
  const f = fixture(),
    address = `0x${"1".repeat(40)}`;
  const budget = f.rpc.createPrivateRpcReadBudget({
    ...f.options,
    envelope: {
      headers: [],
      logs: { address, fromBlock: "0x1", toBlock: "0x3" },
      eventHeaders: { fromBlock: "0x1", toBlock: "0x3", maxRequests: 2 },
    },
  });
  try {
    await f.client.request(
      "eth_getLogs",
      [{ address, fromBlock: "0x1", toBlock: "0x3" }],
      () => true,
      budget.budget,
    );
    await f.client.request(
      "eth_getBlockByNumber",
      ["0x2", false],
      () => true,
      budget.budget,
    );
    await expect(
      f.client.request(
        "eth_getBlockByNumber",
        ["0x2", false],
        () => true,
        budget.budget,
      ),
    ).rejects.toThrow();
    expect(
      f.rpc.getPrivateRpcReadBudgetOutcome(budget.budget).admissions,
    ).toEqual({ chainId: 1, headers: 0, eventHeaders: 1, logs: 1 });
  } finally {
    budget.close();
    await budget.closed;
    f.close();
  }
});
test("a foreign client cannot spend or revoke a budget", async () => {
  const f = fixture(),
    budget = f.rpc.createPrivateRpcReadBudget(f.options);
  try {
    const other = f.rpc.createPrivateRpc(f.handle, "protocol-rpc");
    await expect(
      other.request(
        "eth_getBlockByNumber",
        ["finalized", false],
        () => true,
        budget.budget,
      ),
    ).rejects.toThrow();
    expect(f.rpc.getPrivateRpcReadBudgetOutcome(budget.budget).status).toBe(
      "active",
    );
    await f.client.request(
      "eth_getBlockByNumber",
      ["finalized", false],
      () => true,
      budget.budget,
    );
  } finally {
    budget.close();
    await budget.closed;
    f.close();
  }
});
test.each(["invalid-response", "validator"])(
  "%s after cancellation remains a fatal integrity failure and closed waits for it",
  async (kind) => {
    const f = fixture();
    await f.client.ready();
    let release, started;
    const paused = new Promise((resolve) => {
      release = resolve;
    });
    const admitted = new Promise((resolve) => {
      started = resolve;
    });
    f.setResponse(async (request) => {
      started();
      await paused;
      return {
        jsonrpc: "2.0",
        id: kind === "invalid-response" ? "wrong" : request.id,
        result: { number: "0x1" },
      };
    });
    const budget = f.rpc.createPrivateRpcReadBudget(f.options);
    const work = f.client.request(
      "eth_getBlockByNumber",
      ["finalized", false],
      () => kind !== "validator",
      budget.budget,
    );
    const assertion = expect(work).rejects.toThrow();
    let closed = false;
    budget.closed.then(() => {
      closed = true;
    });
    try {
      await admitted;
      f.caller.abort();
      await Promise.resolve();
      expect(closed).toBe(false);
      expect(f.rpc.getPrivateRpcReadBudgetOutcome(budget.budget)).toMatchObject(
        { status: "draining", pending: 1 },
      );
      release();
      await assertion;
      await budget.closed;
      expect(f.rpc.getPrivateRpcReadBudgetOutcome(budget.budget)).toMatchObject(
        {
          status: "closed",
          reason: "fatal",
          fatal: true,
          failure: "response",
          integrityFailure: true,
          pending: 0,
        },
      );
    } finally {
      release();
      budget.close();
      f.close();
    }
  },
);
test("registry has no automatic destination or unsupported-chain fallback", () => {
  for (const rpcUrl of [
    "http://fixture.invalid",
    "https://key@fixture.invalid",
    "https://fixture.invalid/?key=x",
  ])
    expect(() => createRegistry({ rpcUrl })).toThrow();
  const registry = createRegistry({ rpcUrl: "https://fixture.invalid" });
  expect(() => registry.getNetwork(1)).toThrow();
  expect(() => registry.getEndpoints(11155111, "other")).toThrow();
});
