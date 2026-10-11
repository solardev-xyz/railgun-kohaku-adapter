# Application spending policy

The trusted main initializer accepts an optional application gas and direct-operation amount ceilings:

```js
const { initializeRailgunMain } = require("@freedom/railgun-kohaku-adapter/host/owner");

const owner = initializeRailgunMain({
  host,
  runtime,
  applicationPolicy: {
    maxGasFee: 2000000000000000n,
    maxOperationAmount: 50000000000000000n, // example: 0.05 native units
  },
});
```

`maxGasFee` is a positive bigint in wei. Omission retains the historical 0.002
ETH ceiling. An explicit policy is a nonempty plain record containing either or both
`maxGasFee` and `maxOperationAmount` as own enumerable data properties; getters, proxies, extra keys, explicit `undefined`
and non-bigints refuse. Each omitted field defaults independently. Initialization captures both values once. Changing the
input object later cannot change it. A failed initialization poisons bootstrap,
including attempts through another physical package copy.

The maximum accepted application ceiling is 1 ETH. This is an implementation
sanity bound, not a Railgun protocol limit, recommendation or mainnet allowance.
The reference application explicitly retains 0.002 ETH. This change does not
expand its live transaction or campaign authority.

## A ceiling is not a transaction approval

Each public/private/recovery lane still supplies its own positive `maxGasFee`,
which must be at most the captured ceiling. A lane cannot supply or replace the
application policy. The 3,000,000 gas-limit resource bound is unchanged.
Preparation checks that the gas payer can cover that lane's selected budget.
At signing, the exact transaction must still satisfy
`gasLimit × gasPrice-or-maxFeePerGas ≤ maxGasFee`, with a matching gas limit,
destination, calldata, value and chain. Shield additionally requires enough
balance for value plus gas. Explicit transaction review and all genuine custody,
nonce, proof, cancellation and journal checks remain necessary.

A retained, never-attempted operation uses the current recovery lane's budget
and a fresh transaction review. Its old preparation does not preserve a fee
allowance. Raising the application ceiling cannot make an attempted or uncertain
transaction resendable: the original journal and no-second-attempt checks still
run before new disclosure/proving/signing work. Relay quote `feeCap` is separate
and unchanged.

The captured value is application policy, not derived-cache interpretation. A
new process may change its ceiling without changing cache compatibility. Source
changes remain subject to the conservative source-identity inventory. Hosts
should record their selected ceiling with private operational evidence; the
reference composition exposes its frozen policy to its own reporting code.

## Direct operation amount

`maxOperationAmount` is a positive bigint, at most `2^120 - 1`. Omission retains
10^16 smallest units (0.01 ETH/WETH). Shield checks the gross deposited value;
private operations check the **entire selected input**, including a partial
unshield whose public output is smaller. This ceiling is checked before direct
preparation and again at private-signing and warm/stored EOA submission gates.
It does not grant authority: ownership, proof, custody, freshness, destination,
review and no-resend checks remain necessary.

A lower ceiling does not prevent reading, observing, resolving or recovering
retained custody, or verifying/preparing its POI. It prevents a new signing or
submission under that policy. A later process restoring a higher ceiling can
submit only an operation still admitted by its genuine custody and journal;
a previous attempted or uncertain send never becomes resendable.

Canonical wider capsule/journal formats keep historical bytes and digest domains
unchanged. Older readers refuse the new versions. See [operation formats](OPERATION-FORMATS.md).
The public `/data` and `/host/data` compatibility readers keep their legacy
contracts; the owners use internal retained readers for the wider formats.

The root Kohaku adapters independently accept optional `maxAmount`, defaulting
to 10^16. It checks requested inputs and cannot override the real owner's policy.
Hosts raising the direct ceiling should provide the same value to both layers.
Read balances and notes remain visible even above the configured spending limit.
The reference app accepts optional decimal-string `maxOperationAmount` in its
configuration and threads it to both layers; its live qualification keeps the
original default and campaign limits.

Relay selection has its own unchanged 10^16 ceiling. Raising **or lowering** the
direct amount ceiling does not change relay admission; the present relay path
still stops at local custody. Sepolia deployment, asset and supported proof
shapes remain fixed. See [the policy inventory](POLICY-SEPARATION.md).
