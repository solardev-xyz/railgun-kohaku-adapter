# Reference host foundation — October 10, 2026

This checkpoint covers the independent reference host in `examples/reference-wallet`,
not an installed reference application or an Alice-to-Bob payment. No funded
profile or external service was used. The example remains under development.

## Checks

- Adapter full suite before the final command/lifecycle additions: 283 suites,
  12,588 tests passed; no baseline exceptions in this environment.
- Final focused reference tests: 23 suites, 139 tests passed, including real local
  SOCKS/TLS fixture sockets, authenticated storage across fresh processes, and
  SQLite process exclusion. Tests retain disposable files for inspection.
- Owner declarations: TypeScript 5.9.2, four consumer programs, 50 negative
  controls, 20 host families. Source inventory unchanged: 248 package files.
- Parent repository ESLint configuration: no warnings/errors in the new example,
  conformance tools and reference tests. This package has no lint npm script.

## Native evidence

Electron 44.7.0, embedded Node 24.21.0, macOS arm64, unsigned development executable:

- The genuine package owner created a fresh account. While its account/storage
  worker remained open, a second process refused with `REFERENCE_PROFILE_BUSY`
  before vault access. After terminating the holder, cold reopening returned the
  same account identity. The rejecting local endpoint counted zero connections.
- The SQLite lock refused a contender while its holder's main thread was blocked.
  The holder survived; process death released its OS lock without stale-file
  takeover. The earlier Chromium ProcessSingleton experiment killed its blocked
  holder; the application therefore does not use that facility for custody.
- Uncaught exception and unhandled rejection probes exited promptly without a
  modal dialog. The exception probe recorded vault lock and proxy exit, and a
  subsequent process acquired the profile lock. No credentials were involved.
- Arti 2.6.0 accepted the generated local proxy configuration under an outbound-
  network-denied macOS sandbox. Its actual state-lock/read-only conflict messages
  are refused. Live bootstrap and circuit isolation were not exercised.

The preserved native tools restrict opening to their own marked disposable
roots. Runtime archives/artifacts were previously verified local inputs, not a
new reproducible build. The host implementation digest for the final account
create/contention/reopen check was
`6747fa660aaa3fd872bfa0fb6817b8e53f94ed90da482fb1e87c0c6947bff759`.

## Limits and next work

No proof, transfer, POI handoff, independent recipient or onward spend is proved
by this checkpoint. The scan prototype is not wired into the command entry; its
cursor inference will be replaced by authenticated owner recovery. Independent
installation, runtime acquisition, complete command flows and installed-tar
qualification remain to be completed. Linux/Windows lock behavior, network
filesystems, hostile same-user path replacement and simultaneous supervisor
failure are outside this evidence.
