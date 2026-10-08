/** Fixed owner seams: no native, service, crypto or profile reads. */
"use strict";
const admission = require("./owner-poi-admission.cjs").createAdmission(
  require("path").join(__dirname, "../src/owners"),
);
let state;
jest.mock("../src/owners/railgun-account-enrollment.js", () => ({
  isRailgunAccountEnrollment: (value) => state.enrollments.has(value),
}));
jest.mock("../src/owners/railgun-identity.js", () => ({
  assertRailgunIdentity: (identity, handle) => {
    if (identity !== state.identity || handle !== state.handle)
      throw Error("foreign identity");
    return state.descriptor;
  },
}));
jest.mock("../src/owners/railgun-account-public.js", () => ({
  assertRailgunAccountPublicDestination: (
    coordinator,
    enrollment,
    destination,
  ) => {
    if (
      coordinator !== state.coordinator ||
      enrollment !== state.enrollment ||
      destination !== state.destination
    )
      throw Error("foreign coordinator");
  },
}));
jest.mock("../src/owners/railgun-own-poi-membership.js", () => ({
  openRailgunOwnPoiMembership: (input) => {
    admission("shield", input);
    return state.membership(input, "Shield");
  },
  openRailgunOwnTransactPoiMembership: (input) => {
    admission("transact", input);
    return state.membership(input, "Transact");
  },
}));
jest.mock("../src/owners/railgun-own-poi-proof.js", () => ({
  proveRailgunOwnPoi: (input) => {
    admission("proof", input);
    return state.prove(input);
  },
}));
jest.mock("../src/owners/railgun-poi-disclosure-plan.js", () => ({
  prepareRailgunPoiDisclosurePlan: (input) => {
    admission("plan", input);
    return state.plan(input);
  },
  revalidateRailgunPoiDisclosurePlan: (input) => {
    admission("revalidate", input);
    return state.revalidate(input);
  },
  submitRailgunRetainedPoi: (input) => {
    admission("submit", input);
    return state.submit(input);
  },
}));
jest.mock("../src/owners/railgun-poi-output-recovery.js", () => ({
  recoverRailgunPoiOutputCompleted: (input) => {
    admission("preparedOutput", input);
    return state.recover(input, "prepared");
  },
  recoverRailgunAttemptedPoiOutput: (input) => {
    admission("attemptedOutput", input);
    return state.recover(input, "attempted");
  },
}));
const hex = (character) => character.repeat(64);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  promise.catch(() => {});
  return { promise, resolve, reject };
};
const tick = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function resource(extra = {}) {
  const drain = deferred();
  return {
    ...extra,
    closed: drain.promise,
    close: jest.fn(() => drain.resolve()),
    drain,
  };
}
function fixture() {
  jest.resetModules();
  const controller = new AbortController();
  const descriptor = { walletId: hex("a") },
    handle = {},
    identity = { signal: controller.signal },
    coordinator = { signal: controller.signal };
  const row = {
    entry: {
      id: hex("1"),
      facts: {
        kind: "railgun-private-transfer",
        noteHash: "0x" + hex("2"),
        nullifier: "0x" + hex("3"),
        tree: 0,
        position: 1,
      },
    },
    receipt: {},
  };
  const reservations = {
    assertReceiptContext: jest.fn(),
    assertReceipt: jest.fn(async () => row.entry),
    withSigningRecovery: jest.fn(async (use) =>
      use([row], { assertCurrent: jest.fn() }),
    ),
  };
  const saved = {
    state: "prepared",
    capsuleDigest: hex("4"),
    payloadSha256: hex("5"),
    revision: 1,
  };
  const store = {
    prepare: jest.fn(async (input) => {
      admission("storePrepare", input);
      return { status: "prepared", ...saved };
    }),
    get: jest.fn(async () => saved),
  };
  const enrollment = {
    descriptor,
    signal: controller.signal,
    getContext: jest.fn(() => handle),
    openReservations: jest.fn(async () => reservations),
    openPoiIntents: jest.fn(async () => store),
  };
  const membership = resource({
      status: "verified",
      receipt: {},
      observation: { notPublic: true },
    }),
    plan = resource({
      status: "prepared",
      plan: {},
      summary: { privatePlan: true },
    }),
    proof = { status: "proved", payload: { notPublic: true } };
  state = {
    descriptor,
    handle,
    identity,
    coordinator,
    enrollment,
    destination: {},
    enrollments: new WeakSet([enrollment]),
    membership: jest.fn(async () => membership),
    prove: jest.fn(async () => proof),
    plan: jest.fn(async () => plan),
    revalidate: jest.fn(async () => ({ status: "current" })),
    submit: jest.fn(async (input) => {
      await input.review(
        { purpose: "original-submit-summary" },
        { signal: controller.signal },
      );
      return { status: "recovery-required", stage: "post" };
    }),
    recover: jest.fn(async () => ({
      status: "matched",
      capsuleDigest: saved.capsuleDigest,
      revision: 1,
      payloadSha256: saved.payloadSha256,
      outputMatched: true,
      membershipAuthenticated: false,
      spendingEnabled: false,
    })),
  };
  const input = {
    owners: { identity, enrollment, coordinator },
    archive: "/public/engine.asar",
    proverArchive: "/public/prover.asar",
    artifactDirectory: "/public/artifacts",
    destination: state.destination,
    signal: controller.signal,
    reviewDisclosures: jest.fn(() => true),
  };
  const {
    createRailgunPoiLane,
  } = require("../src/owners/operational-poi-lane.js");
  return {
    input,
    createRailgunPoiLane,
    controller,
    row,
    reservations,
    store,
    saved,
    membership,
    plan,
    proof,
  };
}
test.each(["Shield", "Transact"])(
  "fixed %s route keeps actual receipt and proof inside the owners",
  async (type) => {
    const f = fixture(),
      lane = f.createRailgunPoiLane(f.input);
    const result = await lane["prepare" + type](f.row.entry.id);
    expect(state.membership).toHaveBeenCalledTimes(1);
    const [input, kind] = state.membership.mock.calls[0];
    expect(kind).toBe(type);
    expect(input.selector).toEqual({
      noteHash: f.row.entry.facts.noteHash,
      nullifier: f.row.entry.facts.nullifier,
      tree: 0,
      position: 1,
    });
    expect(Object.hasOwn(input, "identity")).toBe(type === "Transact");
    expect(state.prove.mock.calls[0][0].membershipReceipt).toBe(
      f.membership.receipt,
    );
    expect(f.store.prepare.mock.calls[0][0].proof).toBe(f.proof);
    expect(f.input.owners.enrollment.openReservations).toHaveBeenCalledWith({
      existingOnly: true,
    });
    expect(result).toEqual({
      status: "prepared",
      capsuleDigest: hex("4"),
      payloadSha256: hex("5"),
      revision: 1,
      proofAuthenticated: false,
      disclosureEnabled: false,
      spendingEnabled: false,
    });
    expect(f.membership.close).toHaveBeenCalledTimes(1);
    expect(f.store.get).toHaveBeenCalledWith(hex("4"));
    lane.close();
    await lane.closed;
  },
);
test("extra owner/options and foreign identity/coordinator fail before storage", () => {
  const f = fixture();
  expect(() => f.createRailgunPoiLane({ ...f.input, receipt: {} })).toThrow();
  expect(() =>
    f.createRailgunPoiLane({
      ...f.input,
      owners: { ...f.input.owners, identity: {} },
    }),
  ).toThrow();
  expect(() =>
    f.createRailgunPoiLane({
      ...f.input,
      owners: { ...f.input.owners, coordinator: {} },
    }),
  ).toThrow();
  expect(() =>
    f.createRailgunPoiLane({
      ...f.input,
      owners: { ...f.input.owners, enrollment: { ...state.enrollment } },
    }),
  ).toThrow();
  expect(state.enrollment.openReservations).not.toHaveBeenCalled();
});
test.each(["no-row", "wrong-kind", "bad-reattest"])(
  "%s refuses selection before service disclosure",
  async (mode) => {
    const f = fixture(),
      lane = f.createRailgunPoiLane(f.input);
    if (mode === "no-row") f.row.entry.id = hex("9");
    if (mode === "wrong-kind") f.row.entry.facts.kind = "relay-local-v4";
    if (mode === "bad-reattest")
      f.reservations.assertReceipt.mockResolvedValue({});
    await expect(lane.prepareShield(hex("1"))).rejects.toThrow();
    expect(f.input.reviewDisclosures).not.toHaveBeenCalled();
    expect(state.membership).not.toHaveBeenCalled();
    lane.close();
    await lane.closed;
  },
);
test("declined review never opens membership or creates retained storage", async () => {
  const f = fixture();
  f.input.reviewDisclosures.mockReturnValue(false);
  const lane = f.createRailgunPoiLane(f.input);
  await expect(lane.prepareShield(hex("1"))).rejects.toThrow();
  expect(state.membership).not.toHaveBeenCalled();
  expect(state.enrollment.openPoiIntents).not.toHaveBeenCalled();
  lane.close();
  await lane.closed;
});
test("wrong creator route propagates original refusal without proving or storing", async () => {
  const f = fixture();
  state.membership.mockResolvedValue({
    status: "refused",
    stage: "preflight-type",
  });
  const lane = f.createRailgunPoiLane(f.input);
  await expect(lane.prepareShield(hex("1"))).resolves.toEqual({
    status: "refused",
    stage: "membership:preflight-type",
  });
  expect(
    f.input.reviewDisclosures.mock.calls[0][0]
      .mayDiscloseBeforeCreatorTypeMismatchEstablished,
  ).toBe(true);
  expect(state.prove).not.toHaveBeenCalled();
  expect(state.enrollment.openPoiIntents).not.toHaveBeenCalled();
  lane.close();
  await lane.closed;
});
test("close during native review holds original lane closure and cannot accept late approval", async () => {
  const f = fixture(),
    review = deferred();
  f.input.reviewDisclosures.mockReturnValue(review.promise);
  const lane = f.createRailgunPoiLane(f.input);
  const pending = lane.prepareShield(hex("1"));
  pending.catch(() => {});
  await tick();
  lane.close();
  let closed = false;
  lane.closed.then(() => {
    closed = true;
  });
  await tick();
  expect(closed).toBe(false);
  review.resolve(true);
  await expect(pending).rejects.toThrow();
  await lane.closed;
  expect(state.membership).not.toHaveBeenCalled();
});
test("thenable review quarantines without calling its then", async () => {
  const f = fixture(),
    then = jest.fn();
  f.input.reviewDisclosures.mockReturnValue({ then });
  const lane = f.createRailgunPoiLane(f.input);
  await expect(lane.prepareShield(hex("1"))).rejects.toHaveProperty(
    "code",
    "RAILGUN_POI_FACADE_DRAIN_UNOBSERVED",
  );
  await expect(lane.closed).rejects.toThrow();
  expect(then).not.toHaveBeenCalled();
});
test("late-added then cannot convert an original non-true fulfillment into permission", async () => {
  const f = fixture(),
    value = {},
    promise = Promise.resolve(value),
    then = jest.fn((resolve) => resolve(true));
  value.then = then;
  f.input.reviewDisclosures.mockReturnValue(promise);
  const lane = f.createRailgunPoiLane(f.input);
  await expect(lane.prepareShield(hex("1"))).rejects.toThrow();
  expect(then).not.toHaveBeenCalled();
  expect(state.membership).not.toHaveBeenCalled();
  lane.close();
  await lane.closed;
});
test("30s decision deadline refuses even when the cancellation timer has not fired", async () => {
  const f = fixture(),
    clock = jest.spyOn(performance, "now").mockReturnValue(100);
  f.input.reviewDisclosures.mockImplementation(() => {
    clock.mockReturnValue(30100);
    return true;
  });
  const lane = f.createRailgunPoiLane(f.input);
  try {
    await expect(lane.prepareShield(hex("1"))).rejects.toThrow();
    expect(state.membership).not.toHaveBeenCalled();
  } finally {
    clock.mockRestore();
    lane.close();
    await lane.closed;
  }
});
test("held proof original keeps busy and lane close until actual settlement and membership drain", async () => {
  const f = fixture(),
    proof = deferred();
  state.prove.mockReturnValue(proof.promise);
  f.membership.close.mockImplementation(() => {});
  const lane = f.createRailgunPoiLane(f.input);
  const pending = lane.prepareShield(hex("1"));
  pending.catch(() => {});
  await tick();
  await expect(lane.recoverOutput(hex("4"))).rejects.toThrow();
  lane.close();
  proof.resolve(f.proof);
  await tick();
  expect(f.membership.close).toHaveBeenCalled();
  let closed = false;
  lane.closed.then(() => {
    closed = true;
  });
  await tick();
  expect(closed).toBe(false);
  f.membership.drain.resolve();
  await expect(pending).rejects.toThrow();
  await lane.closed;
});
test("failed original membership closure cannot publish prepared result", async () => {
  const f = fixture();
  f.membership.close.mockImplementation(() =>
    f.membership.drain.reject(Error("unknown")),
  );
  const lane = f.createRailgunPoiLane(f.input);
  await expect(lane.prepareShield(hex("1"))).rejects.toHaveProperty(
    "code",
    "RAILGUN_POI_FACADE_DRAIN_UNOBSERVED",
  );
  await expect(lane.closed).rejects.toThrow();
});
test("readback drift refuses after genuine prepare and still observes membership close", async () => {
  const f = fixture();
  f.store.get.mockResolvedValue({ ...f.saved, revision: 2 });
  const lane = f.createRailgunPoiLane(f.input);
  await expect(lane.prepareShield(hex("1"))).rejects.toThrow();
  expect(f.membership.close).toHaveBeenCalled();
  lane.close();
  await lane.closed;
});
test("submit keeps the one genuine plan, original review and exact uncertain outcome; no reuse", async () => {
  const f = fixture(),
    lane = f.createRailgunPoiLane(f.input);
  const result = await lane.submit(hex("4"));
  expect(state.revalidate.mock.calls[0][0].plan).toBe(f.plan.plan);
  expect(state.submit.mock.calls[0][0].plan).toBe(f.plan.plan);
  expect(f.input.reviewDisclosures).toHaveBeenCalledWith(
    { purpose: "original-submit-summary" },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(result).toEqual({ status: "recovery-required", stage: "post" });
  await lane.closed;
  await expect(lane.submit(hex("4"))).rejects.toThrow();
  expect(state.submit).toHaveBeenCalledTimes(1);
  expect(f.plan.close).toHaveBeenCalledTimes(1);
});
test("revoked plan never reaches submit and is drained", async () => {
  const f = fixture();
  state.revalidate.mockResolvedValue({ status: "refused", stage: "changed" });
  const lane = f.createRailgunPoiLane(f.input);
  await expect(lane.submit(hex("4"))).resolves.toEqual({
    status: "refused",
    stage: "plan:changed",
  });
  expect(state.submit).not.toHaveBeenCalled();
  await lane.closed;
});
test("output recovery projects data only and retains membership false", async () => {
  const f = fixture(),
    lane = f.createRailgunPoiLane(f.input);
  const result = await lane.recoverOutput(hex("4"));
  expect(state.recover.mock.calls[0][0].sourceDestination).toBe(
    f.input.destination,
  );
  expect(result.membershipAuthenticated).toBe(false);
  expect(result.spendingEnabled).toBe(false);
  expect(Object.keys(result)).not.toContain("receipt");
  expect(state.enrollment.openPoiIntents).not.toHaveBeenCalled();
  lane.close();
  await lane.closed;
});
test("forged membership upgrade from output recovery is refused", async () => {
  const f = fixture();
  state.recover.mockResolvedValue({
    status: "matched",
    membershipAuthenticated: true,
    spendingEnabled: false,
  });
  const lane = f.createRailgunPoiLane(f.input);
  await expect(lane.recoverOutput(hex("4"))).rejects.toThrow();
  lane.close();
  await lane.closed;
});
test("revocation before invocation prevents store or service calls", async () => {
  const f = fixture(),
    lane = f.createRailgunPoiLane(f.input);
  f.controller.abort();
  await expect(lane.prepareShield(hex("1"))).rejects.toThrow();
  expect(state.enrollment.openReservations).not.toHaveBeenCalled();
  await lane.closed;
});

test("Promise species return cannot replace held native review settlement", async () => {
  const f = fixture(),
    work = deferred(),
    foreignThen = jest.fn();
  Object.defineProperty(work.promise, "constructor", {
    value: {
      [Symbol.species]: function (executor) {
        executor(
          () => {},
          () => {},
        );
        return { then: foreignThen };
      },
    },
  });
  f.input.reviewDisclosures.mockReturnValue(work.promise);
  const lane = f.createRailgunPoiLane(f.input),
    pending = lane.prepareShield(hex("1"));
  await tick();
  expect(state.membership).not.toHaveBeenCalled();
  expect(foreignThen).not.toHaveBeenCalled();
  work.resolve(true);
  await pending;
  lane.close();
  await lane.closed;
});
test("original proof rejection with failed original cleanup preserves unknown-drain failure", async () => {
  const f = fixture();
  state.prove.mockRejectedValue(Error("proof failed"));
  f.membership.close.mockImplementation(() =>
    f.membership.drain.reject(Error("drain failed")),
  );
  const lane = f.createRailgunPoiLane(f.input);
  await expect(lane.prepareShield(hex("1"))).rejects.toHaveProperty(
    "code",
    "RAILGUN_POI_FACADE_DRAIN_UNOBSERVED",
  );
  await expect(lane.closed).rejects.toThrow();
});
test("private companion is not an exported package authority surface", () => {
  const fs = require("fs"),
    path = require("path");
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"),
  );
  expect(JSON.stringify(pkg.exports)).not.toContain("operational-poi-lane");
  const source = fs.readFileSync(
    path.join(__dirname, "../src/owners/operational-poi-lane.js"),
    "utf8",
  );
  expect(source).not.toContain("withSpendingKey");
  expect(source).not.toContain("withViewingKey");
  expect(source).not.toContain("host-bindings");
});

test("prepared and attempted output diagnostics invoke distinct fixed owners, never a caller state override", async () => {
  const f = fixture(),
    lane = f.createRailgunPoiLane(f.input);
  let savedState = "prepared";
  state.recover.mockImplementation(async (input, mode) =>
    mode !== savedState
      ? { status: "refused", stage: "stored" }
      : {
          status: "matched",
          capsuleDigest: hex("4"),
          revision: mode === "attempted" ? 2 : 1,
          payloadSha256: hex("5"),
          outputMatched: true,
          membershipAuthenticated: false,
          spendingEnabled: false,
          ...(mode === "attempted"
            ? {
                recordState: "attempted",
                attemptBodySha256: hex("6"),
                eligibilityEstablished: false,
                attemptOutcomeKnown: false,
                submissionAccepted: false,
                retryEnabled: false,
              }
            : {}),
        },
  );
  await expect(lane.recoverAttemptedOutput(hex("4"))).resolves.toEqual({
    status: "refused",
    stage: "stored",
  });
  await expect(lane.recoverOutput(hex("4"))).resolves.toHaveProperty(
    "status",
    "matched",
  );
  savedState = "attempted";
  await expect(lane.recoverOutput(hex("4"))).resolves.toEqual({
    status: "refused",
    stage: "stored",
  });
  const result = await lane.recoverAttemptedOutput(hex("4"));
  expect(result).toMatchObject({
    status: "matched",
    recordState: "attempted",
    attemptOutcomeKnown: false,
    submissionAccepted: false,
    retryEnabled: false,
    eligibilityEstablished: false,
    membershipAuthenticated: false,
  });
  expect(state.recover.mock.calls.map((call) => call[1])).toEqual([
    "attempted",
    "prepared",
    "prepared",
    "attempted",
  ]);
  for (const [input, mode] of state.recover.mock.calls) {
    expect(Object.hasOwn(input, "sourceDestination")).toBe(mode === "prepared");
    expect(Object.hasOwn(input, "attempted")).toBe(false);
    expect(Object.hasOwn(input, "state")).toBe(false);
  }
  expect(state.submit).not.toHaveBeenCalled();
  expect(state.prove).not.toHaveBeenCalled();
  lane.close();
  await lane.closed;
});
test.each([
  "retryEnabled",
  "submissionAccepted",
  "attemptOutcomeKnown",
  "eligibilityEstablished",
])("attempted diagnostic cannot upgrade %s", async (key) => {
  const f = fixture(),
    lane = f.createRailgunPoiLane(f.input);
  state.recover.mockResolvedValue({
    status: "matched",
    capsuleDigest: hex("4"),
    outputMatched: true,
    recordState: "attempted",
    attemptBodySha256: hex("6"),
    membershipAuthenticated: false,
    spendingEnabled: false,
    eligibilityEstablished: false,
    attemptOutcomeKnown: false,
    submissionAccepted: false,
    retryEnabled: false,
    [key]: true,
  });
  await expect(lane.recoverAttemptedOutput(hex("4"))).rejects.toThrow();
  lane.close();
  await lane.closed;
});

test("source-derived admission rejects missing, foreign-route and legacy selector properties", async () => {
  const f = fixture(),
    lane = f.createRailgunPoiLane(f.input);
  await lane.prepareShield(hex("1"));
  const shield = state.membership.mock.calls[0][0],
    proof = state.prove.mock.calls[0][0];
  expect(() =>
    admission("shield", { ...shield, identity: state.identity }),
  ).toThrow();
  expect(() => admission("transact", shield)).toThrow();
  const { membershipReceipt, ...withoutReceipt } = proof;
  void membershipReceipt;
  expect(() => admission("proof", withoutReceipt)).toThrow();
  expect(() =>
    admission("proof", { ...proof, filename: "/unselected/job.js" }),
  ).toThrow();
  expect(() => admission("proof", { ...proof, binaryKey: true })).toThrow();
  const base = {
    identity: state.identity,
    enrollment: state.enrollment,
    coordinator: state.coordinator,
    archive: f.input.archive,
    capsuleDigest: hex("4"),
    signal: f.input.signal,
  };
  expect(admission("attemptedOutput", base)).toBe(true);
  expect(() => admission("preparedOutput", base)).toThrow();
  expect(() =>
    admission("attemptedOutput", {
      ...base,
      sourceDestination: f.input.destination,
    }),
  ).toThrow();
  lane.close();
  await lane.closed;
});
