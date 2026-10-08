# Earlier wrapper tests: active successors and historical API checks

The four removed Freedom modules `railgun-kohaku-{broadcaster,private-host,public-host,public-submitter}` are not reinstated and have no new public internal-module getter. Their exact c6 test sources remain under `docs/owners/historical-tests/`, bound by EARLIER-WRAPPER-ORIGINS.json. They used explicitly controlled plugin/registry doubles; this migration does not promote them to native or genuine engine evidence.

The current operational facade creates its own account owners and fixed private plugin. It accepts no borrowed account/plugin constructor parameter. It owns cleanup and original drains, exposes mode-specific frozen lanes, and keeps raw operations in a private WeakMap. The four historical wrapper constructors, wrapper-specific error codes, exact old constructor object layout and borrowed-owner non-cleanup assertions are consequently historical API checks. A separately constructed broadcaster/submitter does not exist at this boundary. Synchronous invalid-handle refusal is the current lane contract; an old wrapper's rejected-Promise form is not claimed unchanged. This is a semantic migration, not byte-equivalent execution of obsolete modules.

## Active checks

`test/owner-operational-facade.test.js` executes the actual current facade with explicit original-owner promise doubles. The new tests begin `wrapper successor`:

| Original assertions | Current active coverage |
| --- | --- |
| Public-host exact public-only frozen shape, original signal/closed; broadcaster/submitter fixed bound shape | `%s exact frozen shape and live receiver delegation` plus existing `closed one-shot initializer and exact account options expose no owner authority`; raw plugin construction is absent |
| Reads preserve receiver, arguments, original promise/result; private host uses the current plugin after account replacement | `%s exact frozen shape and live receiver delegation`; real plugin replacement behavior also remains in `Transact staging adopts replacement and old account abort does not abort instance` and `late local read cannot cross a completed Transact account replacement` |
| Transfer/full/partial unshield and optional Shield recipient forwarded; hidden empty frozen handle; returned operation cannot leak | `%s request and hidden original operation` (five cases); earlier private/public adapter suites retain amount and output-detachment semantics |
| Acknowledged/uncertain/recovery outcomes or original errors never flattened; exact original promise | `%s request and hidden original operation`, `preserves original rejection %s and burns handle`, existing `%s lane wraps and consumes exact original operations once`; actual plugin uncertainty cases below |
| Consume before synchronous throw/reentrant replay, no second invocation | `%s reserves consumption before synchronous throw and replay` |
| Foreign/copied/raw/private tokens cannot consume own handle or another instance's handle | `foreign account, copied and raw tokens do not consume own handle`; actual private plugin registry tests below |
| Submit ignores forged `this` and cannot invoke supplied transport getters | `%s request and hidden original operation`; exact extra-option refusal below |
| Idempotent reentrant close invalidates unused handles, late successful prepare never publishes handle | `%s reentrant close revokes handle and late preparation` |
| Preparation rejection remains original | `original preparation rejection is unchanged` |
| Outward failure may settle while original closure remains pending | `outward rejection and acknowledged result remain separate from original drain`; existing `abandoning a held plugin result does not release its original closed barrier` |
| Cleanup failure cannot replace acknowledged submission and original rejection is observed | `cleanup rejection cannot replace an acknowledged submission`; existing unknown/rejected closure controls retain account exclusion |
| Caller mode/host/ports/prover/artifacts/signer/controller override rejected before adoption | `caller %s refuses before plugin adoption`; existing `signal, profile, accessor and policy substitutions refuse before new owners` and actual plugin constructor controls |
| External plugin abort refuses unused submission/late preparation without pretending host.close caused it | `external plugin abort refuses unused handle and late preparation` |
| Old factory refusal/post-adoption secondary wrapper-construction failure | Secondary wrapper constructor is removed. Owning replacement checks are `public construction failure preserves original error and drains acquired owners`, `lane cancellation during wallet construction revokes original owners and drains late wallet`, `close during wallet open observes late wallet cleanup before releasing the account`, and rejected/unknown original cleanup controls. Borrowed-owner non-cleanup is obsolete because the current facade owns those acquired resources. |

`tools/owner-test-staging/tests/src/main/wallet/railgun-kohaku-plugin.test.js` remains active and tests the actual private plugin registry/controller with its original controlled dependencies. In particular: `read capability has no preparation/broadcaster and reads only current genuine view`, `private capability selects only current single-input transfer/unshield methods`, `public lane exposes only native Shield preparation and separate genuine submit helper`, `invalid constructor %s refuses before adoption`, `forged/copied/public operations cannot consume authentic prepared operation`, `cross-instance operation refuses without consuming the other instance`, `public tokens reject forgery/copy/private tokens and consume synchronously once`, `broadcaster closes/drains wallet before recovery, consumes once and preserves result`, uncertainty/recovery outcomes and original barrier failure controls. These cover the meaningful registry/mode/live-owner assertions that obsolete broadcaster/submitter tests modeled with a mock registry. No claim is made that a historical removed constructor is exercised.

## Earlier adapter name joins

Four earlier adapter suites have identical parsed assertion/function bodies after removing only loader first arguments, comments and formatting: private-adapter, public-adapter, read-data and read-dispatch. EARLIER-ADAPTER-AST-PARITY.json records the source audit; reversible EARLIER-ADAPTER-MIGRATIONS.json pins their exact original and current bytes. All four current suites run by default.

The fifth, snapshot-plugin, previously omitted the original check that the private plugin registry rejects a snapshot plugin. That check is restored against `src/owners/railgun-kohaku-plugin.js` in a VM with inert imports (the same isolation method as the original test, with the new fixed host binding import made inert). It does not initialize an owner or grant a genuine brand. Existing package snapshot bounds tests remain in addition to the original semantics.

## Qualification limits

The five adapter suites passed 263 tests. The facade suite passed 101 tests after adding these controls. A combined run of current facade, snapshot, private plugin and provenance also passed (recorded below). Strict external ESLint and `git diff --check` passed. No production source, package exports, dependency or native runtime changed. This accounts for these nine earlier suites; the separate eight relay-suite migration and full 31-row removal inventory are independent records, not inferred from this group.

Combined targeted result: 391 tests / 4 suites, natural exit 0. Original run artifacts are `/private/tmp/railgun-earlier-wrapper-final-a.{log,json}`; they are local validation records, not shipped runtime inputs.
