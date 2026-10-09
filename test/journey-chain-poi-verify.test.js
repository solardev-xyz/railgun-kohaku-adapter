"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  PINS,
  createJourneyPoiVerifier,
} = require("../tools/qualification/installed-journey/journey-poi-verifier.cjs");
const { prepareRailgunPoiSubmission } = require("../src/data/railgun-poi-submit-data.js");
const { TEST_LIST } = require("../tools/qualification/installed-journey/synthetic-copy-contract.cjs");
const fixture = require("./fixtures/journey-poi-verify-proofs.json");

const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const family = path.join(__dirname, "../tools/qualification/installed-journey");
// The pinned local research inputs: engine source tree, unpacked serial prover
// (byte-identical to railgun-prover.asar/serial-prover.cjs) and the published
// disposable public source. Absent inputs skip only the cryptographic tests.
const ROOT =
  process.env.RAILGUN_PINNED_INPUTS_ROOT ||
  "/Users/florian/Git/freedom-dev/freedom-privacy-roadmap/tmp";
const inputs = {
  engineModules: path.join(ROOT, "privacy-build/railgun-engine-oct3-a/source/node_modules"),
  serialProver: path.join(ROOT, "privacy-build/railgun-prover-oct3-f/source/serial-prover.cjs"),
  publicSource:
    process.env.RAILGUN_JOURNEY_PUBLIC_SOURCE ||
    "/private/tmp/railgun-owner-bridge-oct8/docs/freedom-qualification/railgun-unsigned-relay-preparation-2026-10-06/public-source.json",
};
const pinned = fs.existsSync(inputs.engineModules) && fs.existsSync(inputs.serialProver);
const withChain = pinned && fs.existsSync(inputs.publicSource);
const cryptographic = pinned ? test : test.skip;
const chainTest = withChain ? test : test.skip;
jest.setTimeout(180000);

// The real package serializer, then the node's view: JSON.parse of the body.
function wire(name, change = (data) => data) {
  const submission = prepareRailgunPoiSubmission({
    requestId: 1791500000000,
    payload: { listKey: "efc6ddb59c098a13fb2b618fdae94c1c3a807abc8fb1837c93620c9143ee9e88", ...fixture.proofs[name].payload },
  });
  const parsed = JSON.parse(submission.body);
  parsed.params.transactProofData = change(parsed.params.transactProofData);
  return parsed;
}

test("the verifier's own key is the pinned current POI_3x3 key", () => {
  const text = fs.readFileSync(path.join(family, "POI_3x3-current.vkey.json"));
  expect(sha(text)).toBe(PINS.vkey);
  expect(PINS.vkey).toBe("b7ca7ba048666fb0e17efd0af1e407a8dcb0906bfaf2f20e362ed40cbec6f4d8");
  const vkey = JSON.parse(text);
  expect([vkey.protocol, vkey.curve, vkey.nPublic, vkey.IC.length]).toEqual(["groth16", "bn128", 8, 9]);
});

test("the fixture proves one public vector with both circuits and the same output binding", () => {
  expect(fixture.schema).toBe("railgun-journey-poi-verify-proofs-v1");
  expect(fixture.vectorSha256).toBe("a52eaba565f55ecc5aa657eb1d98dc9de24bf7351cc77d3c704bce8dc02fea84");
  expect(fixture.generatorSha256).toBe(sha(fs.readFileSync(path.join(family, "poi-verify-fixture.cjs"))));
  expect(fixture.proofs.current.artifacts.vkey).toBe(PINS.vkey);
  expect(fixture.proofs.retired.artifacts.vkey).toBe(
    "2f4dcbf58d383204e09240863a6f6eff249071849e5161801ebfe83691037b23",
  );
  const { current, retired } = fixture.proofs;
  for (const key of ["blindedCommitmentsOut", "railgunTxidIfHasUnshield", "txidMerkleroot", "poiMerkleroots", "txidMerklerootIndex"])
    expect(current.payload[key]).toEqual(retired.payload[key]);
  expect(current.payload.proof).not.toEqual(retired.payload.proof);
});

test("changed or missing pinned verifier inputs are refused before any verification", () => {
  expect(() =>
    createJourneyPoiVerifier({ engineModules: path.join(__dirname, "../node_modules"), serialProver: __filename }),
  ).toThrow();
  if (pinned)
    expect(() => createJourneyPoiVerifier({ engineModules: inputs.engineModules, serialProver: __filename })).toThrow(
      /Serial prover pin/,
    );
});

cryptographic("current-circuit proof verifies; retired-circuit and changed inputs do not", async () => {
  const verifier = createJourneyPoiVerifier(inputs);
  const data = (name, change) => wire(name, change).params.transactProofData;
  expect(await verifier.verify(data("current"))).toBe(true);
  expect(await verifier.verify(data("retired"))).toBe(false);
  const bump = (value) => (BigInt("0x" + value) + 1n).toString(16).padStart(64, "0");
  expect(await verifier.verify(data("current", (d) => ({ ...d, txidMerkleroot: bump(d.txidMerkleroot) })))).toBe(false);
  expect(
    await verifier.verify(data("current", (d) => ({ ...d, poiMerkleroots: [bump(d.poiMerkleroots[0])] }))),
  ).toBe(false);
  expect(verifier.report()).toEqual({ key: PINS.vkey, circuits: ["3x3"], verified: 1, rejected: 3, failed: 0 });
});

async function chainWith(poiVerifier) {
  const { ethers } = require("ethers");
  const { TRANSACT_ABI } = require("../src/data/railgun-private-policy.js");
  const { createJourneyChain, POI_URL } = require(path.join(family, "journey-chain.cjs"));
  const { createJourneyCrypto } = require(path.join(family, "journey-crypto.cjs"));
  const worker = createJourneyCrypto({ engineModules: inputs.engineModules });
  const chain = createJourneyChain({
    ethers,
    transactAbi: TRANSACT_ABI,
    sourceBytes: fs.readFileSync(inputs.publicSource),
    crypto: worker,
    poiVerifier,
  });
  await chain.init();
  const subject = { kind: "private-account", role: "poi", chainId: 11155111 };
  // The synthetic copy's only change is its list key (synthetic-copy-contract).
  const submit = (body) => chain.request(subject, POI_URL, { ...body, params: { ...body.params, listKey: TEST_LIST } });
  return { chain, worker, submit };
}

chainTest("the synthetic node answers a retired-circuit proof as the deployed node did", async () => {
  const { chain, worker, submit } = await chainWith(createJourneyPoiVerifier(inputs));
  try {
    const before = chain.state().poi.accepted;
    await expect(submit(wire("retired"))).rejects.toMatchObject({
      code: "SYNTHETIC_RPC_ERROR",
      httpStatus: 400,
      rpcError: { code: -32602, message: "Invalid proof" },
    });
    expect(chain.state().poi.accepted).toEqual(before);
    expect(chain.report().refusals).toEqual([]);
    // A verified proof proceeds to the node's later root checks. The public
    // vector's roots are not this synthetic list's, so it stops there.
    await expect(submit(wire("current"))).rejects.toThrow(/Unknown POI root/);
    expect(chain.state().poi.accepted).toEqual(before);
    expect(chain.report().poiVerification).toEqual({
      key: PINS.vkey,
      circuits: ["3x3"],
      verified: 1,
      rejected: 1,
      failed: 0,
      invalidProofs: 1,
      verifierFailures: 0,
    });
  } finally {
    await worker.close();
  }
});

chainTest("a failed or absent verifier never accepts and is a recorded refusal", async () => {
  for (const poiVerifier of [{ verify: async () => Promise.reject(Error("verifier down")) }, null]) {
    const { chain, worker, submit } = await chainWith(poiVerifier);
    try {
      await expect(submit(wire("current"))).rejects.toMatchObject({
        code: "SYNTHETIC_RPC_ERROR",
        httpStatus: 500,
        rpcError: { code: -32603, message: "Internal error" },
      });
      expect(chain.state().poi.accepted).toEqual([]);
      expect(chain.report().refusals).toEqual([
        expect.objectContaining({ lane: "poi", method: "ppoi_submit_transact_proof" }),
      ]);
      expect(chain.report().poiVerification.verifierFailures).toBe(1);
    } finally {
      await worker.close();
    }
  }
});
