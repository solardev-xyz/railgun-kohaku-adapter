# Independent adopter walkthrough — October 11, 2026

A separate reviewer followed the published installer and vault commands from a
fresh checkout at `d1040d9`, with isolated caches and physical locked dependencies.
The installer, interactive vault initialization, cold funding-address stability,
concurrent profile-lock refusal and reopening after a fixture process was killed
passed. This is an independent implementation review, not an external audit or
another organization adopting the package.

The review found one operational gap: the offline account fixture imported the
checkout's host. Testing the installed application required manually relocating
three imports. The tool now accepts `--app /absolute/installed/app`, and the
example README gives the direct Electron invocation, expected output, temporary
root rules and public fixture-password warning. The unmodified tool subsequently
created and cold-reopened an account against the reviewer's installed host with
identical account identity and zero connections. No wallet funds were involved.

INDEX.json pins that installed application and separates the reviewed walkthrough
from this tool fix. It does not claim that the later source candidate's runtime
was installed by the reviewer. Local paths and account identifiers are omitted.
The reviewer reused authenticated runtime archives and artifacts: fresh runtime
acquisition, Arti/Tor operation and live transactions were not repeated here.
Those have separate, version-specific records. The fixed fixture credentials
are public test values; these disposable accounts must never be funded.
