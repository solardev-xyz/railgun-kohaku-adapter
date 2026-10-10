# Shared host contracts — October 10, 2026

The adapter's reusable `tools/conformance/context.cjs` and `storage.cjs` checks
were run against the unmodified Freedom context and encrypted-storage primitives
at `eba426b2ec8c52b82300e23fa9283a99f9f2d630`. All returned assertions passed:
opaque scope ownership, permanent revocation, task limits/cancellation, rejection
of late results, real encrypted persistence, reopen, serialization and tamper
refusal. `FREEDOM.json` pins both host sources and both checker files.

The run used a new disposable directory and random storage key. The profile
inventory guard was an explicit public fixture with `assert` and `remember`
methods. This qualifies the context/storage primitive contract, not that guard,
a production vault, a rollback-resistant profile or an account operation. No
existing profile, vault, network, engine, signer or transaction was opened.

The reference host runs the same checkers in `test/reference-context.test.js`
and `test/reference-storage.test.js`. Its separate native custody/lifecycle and
[installed Alice-to-Bob evidence](../reference-alice-bob-synthetic-2026-10-10/README.md)
exercise the assembled reference host; they are not inferred from these small
primitive checks. Neither run establishes Tor circuit isolation or a platform
outside its recorded environment.

To apply the same checks to another host, import the checkers and pass its actual
context/storage implementations. Use a fresh, disposable directory and real
scope creation; explicitly identify any inventory/key-management seams. The
checkers preserve created files for inspection. See [the adoption guide](../../owners/ADOPTING.md).
