# Application spending policy

The trusted main initializer accepts an optional application gas ceiling:

```js
const { initializeRailgunMain } = require("@freedom/railgun-kohaku-adapter/host/owner");

const owner = initializeRailgunMain({
  host,
  runtime,
  applicationPolicy: { maxGasFee: 2000000000000000n },
});
```

`maxGasFee` is a positive bigint in wei. Omission retains the historical 0.002
ETH ceiling. An explicit policy must be a plain record with exactly that one
own enumerable data property; getters, proxies, extra keys, explicit `undefined`
and non-bigints refuse. Initialization captures the value once. Changing the
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

Other qualification restrictions have not silently become configurable. Sepolia
deployment pins, the historical capsule amount bounds and supported proof shapes
retain their current contracts; changing persisted meanings requires a distinct
format and migration review. See [the policy inventory](POLICY-SEPARATION.md).
