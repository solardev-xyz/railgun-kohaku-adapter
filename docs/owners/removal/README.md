# Closed preservation manifest — no deletion

`PLAN.json` is the successor to the frozen 776-row removal dry run. It adds the byte-exact historical `test-e2e/kohaku-runtime.spec.js` as row 777, resolves the original 34 preservation gaps, and retains the original 799 package destination joins against immutable `c925fa8`. The 54 new package joins use immutable `26bbbf09`; they do not silently replace or re-pin the older joins. The prior plan and canonical original provenance have fixed SHA-256 pins in the validator.

All 777 source bytes were verified against the original host `65ec636`, reviewed cleanup `b0ecd165`, and the still-present cleanup worktree. The six retained scripts, eight retained host runtime files and ten retained host tests are explicitly excluded from removal and must remain present. An additional byte-exact active host successor, `test/railgun-qualification-archive.test.js`, is verified separately against its old script source; it is **not** classified as historical-only. Its current worktree destination awaits the parent's atomic cleanup commit. Three retained credential fixture moves are separate from these 777 candidates.

The original 34 gaps are closed by current test/semantic mappings, exact wrapper archives, and the preserved historical Kohaku spike. This means preservation metadata is closed. It does not assert that obsolete campaign scripts, the alpha.30 E2E, or removed borrowed-owner wrapper APIs are equivalent to current package execution. Those distinctions are recorded per row and in the bound semantic mapping. The separate incoming-edge audit still determines whether every retained caller has been migrated.

## Read-only verification

Use checkouts that contain the pinned Git objects. Paths are supplied locally and never persisted in the manifest or verification output:

```sh
python3 docs/owners/removal/verify.py docs/owners/removal/PLAN.json \
  --host "$FREEDOM_CHECKOUT" --package "$RAILGUN_PACKAGE_CHECKOUT"
python3 docs/owners/removal/controls.py docs/owners/removal/PLAN.json \
  --host "$FREEDOM_CHECKOUT" --package "$RAILGUN_PACKAGE_CHECKOUT"
```

There is no apply/delete mode. The validator reads Git blobs and ordinary source files only. It does not import application modules or read runtime archives, profiles, credentials or network services. It intentionally fails after candidate source removal: it is a **pre-cleanup** review check, not a post-cleanup acceptance runner.

`VERIFICATION.json` records the successful actual read-only comparison. `CONTROLS.json` records 11 distinguishing negative controls, including missing E2E, old/new destination drift, source drift, protected membership, path traversal, symlink and deletion-flag refusal. The filesystem predicate controls are explicitly test doubles; successful source/hash comparisons use actual files and Git objects. No machine-specific absolute paths appear in this durable payload.

## Conditions remain

Deletion remains disabled and `removalReady` remains false. Before an authorized atomic cleanup, the parent must accept the full incoming-edge audit, complete and review the three retained-host coverage corrections listed in the manifest, and finish the pending retained CI/mixed-test/configuration changes. After cleanup, the parent must run the applicable source, lint, type, packaging and installed/native acceptance checks. This manifest does not manufacture those outcomes or authorize removal.

No runtime source, dependency, package export, version, retained host file or candidate file was changed by creating this package-side metadata. The source-only validation does not substitute for the separately recorded unit and native qualification.
