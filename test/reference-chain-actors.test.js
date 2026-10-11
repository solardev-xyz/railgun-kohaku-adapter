"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  ethers = require("ethers");
const {
  createJourneyChain,
  ENDPOINT,
  PROXY,
} = require("../tools/qualification/installed-journey/journey-chain.cjs");
const {
  createJourneyCrypto,
} = require("../tools/qualification/installed-journey/journey-crypto.cjs");
const { TRANSACT_ABI } = require("../src/data/railgun-private-policy.js");
const { SHIELD_ABI } = require("../src/owners/railgun-shield-policy.js");
const pins = require("../src/railgun-shield-pins.json");
// Opt-in real-engine fixture test. The default Node CI has no engine archive;
// installed acceptance runs this behavior through real independent host actors.
// An explicitly supplied but invalid engine path fails; it never silently skips.
const engineModules = process.env.RAILGUN_JOURNEY_ENGINE_MODULES;
const publicSource = path.join(
  __dirname,
  "../docs/freedom-qualification/railgun-unsigned-relay-preparation-2026-10-06/public-source.json",
);
const native = engineModules === undefined ? test.skip : test;
native(
  "synthetic fresh shields retain distinct EOAs, per-EOA nonces, receipts and list leaves",
  async () => {
    const worker = createJourneyCrypto({ engineModules }),
      alice = new ethers.Wallet("0x" + "01".repeat(32)),
      bob = new ethers.Wallet("0x" + "02".repeat(32));
    const chain = createJourneyChain({
      ethers,
      transactAbi: TRANSACT_ABI,
      sourceBytes: fs.readFileSync(publicSource),
      crypto: worker,
      submitters: [alice.address.toLowerCase(), bob.address.toLowerCase()],
      balance: 1000000000000000000n,
      maxShieldAmount: 50000000000000000n,
    });
    const abi = new ethers.Interface(SHIELD_ABI),
      word = (n) => ethers.zeroPadValue(ethers.toBeHex(n), 32);
    const value = 30000000000000000n,
      shield = abi.encodeFunctionData("shield", [
        [
          [
            [word(17), [0, pins.wrappedNative, 0], value],
            [[word(1), word(2), word(3)], word(4)],
          ],
        ],
      ]);
    const data = abi.encodeFunctionData("multicall", [
      true,
      [
        [pins.relayAdapt, abi.encodeFunctionData("wrapBase", [value]), 0],
        [pins.relayAdapt, shield, 0],
      ],
    ]);
    const request = (actor, method, params) =>
      chain.request(
        {
          kind: "public-address",
          principal: actor.address.toLowerCase(),
          chainId: 11155111,
          role: "transaction-rpc",
        },
        ENDPOINT,
        { jsonrpc: "2.0", id: 1, method, params },
      );
    try {
      await chain.init();
      expect(BigInt(await request(alice, "eth_getBalance", [alice.address, "pending"])))
        .toBe(1000000000000000000n);
      const hashes = [];
      for (const actor of [alice, bob]) {
        expect(
          await request(actor, "eth_getTransactionCount", [
            actor.address,
            "pending",
          ]),
        ).toBe("0x0");
        const raw = await actor.signTransaction({
          chainId: 11155111,
          to: pins.relayAdapt,
          value,
          data,
          nonce: 0,
          gasLimit: 1500000,
          gasPrice: 1000015,
          type: 0,
        });
        hashes.push(await request(actor, "eth_sendRawTransaction", [raw]));
        expect(
          await request(actor, "eth_getTransactionCount", [
            actor.address,
            "pending",
          ]),
        ).toBe("0x1");
      }
      await chain.mine();
      for (const [index, actor] of [alice, bob].entries()) {
        const receipt = await request(actor, "eth_getTransactionReceipt", [
          hashes[index],
        ]);
        expect(receipt).toMatchObject({
          status: "0x1",
          from: actor.address.toLowerCase(),
          to: pins.relayAdapt,
        });
        expect(receipt.logs).toHaveLength(1);
        expect(receipt.logs[0].address).toBe(PROXY);
        const tx = await request(actor, "eth_getTransactionByHash", [
          hashes[index],
        ]);
        expect(BigInt(tx.value)).toBe(value);
        expect(tx.nonce).toBe("0x0");
      }
      expect(chain.state().poi.accepted.map((row) => row.type)).toEqual([
        "Shield",
        "Shield",
      ]);
      expect(
        new Set(chain.state().poi.accepted.map((row) => row.blindedCommitment))
          .size,
      ).toBe(2);
      chain.assertClean();
      const cold = createJourneyChain({
        ethers,
        transactAbi: TRANSACT_ABI,
        sourceBytes: fs.readFileSync(publicSource),
        crypto: worker,
        state: chain.state(),
        maxShieldAmount: 50000000000000000n,
        submitters: [alice.address.toLowerCase(), bob.address.toLowerCase()],
      });
      await cold.init();
      expect(cold.derived()).toEqual(chain.derived());
    } finally {
      await worker.close();
    }
  },
  30000,
);
