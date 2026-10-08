# Explicit public-cache opening

`getRailgunPublicPolicy` binds every public generation to the package's own
source identity. After any package source change, an existing account has no
active public generation for the new policy. `openAccount({accountIndex,
signal})` opens public data only in `active` mode and therefore refuses such an
account with `RAILGUN_ACCOUNT_PUBLIC_REFUSED`. `rebuildPublic()` and
`resumePublic()` exist only on an already-open session, so they cannot help.

`openAccount({accountIndex, signal, publicCache})` accepts one explicit opt-in:

- `"new"` opens the public cache exactly as `rebuildPublic()` does: it begins a
  fresh generation for the current policy (`mode: "new"`).
- `"pending"` resumes an interrupted fresh generation exactly as
  `resumePublic()` does.

Absent `publicCache` keeps the active-only opening. `createAccount` refuses the
key; any other value refuses before an owner opens. Identity, enrollment and all
custody stores (reservations, capsules, submission journal) open unchanged, and
no earlier generation is deleted. Reads, lanes and recovery keep their existing
completed-public requirements: the caller advances ranges before using them.
Nothing is rebuilt implicitly; a rescan is an explicit, reviewed caller choice
with the disclosures of ordinary public advancement.

Native evidence: a legacy (843c0cfc) normal-transfer `proved-unsent` hold on a
synthetic profile could not be opened by the installed facade before this
option (journey run G3-legacy-recover).
