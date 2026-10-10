# Stored amounts and application ceilings

A stored operation's version determines its amount format. An application's
current spending policy does not reinterpret it. This distinction is necessary
for an adopter to lower its ceiling without losing access to custody, history,
observation or POI for an older operation.

The internal structural foundation is implemented. Owner admission and proving
still enforce their historical amount ceiling; this document does **not** claim
wider amounts can be prepared, signed or submitted yet. The public `/data` and
trusted `/host/data` readers retain their legacy formats and export sets.

## Private capsules

| Version | Shape | Input amount bound |
| --- | --- | --- |
| 1 | Transfer or full unshield | Historical 0.01 ETH unit amount |
| 2 | Partial unshield with change | Historical 0.01 ETH unit amount |
| 3 | Transfer or full unshield | uint120, strictly above the historical bound |
| 4 | Partial unshield with change | uint120, strictly above the historical bound |

Version choice is canonical. A small operation cannot be encoded as version 3
or 4; a wide operation cannot be downgraded to version 1 or 2. Each version keeps
its own `freedom:railgun:private-capsule-vN` digest domain followed by a NUL byte.
The original four golden records retain exactly their bytes and digests.

`railgun-retained-private-data` is an internal reader, not a package subpath or
spending capability. It shares the calldata, intent, offer and capsule algorithms
with the fixed legacy wrappers. Both compositions require exact ABI agreement,
one input, the supported output shape, canonical decimal amounts, the fixed
Sepolia deployment and matching intent fields. The uint120 maximum follows the
existing ABI note-value field; it does not qualify another network or a broader
proof shape. The retained reader adds no captured application policy.

An old reader fixture consists of the actual four modules before this change,
with only a pinned import relocation. It reads the old goldens and refuses the
new records, including attempts to strip their version back to a legacy value.
This proves structural downgrade refusal, not compatibility of every historical
application store or executing wallet.

## Public journal formats

Journal format selection is deliberately separate from capsule selection:

- A private transfer's calldata does not reveal its input amount. Its journal
  stays in the original unversioned format. Never add the private amount merely
  to decide a public journal version.
- Full unshield uses the original unversioned format for a legacy public amount,
  and version 3 for a wider public amount.
- Partial unshield uses version 2 or 4 according to the **public unshield amount**.
  A wide private input with a small public unshield therefore has a version-4
  capsule and a version-2 journal.
- Shield retains the original journal shape for a legacy gross amount and uses
  version 2 for a wider gross amount.

These descriptors are implemented and tested; the journal owners have not yet
been switched to them. The next integration must derive metadata from calldata,
retain all legacy digests, validate settlement according to its authenticated
intent's version, and check current application policy at fresh signature and
send admission. It must also test lowered-policy recovery, both input origins,
partial change, and a genuine installed wider-amount lifecycle before claiming
support. Relay selection and fee limits remain separately bounded and unchanged.
