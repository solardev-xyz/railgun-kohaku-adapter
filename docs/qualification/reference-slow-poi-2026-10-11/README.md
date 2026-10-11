# Slow POI reads and retained-version upgrade — October 11, 2026

The installed guided lifecycle passed all 179 steps with 1.25-second public
reads and 5-second POI reads during both preparation and cold submission. The
[index](INDEX.json) binds the production commit, clean installation and results.
Alice paid Bob; Bob independently discovered and unshielded the received note;
Charlie discovered no owned note. Three broadcasts produced three synthetic
transactions, with receipt and conservation checks. The service verified the
current-circuit POI proof. Peak observed request concurrency was six.

The change overlaps independent POI event/root validation, TXID-root acquisition
and public preflight work. Selected-input reads wait for their eligibility gate.
Captured evidence ages, review floors, signing admission and destination checks
are unchanged. Every original request drains on failure; a first refusal retains
its closed diagnostic. This reduces serial latency without making stale evidence
current again. The concurrency and disclosure ordering are described in the
[policy inventory](../../owners/POLICY-SEPARATION.md).

At the actual transaction prompt, Alice had 16,767 ms and Bob 19,255 ms remaining.
Those are measured prompt margins, separate from the owner's earlier captured
review window. They exceed the required 15-second floor in this fixture; they do
not guarantee an arbitrary human response time or live-service latency.

## Exact old-version custody

A separate run created a genuine retained, unsent Alice payment with the original
interrupted guided installation (tar `88850501…`, host `f1f16706…`). Its old cold
submission refused with zero broadcasts. The successor refused to continue the
old guide and refused the old derived-cache policy. Supported public and wallet
rebuilds preserved the same held operation and selected unspent note.

Alice then submitted that exact retained operation on the new installation. Bob
independently rebuilt his view, observed Valid and completed a warm unshield.
Both submissions used the 1.25-second/5-second delays. Their actual prompt margins
were 16,787 ms and 23,121 ms. Two new broadcasts completed the three-transaction
lifecycle, all three receipts succeeded within policy, and conservation passed.
This is an explicit version-upgrade continuation, not a frozen guided run.

## Installation and checks

Both final runs used tar `32846549…` from production commit `3120bfc`. Its clean
304-member installation passed offline account creation and cold reopening with
the same account and zero connections. Public runtime archives/artifacts are the
previously reproduced pinned inputs, not newly downloaded runtime builds.

Lint and both typechecks passed. Mutation controls detected removal of the POI
drain, warm eligibility gate and first-refusal diagnostic guard. The first full
CI run exposed three staged-test expectations of the former serial request order;
the tampered signed events still refused with no membership verification. The
test-only successor `aa5742f` checks the new exact order while retaining those
refusals and the historical provenance. It changes no package or host bytes.
[Exact-head CI](https://github.com/solardev-xyz/railgun-kohaku-adapter/actions/runs/38164904969)
passed on Linux and macOS: 325 suites and 13,290 tests passed on each platform,
with one skipped suite and four explicitly skipped external-runtime tests. Lint,
both typechecks, consumer smoke and source-list checks also passed. The index
records the exact tested head; subsequent documentation does not redefine it.

## Limits and next live gate

Chain execution, lists, service signatures and finality are synthetic over
loopback SOCKS/TLS. Custody, installed owners, fresh processes, proving and
current-circuit POI verification are real. The documented synthetic-list transform
is the only fixture package transform. This does not qualify EVM behavior, Tor
reliability, deployment acceptance, other circuits or other platforms.

Two subsequent eight-request public-only live latency screens failed the same
predeclared thresholds. In the first, global POI reads took approximately 6–13
seconds, beyond the qualified fixture and the screen's four-second margin. In
the second, POI reads improved, but RPC reads took approximately 1.4–8.7 seconds.
All responses succeeded. No funded submission followed either screen. These are
service/Tor-path snapshots, not evidence of a persistent outage or permission to
relax the evidence-age rules.

The interrupted funded installation and original held payment remain preserved.
A frozen-version guided live lifecycle and an independent human walkthrough are
still open gates. Neither is replaced by these synthetic results or by the prior
successful explicit-command live Alice-to-Bob journey.
