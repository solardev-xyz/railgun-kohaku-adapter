'use strict';
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict'),
  { createRequire } = require('module');
const { file, sha } = require('./inventory.cjs');
function write(name, value) {
  fs.writeFileSync(name, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
async function main() {
  assert.equal(process.type, 'browser');
  assert.equal(process.env.FREEDOM_RAILGUN_INSTALLED_OWNER_JOURNEY, '1');
  const [filename, expectedSha] = process.argv.slice(2);
  assert.ok(filename && expectedSha);
  const bytes = fs.readFileSync(filename);
  assert.equal(sha(bytes), expectedSha);
  const request = JSON.parse(bytes);
  assert.equal(request.schema, 'railgun-journey-request-v1');
  const hostRequire = createRequire(path.join(request.hostRoot, 'package.json'));
  const { app } = hostRequire('electron');
  for (const [name, expected] of Object.entries(request.recipeFiles))
    assert.deepEqual(file(name), expected);
  for (const [name, expected] of Object.entries(request.enginePins))
    assert.deepEqual(file(path.join(request.engineModules, name)), expected);
  let recipe;
  try {
    let previous, chainState;
    if (request.previous) {
      const reportBytes = fs.readFileSync(request.previous.report);
      assert.equal(sha(reportBytes), request.previous.reportSha256);
      previous = JSON.parse(reportBytes).scenario;
      const stateBytes = fs.readFileSync(request.previous.chainState);
      assert.equal(sha(stateBytes), request.previous.chainStateSha256);
      chainState = JSON.parse(stateBytes);
    }
    recipe = require('./journey-host.cjs');
    const publicBytes = fs.readFileSync(request.publicSource);
    assert.equal(sha(publicBytes), request.publicSourceSha256);
    const scenario = await recipe.execute({
      freedomRoot: request.hostRoot,
      directory: request.outputDirectory,
      profileDirectory: request.profileDirectory,
      sourceBytes: publicBytes,
      runtime: request.runtime,
      mode: request.mode,
      engineModules: request.engineModules,
      ...(request.previous ? { previous, chainState } : {}),
    });
    write(path.join(request.outputDirectory, 'report.json'), {
      schema: 'railgun-journey-native-v1',
      mode: request.mode,
      scenario,
    });
    app.exit(0);
  } catch (error) {
    try {
      const diagnostic = recipe?.failureDiagnostics(error);
      if (diagnostic) write(path.join(request.evidenceDirectory, 'failure-milestones.json'), diagnostic);
    } catch {
      /* Diagnostics cannot replace the original failure. */
    }
    // Public fixtures only; still record source frames and an error code,
    // never assertion values, payloads or the raw message.
    try {
      const stack = error?.stack;
      const frames =
        typeof stack === 'string'
          ? stack
              .split('\n')
              .filter((line) => /^\s+at /.test(line))
              .slice(0, 14)
          : [];
      write(path.join(request.evidenceDirectory, 'failure-frames.json'), {
        code: typeof error?.code === 'string' ? error.code : null,
        name: typeof error?.name === 'string' ? error.name : null,
        // Synthetic public-fixture harness only: a bounded development message.
        message: String(error?.message ?? '').slice(0, 240),
        frames,
      });
    } catch {
      /* Failure diagnostics cannot replace original termination. */
    }
    process.stderr.write('Installed owner journey scenario refused\n');
    app.exit(1);
  }
}
main().catch(() => {
  process.stderr.write('Installed owner journey entry refused\n');
  process.exitCode = 1;
});
