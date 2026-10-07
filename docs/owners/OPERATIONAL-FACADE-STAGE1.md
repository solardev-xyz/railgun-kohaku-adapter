# Private operational facade — first stage

Base: `8e41803c7d1efa79c5249f77c36a989208877db9`. This is a package-private source candidate. There is no package export, version change, installed-host activation or native qualification claim.

`src/owners/operational-facade.js` exports privately only `initializeRailgunMain({host,runtime})`. It invokes the existing one-shot trusted main bootstrap, captures exact archive/prover/artifact paths, and returns fixed `createAccount` / `openAccount` functions. Creation uses fresh cooperative enrollment; existing opening uses the existing authenticated marker/legacy behavior. Neither accepts paths to profiles, arbitrary policies, job names, owners, stores or key callbacks. Existing runtime loaders still authenticate the captured archive locations when used.

The account session exposes only `describe`, `advancePublic`, `openRead`, `openPrivate`, `openPublic`, `signal`, `closed` and `close`. The exact wallet cache choice is the existing active/advance/new/pending enum. Plugin lanes retain the original internal identity/enrollment/coordinator tuple and actual wallet account. The actual Kohaku plugin adopts that account and owns any staging replacement. The facade never exposes that tuple or the plugin itself.

Read methods forward fixed existing plugin methods. Private/public preparations wrap each exact original operation object in a private WeakMap. Consumption removes the handle before calling the existing fixed private broadcaster/public submitter. Foreign, cloned and reused handles refuse. Original read/submission promises and errors are preserved; callback functions go directly to the existing reviewed plugin gates. No new crypto, callback-approval or policy semantics are introduced.

An account/profile pair is excluded from duplicate facade admission while opening, live, closing or holding an unknown/rejected cleanup. Different account indices remain independent. A fake abort event is not cancellation. Original native promises are observed with locally owned settlement envelopes; species-selected return values cannot fake settlement. Close revokes existing resources promptly, retains late returned resources, and waits the opening barrier, outstanding method work and original cleanup promises. It cannot release exclusion merely because cancellation occurred or a timeout elapsed. Cleanup rejection remains a rejection and conservatively retains facade exclusion.

The narrow enrollment addition is private `observeRailgunEnrollmentClosure(enrollment)`. It uses genuine instance membership and returns the exact original root-loan closed promise, including after revocation. It never exposes bytes, stores or usable revoked authority, and is not a returned enrollment property. Failed enrollment opening now retains that original loan before rejecting, because no instance otherwise escapes for the facade to observe. Existing close remains synchronous revocation; marked-account fence retention still lasts until main process exit. A successful facade drain is not permission to bypass genuine same-process cooperative re-enrollment refusal. An observed credential-host rejection is preserved conservatively, not relabeled successful drain.

`FACADE-TRANSITIONS.json` records reversible enrollment edits against the exact base. Provenance tests undo those edits before checking earlier source and host-capability pins. Earlier historical maps remain unchanged. The new facade intentionally depends only on closed existing owner modules and captured host profile/application functions; it introduces no host-family extension.

## Validation and limits

- Full package `npm test -- --runInBand`: 58 suites, 1,892 tests passed.
- Strict changed-file ESLint, existing Freedom configuration, max warnings zero: passed. The package has no npm lint script; the cached tool was invoked explicitly.
- New/modified test and metadata formatting: passed. The existing mixed-format enrollment source was not broadly reformatted.
- Two distinguishing behavioral controls failed as required: remove failed-opener credential drainage; replace the prepublished opening barrier with an optional assignment-time check. Both original files were restored byte-for-byte afterward.
- Controlled facade tests preserve native original promise barriers and exercise late identity/enrollment/public/wallet returns, held and rejected drains, unrelated accounts, cancellation, species behavior, profile changes, strict option shapes, one-use operation identity and absence of exposed authority properties.
- Enrollment tests exercise the actual private credential loan and context fixture with disposable local storage. Facade owner modules are controlled test doubles; this does not claim real controller/account/native composition or installed-host success. No engine/prover archive, live profile, funded data, native process, network or new dependency was used.

## Explicit unfinished surface

Recovery companion, local relay and completed relay recovery lanes are not implemented or advertised here. Public cache rebuilding/resuming and a broader lifetime observer for any additional future lane also remain follow-up work. The initial public owner is new for creation and active for existing opening; explicit public rebuild is not silently selected on error. There is no renderer IPC, facade export/type declaration, package release, or generic module getter. The next review should assess this first-stage lifetime owner before adding recovery/relay lanes and an actual installed consumer composition test.
