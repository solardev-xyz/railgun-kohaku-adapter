# Private offline qualification recipes

This destination-only staging preserves **21 files / 6,171 lines** from Freedom `c6afd0432918d1258c1aafe11117f133cdd21ef4`: the relay wire and key recipes, their fixed data/pins/tests and two explicit Node CLI entries. [SOURCE-MAP.json](SOURCE-MAP.json) records original Git blob, SHA-256, mode and destination for every file. Their bytes, import topology, source pins, errors, guards and assertions are unchanged. Freedom originals remain present.

The sources live under `tools/qualification/scripts/`, outside the npm files list and public export map. They do not grant a module getter, arbitrary job route, key callback or application authority. They import no Freedom runtime module. The enclosing package version, dependencies and runtime entries are unchanged.

The wire CLI accepts `prepare`, `check` and `run`; the key CLI accepts `check` and `run`. Inputs remain explicit external source/tool roots and a pinned prepared build. Preserve original absolute-root validation, pre/post membership/hash checks, source-span selection, fresh-output admission, dependency-shadow refusal and build-manifest verification. `prepare` is source/build work, `check` verifies a retained build, and only admitted `run` executes the generated upstream fixture. Nothing auto-runs on import. No generated artifacts, installed dependency tree, engine/prover archives, real profiles or credentials are included here. The fixed data vectors are public synthetic fixtures, not permission to use a current account.

## Source test evidence

The unchanged three suites pass **133 tests** using existing cached Jest tooling. The first invocation mistakenly supplied an external `NODE_PATH`: the original guard refused it, producing 10 failures and 123 passes. Removing `NODE_PATH` and `NODE_OPTIONS` made all 133 pass without any source/assertion change. Both invocation log hashes are retained in [CHECKS.json](CHECKS.json). This is a distinct clean rerun, not relabeling the failed invocation.

From the package root, with existing Jest available and dependency-override environment variables unset:

```sh
npm test -- --runInBand --config '{"testMatch":["<rootDir>/tools/qualification/scripts/fixtures/railgun-relay-wire/*.test.js","<rootDir>/tools/qualification/scripts/fixtures/railgun-relay-keys/*.test.js"],"transform":{}}'
npm test -- --runInBand test/qualification-tool-sources.test.js
```

The additional parity tests check all 21 byte/Git-blob/mode joins and keep this tooling out of the public package surface. The original recipe suites exercise CLI import behavior, malformed input refusal, held preparation/source-drift controls and test-only marker/stub modules. No upstream crypto/proof or Electron campaign was executed; no dependencies were installed or upgraded.

## Remaining extraction

This is one small closed slice of the remaining Freedom tooling. Large native campaigns still bind the Freedom host's credential broker, context, profile/fence, storage, RPC/Tor, journal and original process lifecycle, and their source inventories need explicit successors. Their Railgun scenario internals can move into private repository tooling while thin Freedom acceptance drivers keep proving those host boundaries. Existing public evidence and original hashes must remain intact. Rebinding installed package source/fixture policies is separate from deleting a source copy or claiming a new native result.

The dedicated owner-test staging is also separate: its 151 staged suites and 17 fixtures do not mean all remaining qualification suites have moved or passed. This commit neither deletes Freedom sources nor adds a production testing API. A later real recipe run still requires its pinned external inputs and fresh output; no native readiness is implied by source staging.
