# Cold retained submission under delayed reads — October 11, 2026

The earlier timing fixture delayed preparation but left cold submission at zero
latency. That missed the failure seen in the second guided live attempt. This
successor delays Shield, private preparation and both actors' cold submission
reads by 1.25 seconds, while preserving every production evidence age, review
floor, operation deadline and custody gate.

Independent deployment reads now run in bounded groups. In transaction admission,
EOA code is still checked before exposing calldata to estimate/simulation; the
independent estimate/call and nonce/balance reads overlap only after their gates.
All original requests drain before failure returns. Host fee/nonce and canonical
journal reads also overlap without moving signing or nonce selection ahead of
validation. The example reports closed warm/cold submission diagnostics and stops
after three pre-SEND failures; a declined review does not consume that allowance.

The first two successors passed their full unit suites but still failed the
stronger installed cold-submission test, at the unchanged review floor. A CPU
profile of the second successor showed repeated synchronous context validation
consuming about 6.5 seconds in the measured 22-second tail, including about 4.7
seconds in physical account-fence checks. Pure profile hashing added roughly
1.1 seconds within that validation work. These are overlapping profile measures,
not additive independent costs or a general performance guarantee.

The final optimization checks a fence's physical identity at its first occurrence
and again before the outermost synchronous owner context read returns. Every
nested predicate still checks logical revocation and database liveness. Direct
assertions, writer admission, settlement and close retain their full checks.
Nothing is reused across an await, callback task, operation or process. Profile
hash memoization applies only to frozen, non-proxy objects with own immutable
string data fields; getters and mutable objects remain uncached.

The real-host/fence integration test exercises a repeated parent-context graph:
five logical checks cause two physical checks inside the frame and five outside
it. Write/request guards, inode/directory/sidecar changes, revocation, reentrant
writer admission, exception cleanup and mutation controls cover the boundary.
A physical exit-check failure takes precedence over an earlier context error;
both refuse, but that can obscure the original diagnostic cause.

## Evidence and limits

The [index](INDEX.json) binds the final 179-step installed guided run: both cold
submissions reached SEND, Alice's deliberately lost response recovered without
another broadcast, Bob unshielded the received note, receipt accounting passed,
and Charlie discovered no owned note. Exactly three synthetic transactions and
three broadcasts occurred, with peak observed request concurrency five.

The full suite passed 325 suites and 13,275 tests, with zero failures and four
explicit external-runtime skips (one partially skipped suite). Lint, root and
owner typechecks, four mutation controls and packed accounting of 271 source
files passed. A separate AI reviewer found no code blocker.

The clean committed installation contains the identical 304-member tar used by
the native run. Installed host bytes differ only in npm's generated package and
lock manifests; both host identities are recorded. Offline account creation and
cold reopening preserve the same account with zero connections. Electron and
locked dependencies were freshly installed; public runtime inputs were the
previously reproduced pinned archives/artifacts, not a fresh runtime download.
Exact-head CI is checked separately after pushing; this record is local evidence.

The installed test uses genuine independent encrypted Alice/Bob/Charlie custody,
fresh Electron processes, real proving and current-circuit POI verification.
Chain execution, list data, service signatures and finality are synthetic, over
loopback SOCKS/TLS. Fixed artificial read latency does not qualify Tor reliability,
live services, EVM behavior or arbitrary latency. The timing fields describe the
owner's captured review budget, not measured time remaining at the human prompt.

The old package's delayed cold-submission control refused at preflight without
broadcasting. Its zero-delay cold command sent once, but that earlier driver's
final assertion used the wrong result field; it is a command-level control, not
a passing complete lifecycle. All failed candidate evidence is preserved.

The funded guided run B remains interrupted with a held, unsent payment on its
original installation. Any explicitly chosen upgrade is a separate continuation,
not a frozen-version guided-live pass. No funded custody was opened, reset or
copied for this qualification. An independent human walkthrough and a complete
frozen-version guided live journey remain separate acceptance gates.
