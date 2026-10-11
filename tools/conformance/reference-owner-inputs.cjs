"use strict";
const fs = require("node:fs"), path = require("node:path");
/** Explicit application selection, before creating any disposable state. This
 * selects trusted host code to test; it is not an attestation of that code. */
function parseOwnerInputs(input) {
  const args = [...input];
  let application = path.resolve(__dirname, "../../examples/reference-wallet");
  if (args[0] === "--app") {
    args.shift(); application = args.shift();
    if (typeof application !== "string" || !path.isAbsolute(application) ||
        path.resolve(application) !== application || fs.realpathSync(application) !== application ||
        !fs.lstatSync(application).isDirectory()) throw Error("Canonical installed application directory required");
    const manifest = JSON.parse(fs.readFileSync(path.join(application, "package.json"), "utf8"));
    if (manifest.name !== "railgun-kohaku-reference-wallet" ||
        !fs.existsSync(path.join(application, "node_modules/@freedom/railgun-kohaku-adapter/package.json")))
      throw Error("Installed reference application required");
  }
  if (args.length < 3 || args.length > 5 || args.some(value => value.startsWith("--")))
    throw Error("Usage: reference-owner.cjs [--app /installed/app] archive prover artifacts [mode [fixture-root]]");
  const [archive, proverArchive, artifactDirectory, mode = "initialize", priorRoot] = args;
  return { application, archive, proverArchive, artifactDirectory, mode, priorRoot };
}
module.exports = { parseOwnerInputs };
