"use strict";
const fs = require("fs"),
  path = require("path"),
  { createHash } = require("crypto");
const root = path.join(__dirname, "..");
const processTransitions = require("../docs/owners/PROCESS-TRANSITIONS.json");
const poiReproofTransitions = require("../docs/owners/POI-REPROOF-TRANSITIONS.json");
const walletDrainTransitions = require("../docs/owners/WALLET-DRAIN-TRANSITIONS.json");
const provenance = require("../docs/execution/PROVENANCE.json");
const sha = (value) => createHash("sha256").update(value).digest("hex");
function originalKernelText(file) {
  let text = fs.readFileSync(path.join(root, file), "utf8");
  const drainage = walletDrainTransitions.changes.find(
    (change) => change.file === file,
  );
  if (drainage) {
    expect(sha(text)).toBe(drainage.afterSha256);
    for (const edit of [...drainage.replacements].reverse()) {
      expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(
        edit.after,
      );
      text =
        text.slice(0, edit.start) +
        edit.before +
        text.slice(edit.start + edit.after.length);
    }
    expect(sha(text)).toBe(drainage.beforeSha256);
  }
  // The newer reviewed phase (current POI_3x3 artifact pins) is undone first.
  const reproof = poiReproofTransitions.changes.find(
    (change) => change.file === file,
  );
  if (reproof) {
    expect(sha(text)).toBe(reproof.afterSha256);
    for (const edit of [...reproof.replacements].reverse()) {
      expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(
        edit.after,
      );
      text =
        text.slice(0, edit.start) +
        edit.before +
        text.slice(edit.start + edit.after.length);
    }
    expect(sha(text)).toBe(reproof.beforeSha256);
  }
  const transition = processTransitions.changes.find(
    (change) => change.file === file,
  );
  if (transition) {
    expect(sha(text)).toBe(transition.afterSha256);
    for (const edit of [...transition.replacements].reverse()) {
      expect(text.slice(edit.start, edit.start + edit.after.length)).toBe(
        edit.after,
      );
      text =
        text.slice(0, edit.start) +
        edit.before +
        text.slice(edit.start + edit.after.length);
    }
    expect(sha(text)).toBe(transition.beforeSha256);
  }
  return text;
}
test("all 40 source dispositions and every new kernel destination are pinned", () => {
  expect(provenance.sourceRevision).toBe(
    "a146331f63276ea5cbb90ef723195b65bc29e458",
  );
  expect(provenance.files).toHaveLength(40);
  expect(new Set(provenance.files.map((row) => row.source)).size).toBe(40);
  for (const row of provenance.files) {
    expect(row.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sha(originalKernelText(row.destination))).toBe(row.sha256);
  }
  for (const [file, hash] of Object.entries(provenance.additionalKernelFiles)) {
    const text = originalKernelText(file);
    expect(sha(text)).toBe(hash);
  }
});
test("fixed local imports resolve inside the package, without Freedom paths or duplicate shared cores", () => {
  const directory = path.join(root, "src/execution");
  for (const file of fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".js"))) {
    const content = fs.readFileSync(path.join(directory, file), "utf8");
    expect(content).not.toMatch(
      /require\(['"](?:.*src\/main\/|\.\.\/networks\/|\.\/privacy-artifacts)/,
    );
    for (const match of content.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      if (!match[1].startsWith(".")) continue;
      const resolved = require.resolve(path.resolve(directory, match[1]));
      expect(resolved.startsWith(root + path.sep)).toBe(true);
    }
  }
  for (const row of provenance.files.filter(
    (item) => item.disposition === "existing shared core",
  )) {
    if (!row.destination.startsWith("src/data/")) continue;
    expect(
      fs.existsSync(path.join(directory, path.basename(row.destination))),
    ).toBe(false);
  }
});

test("staged duplicates pin all 40 integration sources and only the six reviewed data-wrapper changes", () => {
  expect(provenance.freedomIntegrationBasis.revision).toBe(
    "0f2616b28062d5b107a361bfa0e9fdb876f8def9",
  );
  const changed = [];
  for (const row of provenance.files) {
    expect(row.integrationSourceSha256).toMatch(/^[0-9a-f]{64}$/);
    if (row.integrationSourceSha256 !== row.sourceSha256) {
      expect(row.integrationSourceChange).toBe("existing .3/.4 data wrapper");
      expect(row.disposition).toBe("existing shared core");
      changed.push(path.basename(row.source));
    } else
      expect(row.integrationSourceChange).toBe(
        "unchanged from extraction source",
      );
  }
  expect(changed.sort()).toEqual([
    "railgun-owned-poi-records.js",
    "railgun-poi-records.js",
    "railgun-private-destination.js",
    "railgun-private-preparation.js",
    "railgun-private-recovery-data.js",
    "railgun-private-signature.js",
  ]);
  expect(
    provenance.files.find((row) => row.source.endsWith("/railgun-artifacts.js"))
      .disposition,
  ).toContain("explicit E2");
});
