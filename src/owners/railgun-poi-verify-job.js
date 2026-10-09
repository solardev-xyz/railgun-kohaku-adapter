/** Keyless, offline POI verification. No engine, account, store or key import.
 * List/checkpoint metadata are bound in the payload digest, not authenticated
 * by the circuit. All authority must be established by a later controller.
 * The transition check instead requires a proof that the pinned retired POI
 * circuit key accepts and the current key rejects; that confers no validity.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { createPrivacyScope } = require('./context-bindings');
const { normalizeRailgunPoiPayload } = require("../data/railgun-poi-payload.js");
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
// The POI_3x3 key that wallet 11.2.0's circuit rotation retired.
const RETIRED_VKEY_SHA256 = '2f4dcbf58d383204e09240863a6f6eff249071849e5161801ebfe83691037b23';
exports.run = async function run(text, { request, signal, guardReport }) {
  let artifacts, scope;
  try {
    assert.ok(typeof text === 'string' && Buffer.byteLength(text) <= 32768);
    const active = () => assert.ok(signal instanceof AbortSignal && !signal.aborted);
    active();
    const input = JSON.parse(text);
    const transition = Object.hasOwn(input, 'transition');
    assert.deepEqual(Object.keys(input).sort(), [
      'artifactDirectory',
      'payload',
      'proverArchive',
      ...(transition ? ['transition'] : []),
    ]);
    assert.ok(!transition || input.transition === true);
    assert.ok(
      typeof input.artifactDirectory === 'string' && path.isAbsolute(input.artifactDirectory)
    );
    const payload = normalizeRailgunPoiPayload(input.payload);
    const serial = require("../execution/railgun-prover-runtime.js").loadRailgunProverRuntime(
      input.proverArchive
    );
    assert.equal(typeof serial.verify, 'function');
    assert.equal(globalThis.curve_bn128, null);
    scope = createPrivacyScope({ profileId: 'railgun-keyless-poi-verify', signal });
    // Reuse the authenticated bounded loader; its unused WASM/zkey are wiped.
    artifacts = await require("../execution/railgun-artifacts.js").loadRailgunArtifacts({
      handle: scope.getContext({
        kind: 'private-account',
        principal: 'verification',
        protocol: 'railgun',
        deployment: 'offline',
        chainId: 11155111,
        role: 'artifacts',
      }),
      directory: input.artifactDirectory,
      variant: 'POI_3x3',
    });
    active();
    assert.equal(artifacts.vkey.nPublic, 8);
    // Pinned engine Merkle zero, distinct from the blinded-output zero padding.
    const zero = BigInt('0x' + require("./railgun-public-records.js").ZERO_NODES[0]);
    const signals = [
      payload.blindedCommitmentsOut.length ? BigInt(payload.blindedCommitmentsOut[0]) : 0n,
      0n,
      0n,
      BigInt('0x' + payload.txidMerkleroot),
      BigInt(payload.railgunTxidIfHasUnshield),
      BigInt('0x' + payload.poiMerkleroots[0]),
      zero,
      zero,
    ];
    const changed = [...signals];
    changed[3] = (changed[3] + 1n) % FIELD;
    let retiredVkeySha256;
    if (transition) {
      const bytes = fs.readFileSync(require.resolve('../execution/railgun-poi-retired-vkey.json'));
      retiredVkeySha256 = createHash('sha256').update(bytes).digest('hex');
      assert.equal(retiredVkeySha256, RETIRED_VKEY_SHA256);
      const retired = JSON.parse(bytes.toString());
      assert.ok(retired.protocol === 'groth16' && retired.curve === 'bn128');
      assert.ok(retired.nPublic === 8 && retired.IC.length === 9);
      // Each verdict is a completed verification; a thrown verifier refuses.
      assert.equal(await serial.verify(retired, signals, payload.proof), true);
      active();
      assert.equal(await serial.verify(retired, changed, payload.proof), false);
      active();
      assert.equal(await serial.verify(artifacts.vkey, signals, payload.proof), false);
      active();
    } else {
      assert.equal(await serial.verify(artifacts.vkey, signals, payload.proof), true);
      active();
      assert.equal(await serial.verify(artifacts.vkey, changed, payload.proof), false);
      active();
    }
    assert.equal(globalThis.curve_bn128, null);
    const guards = guardReport();
    assert.equal(guards.attempts, 0);
    assert.deepEqual(
      JSON.parse(
        await request(
          JSON.stringify({
            id: 1,
            method: 'result',
            value: {
              inputSha256: createHash('sha256').update(text).digest('hex'),
              payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
              ...(transition
                ? {
                    retiredVerified: true,
                    currentRejected: true,
                    retiredVkeySha256,
                    currentVkeySha256: require("../execution/railgun-artifacts.js").manifest.POI_3x3.find(
                      (entry) => entry.kind === 'vkey'
                    ).sha256,
                  }
                : {}),
              proofVerified: !transition,
              sourceAuthenticated: false,
              membershipAuthenticated: false,
              rootAccepted: false,
              disclosureEnabled: false,
              spendingEnabled: false,
              proverSha256: require("../execution/railgun-prover-manifest.json").sha256,
              guards,
            },
          })
        )
      ),
      { id: 1, value: null }
    );
    active();
  } catch {
    throw Object.assign(new Error('Railgun POI verification unavailable'), {
      code: 'RAILGUN_POI_VERIFICATION_REFUSED',
    });
  } finally {
    artifacts?.wasm.fill(0);
    artifacts?.zkey.fill(0);
    scope?.close();
  }
};
