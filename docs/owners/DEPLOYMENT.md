# Closed deployment contract

Trusted-main initialization accepts `deployment: 'sepolia'`. Omitting it selects
the same deployment. Unknown names, numbers, objects and explicit `undefined`
refuse before host enrollment; initialization remains one-shot and a failed
attempt cannot be retried through a second package copy. This option does not
accept caller-supplied addresses, code hashes, fee values or service URLs. The
option is currently an assertion: it changes no behavior beyond refusing
unsupported values; consumers use the sole immutable Sepolia descriptor directly.
With TypeScript `exactOptionalPropertyTypes` disabled, optional fields may admit
explicit `undefined` statically; the runtime still refuses it.

The internal immutable descriptor in `src/deployment.js` records the qualified
Sepolia chain, contract/code pins, protocol fees, POI/indexer services, POI launch
block and governance coverage. The service consumers, POI projection, public
policy and unshield fee checks read the shared facts. The underlying deployment
pin JSON retains its historical bytes and provenance. Existing owner contracts
and persisted validators still enforce Sepolia; a second deployment is not
supported merely by adding an object to a registry. The historical
treasury/observed-block receipt baseline, TXID-version strings, job chain objects,
POI chainID fields, chain-ID guards and direct pin-file consumers remain outside
this first centralization.

Three boundaries remain distinct:

- Protocol and custody checks still bind ownership, destination, amount, proof,
  signature and durable attempts. No deployment option relaxes those checks.
- Application gas policy is captured separately. Historical amount/shape bounds
  are still enforced by their existing operation and persisted-format contracts;
  they are not included as protocol facts in the deployment descriptor.
- Qualification coverage describes recorded evidence, not proof of current chain
  state or blanket approval of future governance changes. RPC trust stays
  `unverified-rpc`.

The persisted `sepolia` identity and derivation/AAD domains do not change. This
refactor preserves their values, service destinations and fee arithmetic; it
performs no custody migration. Complete source attestation includes the new
module, so derived-cache policy changes conservatively and requires an explicit
rebuild when upgrading from the previous candidate. The ongoing standalone live
journey keeps its original installed candidate; it is not silently upgraded.

Adding another deployment requires parameterizing every relevant owner and
isolated execution realm, authenticated deployment/circuit facts, compatible
persisted formats and lifecycle evidence. Broader amount policy likewise needs
versioned retained-operation formats and replay/downgrade tests. Neither is
claimed by the initial closed Sepolia selector.
