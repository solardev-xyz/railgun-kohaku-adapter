# Foreign recipient real-engine controls

This active repository-only suite preserves all four original Freedom tests and their assertions: genuine A/B/C descriptors; B receiving A's hidden-sender output while A sees only its sent record and C sees neither; event/capsule/creator mismatch refusal; and B's receiver-side input NPK matching the sender-side POI output, including refusal variants. The earlier task description's six-case count did not match the source. No cases are invented or omitted.

The job uses the current package's internal pure/execution modules plus the existing test-only hardened credential derivation fixture. It is not an exported job or application route. The public mnemonic is deliberately disposable; there is no vault, profile, network, signing, proof generation or broadcast. Real engine address decoding, note encryption/decryption, key agreement, wallet leaf classification, sender/receiver provenance and POI note reconstruction execute. The original archive-verifier Jest mock remains: this does **not** qualify ASAR admission, utility guards, an original child process or proof verification. `preflight.cjs` independently authenticates the full locked installed fixture inventory before any engine import.

The engine fixture lives at `tools/railgun-runtime-build/scripts/fixtures/railgun-engine`. It must already have a separately approved physical installation matching its committed lock and runtime integrity. This task physically copied the previously verified installation; it did not install dependencies. Normal package test tooling must also be installed from the existing lock. Run:

```sh
NODE_OPTIONS=--experimental-vm-modules npm test -- --config tools/qualification/foreign-recipient/jest.config.cjs --runInBand
node tools/qualification/foreign-recipient/check-provenance.cjs
```

The separate configuration prevents the normal package suite from silently requiring a large engine fixture or loading archived tests. There is no skip-if-missing path: missing/mismatched engine inputs fail preflight. The ESM VM flag is required by the existing dependency closure, not by a production configuration change.

`PROVENANCE.json` binds original Freedom commit, blobs and source hashes. `RESTORE.patch` reverses only the active copied source to the original bytes (including formatting); the original source remains byte exact in the historical tooling archive. The provenance control verifies both directions in disposable files and checks the four original test names/assertion count. Nothing here changes npm exports, package files or runtime authority. Freedom originals remain untouched pending the parent's separate cleanup review.

Freedom-authored source retains the repository MPL-2.0 license. Third-party engine dependencies keep their own licenses, including the mixed-license and historical advisory limitations documented in the runtime-build fixture README. Installed dependencies are ignored, never committed or shipped by this move.
