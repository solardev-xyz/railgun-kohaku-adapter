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

The journal owners derive these versions from calldata, preserve legacy
digests, and validate settlement against the authenticated intent version.
Direct preparation and warm/cold submission check the captured application
amount policy independently of these structural readers. Tests cover both
input origins, partial change and lowered-policy admission. A genuine installed
wider-amount lifecycle remains a qualification gate; structural tests alone
cannot close it. Relay selection and fee limits remain independently bounded.

## Recovery and POI data helpers

Internal preparation, guarded-result, original-signature recovery and POI
selector helpers now compose the retained reader. Their historical `/host/data`
and `/host/poi` counterparts still compose the legacy reader and bounds. They
share algorithms, with matching fixtures proving old byte domains and refused
wider inputs at the public host boundaries.

A Shield-origin membership digest keeps its existing domain and binds the full
canonical capsule. A Transact-origin membership digest selects from an explicit
four-version table and also binds the canonical capsule. The own-transaction
lookup domain remains selected by transaction shape (full/transfer versus
partial): its inputs come from public calldata, so it must not depend on a
transfer's private input amount or capsule version.

Structural tests cover both origin types, exact note value and original signed
root, partial change and wide POI selector bindings. They do not establish real
ownership or prove that a wider operation can execute. Owner and utility callers now use the retained composition; fresh direct
selection and signing have separate amount-admission checks. Native coverage
is recorded separately from these structural checks.

## Public transaction journals and outcomes

The trusted-host `/host/journal-data` readers accept canonical additional formats:
full unshield v3, partial unshield v4, and native Shield v2. The version is selected
only from the public calldata amount, with the same uint120 bound as the note
format. Legacy full-unshield/Shield records remain unversioned; partial v2 stays
unchanged. A wider private input with a small public partial-unshield amount still
has a v2 journal. Transfers stay unversioned and disclose no private input amount.

Receipt and durable-outcome validation require matching versions and conservation
against the authenticated journal. These are data readers, not spending grants.
The admission-facing Shield validator and current owner selection limits remain
legacy-bound in this stage. Historical digest transcripts, legacy reader fixtures,
and explicit downgrade refusals are covered by tests. Hosts that exhaustively
narrow partial journal versions must handle both 2 and 4 before enabling a wider
application policy. No migration rewrites existing journal records.

A downgrade after writing a wide public journal record is unsupported: an older
reader refuses the containing EOA journal, preserving its bytes and custody
without allowing operation. A wide-input partial with a small public amount has
a legacy v2 journal but still requires the new v4 capsule reader. Back up retained
state before an upgrade; never strip a version to make an older reader accept it.
