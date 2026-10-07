'use strict';
// Type checks for the declarations in types/. TypeScript is not a dependency of
// this package: TYPESCRIPT_PATH must name an installed `typescript` package
// directory, or its lib/typescript.js. Programs are compiled, never emitted or run.
//
// - Portable: consumer-cjs.cts, consumer-esm.mts and negative/* under strict
//   NodeNext, with no skipLibCheck, no paths and no ambient types. They import
//   the package by its own name and must load no file from node_modules.
// - Upstream bridge: upstream/* against the installed @kohaku-eth/plugins
//   0.0.1-alpha.16. Its published declarations import "~/host" and "~/shared"
//   and re-export "./base" without an extension, so NodeNext cannot load them.
//   The bridge uses Bundler resolution plus one "~/*" alias into that package's
//   dist/, and checks that only files inside that dist/ use the alias.
// - Controls: the bridge's positive program without that setup must fail
//   inside the upstream files with exactly the diagnostics recorded below.
//
// A negative program marks each expected diagnostic with a trailing
// "// expect TS<code>" comment on the line where the diagnostic starts. Every
// program must produce exactly its marked diagnostics and nothing else.
//
// Usage: TYPESCRIPT_PATH=<dir> npm run typecheck [-- --record <file.json>]
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HERE = __dirname;
const SELF = '@freedom/railgun-kohaku-adapter';
const UPSTREAM = '@kohaku-eth/plugins';
const UPSTREAM_VERSION = '0.0.1-alpha.16';
const UPSTREAM_DIR = path.join(ROOT, 'node_modules', '@kohaku-eth', 'plugins');
const UPSTREAM_DIST = path.join(UPSTREAM_DIR, 'dist');
const CONTRACTS = [
  'types/railgun-kohaku-snapshot-contract.d.ts',
  'types/railgun-kohaku-private-contract.d.ts',
  'types/railgun-kohaku-public-contract.d.ts',
];
const EXPORT_COUNT = 32; // five factories and 27 types

// Diagnostics of the bridge's positive program without the bridge setup.
const CONTROLS = {
  'nodenext-without-alias': [
    'node_modules/@kohaku-eth/plugins/dist/broadcaster/base.d.ts:1 TS2307',
    'node_modules/@kohaku-eth/plugins/dist/index.d.ts:1 TS2835',
    'node_modules/@kohaku-eth/plugins/dist/index.d.ts:2 TS2834',
    'node_modules/@kohaku-eth/plugins/dist/index.d.ts:3 TS2835',
    'node_modules/@kohaku-eth/plugins/dist/index.d.ts:4 TS2835',
    'test/types/upstream/conformance.ts:6 TS2305',
    // Consequences in the bridge program: the feature assertions no longer hold.
    'test/types/upstream/conformance.ts:59 TS2344',
    'test/types/upstream/conformance.ts:61 TS2344',
  ],
  'bundler-without-alias': [
    'node_modules/@kohaku-eth/plugins/dist/base.d.ts:1 TS2307',
    'node_modules/@kohaku-eth/plugins/dist/base.d.ts:2 TS2307',
    'node_modules/@kohaku-eth/plugins/dist/broadcaster/base.d.ts:1 TS2307',
    'node_modules/@kohaku-eth/plugins/dist/errors.d.ts:1 TS2307',
  ],
};

function fail(message) {
  console.error(`typecheck: ${message}`);
  process.exit(2);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function rel(file) {
  const relative = path.relative(ROOT, file);
  return relative.startsWith('..') ? file : relative.split(path.sep).join('/');
}

function loadCompiler() {
  const configured = process.env.TYPESCRIPT_PATH;
  if (!configured) {
    fail(
      'TYPESCRIPT_PATH is not set. Set it to an installed typescript package ' +
        'directory (or its lib/typescript.js). TypeScript is not a dependency of this package.'
    );
  }
  const resolved = path.resolve(configured);
  if (!fs.existsSync(resolved)) fail(`TYPESCRIPT_PATH does not exist: ${resolved}`);
  const entry = fs.statSync(resolved).isDirectory()
    ? path.join(resolved, 'lib', 'typescript.js')
    : resolved;
  if (!fs.existsSync(entry)) fail(`no lib/typescript.js under TYPESCRIPT_PATH: ${resolved}`);
  const ts = require(entry);
  if (typeof ts.createProgram !== 'function') fail(`not a TypeScript compiler: ${entry}`);
  // Records name the compiler relative to TYPESCRIPT_PATH, never a machine path.
  const recorded = entry === resolved ? '<TYPESCRIPT_PATH>' : '<TYPESCRIPT_PATH>/lib/typescript.js';
  return { ts, entry, recorded, sha256: sha256(fs.readFileSync(entry)) };
}

function parseArgs(argv) {
  const args = { record: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--record' && argv[i + 1]) args.record = path.resolve(argv[++i]);
    else fail(`unknown argument: ${argv[i]}`);
  }
  return args;
}

function listPrograms(dir, extensions) {
  return fs
    .readdirSync(dir)
    .filter((name) => extensions.some((extension) => name.endsWith(extension)))
    .sort()
    .map((name) => path.join(dir, name));
}

function expectedDiagnostics(file) {
  const expected = [];
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const marker = /\/\/ expect((?: TS\d+)+)\s*$/.exec(line);
      if (!marker) return;
      for (const code of marker[1].trim().split(' '))
        expected.push(`${rel(file)}:${index + 1} ${code}`);
    });
  return expected.sort();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { ts, entry, recorded, sha256: compilerSha256 } = loadCompiler();

  const portable = {
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    types: [],
  };
  const bundlerWithoutAlias = {
    ...portable,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const bridge = {
    ...bundlerWithoutAlias,
    paths: { '~/*': [path.join(UPSTREAM_DIST, '*')] },
  };

  const failures = [];
  const check = (label, ok, detail) => {
    if (!ok) failures.push(`${label}: ${detail}`);
    return ok;
  };

  function compile(files, options) {
    const program = ts.createProgram(files, options);
    const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
      const where = diagnostic.file
        ? `${rel(diagnostic.file.fileName)}:${
            diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
          }`
        : '<global>';
      const message = ts
        .flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        .split('\n')[0]
        .split(ROOT)
        .join('<root>');
      return { key: `${where} TS${diagnostic.code}`, message };
    });
    diagnostics.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return { program, diagnostics };
  }

  function runCase(campaign, file, options, expectedKeys) {
    const expected = [...expectedKeys].sort();
    const { program, diagnostics } = compile([file], options);
    const observed = diagnostics.map((diagnostic) => diagnostic.key);
    const pass = check(
      `${campaign} ${rel(file)}`,
      JSON.stringify(observed) === JSON.stringify(expected),
      `expected ${JSON.stringify(expected)}, observed ${JSON.stringify(diagnostics)}`
    );
    return { program, result: { file: rel(file), expected, diagnostics, pass } };
  }

  // Package resolution by name, per condition.
  const resolve = (name, from, options, mode) => {
    const resolved = ts.resolveModuleName(
      name,
      from,
      options,
      ts.sys,
      undefined,
      undefined,
      mode
    ).resolvedModule;
    return resolved
      ? {
          file: rel(resolved.resolvedFileName),
          package: resolved.packageId
            ? `${resolved.packageId.name}@${resolved.packageId.version}`
            : null,
        }
      : null;
  };
  const resolution = {
    portableRequire: resolve(
      SELF,
      path.join(HERE, 'consumer-cjs.cts'),
      portable,
      ts.ModuleKind.CommonJS
    ),
    portableImport: resolve(
      SELF,
      path.join(HERE, 'consumer-esm.mts'),
      portable,
      ts.ModuleKind.ESNext
    ),
    bridgeSelf: resolve(SELF, path.join(HERE, 'upstream', 'conformance.ts'), bridge),
    bridgeUpstream: resolve(UPSTREAM, path.join(HERE, 'upstream', 'conformance.ts'), bridge),
    bridgeBroadcaster: resolve(
      `${UPSTREAM}/broadcaster`,
      path.join(HERE, 'upstream', 'conformance.ts'),
      bridge
    ),
  };
  const expectedResolution = {
    portableRequire: 'types/index.d.ts',
    portableImport: 'types/index.d.mts',
    bridgeSelf: 'types/index.d.mts',
    bridgeUpstream: 'node_modules/@kohaku-eth/plugins/dist/index.d.ts',
    bridgeBroadcaster: 'node_modules/@kohaku-eth/plugins/dist/broadcaster/base.d.ts',
  };
  for (const [key, file] of Object.entries(expectedResolution)) {
    check(
      `resolution ${key}`,
      resolution[key] && resolution[key].file === file,
      JSON.stringify(resolution[key])
    );
  }
  check(
    'resolution upstream version',
    resolution.bridgeUpstream &&
      resolution.bridgeUpstream.package === `${UPSTREAM}@${UPSTREAM_VERSION}`,
    JSON.stringify(resolution.bridgeUpstream)
  );

  // Portable campaign.
  const positives = [path.join(HERE, 'consumer-cjs.cts'), path.join(HERE, 'consumer-esm.mts')];
  const negatives = listPrograms(path.join(HERE, 'negative'), ['.cts', '.mts', '.ts']);
  const portableResults = [];
  let entryProgram = null;
  for (const file of [...positives, ...negatives]) {
    const expected = positives.includes(file) ? [] : expectedDiagnostics(file);
    if (!positives.includes(file))
      check(`negative ${rel(file)}`, expected.length > 0, 'no expect markers');
    const { program, result } = runCase('portable', file, portable, expected);
    const external = program
      .getSourceFiles()
      .map((sourceFile) => sourceFile.fileName)
      .filter((name) => name.startsWith(path.join(ROOT, 'node_modules') + path.sep));
    result.nodeModulesFiles = external.map(rel);
    check(`portable ${rel(file)} self-contained`, external.length === 0, external.join(', '));
    portableResults.push(result);
    if (file === positives[0]) entryProgram = program;
  }

  // Both entries export the same 32 names with one declaration identity each.
  const checker = entryProgram.getTypeChecker();
  const entryExports = (relative) => {
    const sourceFile = entryProgram.getSourceFile(path.join(ROOT, relative));
    if (!sourceFile) return new Map();
    const symbols = checker.getExportsOfModule(checker.getSymbolAtLocation(sourceFile));
    return new Map(
      symbols.map((symbol) => [
        symbol.getName(),
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol,
      ])
    );
  };
  const cjsExports = entryExports('types/index.d.ts');
  const esmExports = entryExports('types/index.d.mts');
  const names = [...cjsExports.keys()].sort();
  const parity = {
    count: names.length,
    sameNames: JSON.stringify(names) === JSON.stringify([...esmExports.keys()].sort()),
    sameIdentity: names.every((name) => cjsExports.get(name) === esmExports.get(name)),
    declaredIn: [
      ...new Set(
        names.flatMap((name) =>
          (cjsExports.get(name).declarations || []).map((declaration) =>
            rel(declaration.getSourceFile().fileName)
          )
        )
      ),
    ].sort(),
    names,
  };
  check('exports count', parity.count === EXPORT_COUNT, String(parity.count));
  check('exports names', parity.sameNames, 'index.d.ts and index.d.mts differ');
  check('exports identity', parity.sameIdentity, 'an export has two declaration identities');
  check(
    'exports origin',
    JSON.stringify(parity.declaredIn) === JSON.stringify([...CONTRACTS].sort()),
    JSON.stringify(parity.declaredIn)
  );

  // Upstream bridge.
  const upstreamManifest = JSON.parse(
    fs.readFileSync(path.join(UPSTREAM_DIR, 'package.json'), 'utf8')
  );
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const locked = lock.packages['node_modules/@kohaku-eth/plugins'] || {};
  check(
    'upstream version',
    upstreamManifest.version === UPSTREAM_VERSION,
    upstreamManifest.version
  );
  const bridgeResults = [];
  const aliasUses = [];
  const bridgeFiles = listPrograms(path.join(HERE, 'upstream'), ['.ts']);
  for (const file of bridgeFiles) {
    const { program, result } = runCase('bridge', file, bridge, expectedDiagnostics(file));
    for (const sourceFile of program.getSourceFiles()) {
      for (const imported of ts.preProcessFile(sourceFile.text, true, true).importedFiles) {
        if (!imported.fileName.startsWith('~/')) continue;
        const target = ts.resolveModuleName(
          imported.fileName,
          sourceFile.fileName,
          bridge,
          ts.sys
        ).resolvedModule;
        const use = {
          from: rel(sourceFile.fileName),
          specifier: imported.fileName,
          to: target ? rel(target.resolvedFileName) : null,
        };
        if (!aliasUses.some((seen) => JSON.stringify(seen) === JSON.stringify(use)))
          aliasUses.push(use);
        check(
          'bridge alias bounded',
          sourceFile.fileName.startsWith(UPSTREAM_DIST + path.sep) &&
            target &&
            target.resolvedFileName.startsWith(UPSTREAM_DIST + path.sep),
          JSON.stringify(use)
        );
      }
    }
    result.loadedUpstreamFiles = program
      .getSourceFiles()
      .filter((sourceFile) => sourceFile.fileName.startsWith(UPSTREAM_DIR + path.sep)).length;
    bridgeResults.push(result);
  }
  aliasUses.sort((a, b) => (`${a.from} ${a.specifier}` < `${b.from} ${b.specifier}` ? -1 : 1));
  check('bridge alias used', aliasUses.length > 0, 'no alias use observed');

  // Controls: the bridge's positive program without the bridge setup.
  const conformance = path.join(HERE, 'upstream', 'conformance.ts');
  const controlResults = [
    { name: 'nodenext-without-alias', options: portable },
    { name: 'bundler-without-alias', options: bundlerWithoutAlias },
  ].map(({ name, options }) => ({
    name,
    ...runCase(`control ${name}`, conformance, options, CONTROLS[name]).result,
  }));

  const upstreamDeclarations = {};
  for (const file of listDeclarations(UPSTREAM_DIST)) {
    upstreamDeclarations[rel(file)] = sha256(fs.readFileSync(file));
  }
  const shipped = {};
  for (const name of fs.readdirSync(path.join(ROOT, 'types')).sort()) {
    shipped[`types/${name}`] = sha256(fs.readFileSync(path.join(ROOT, 'types', name)));
  }

  const describeOptions = (options) => {
    const described = { ...options };
    described.module = ts.ModuleKind[options.module];
    described.moduleResolution = ts.ModuleResolutionKind[options.moduleResolution];
    described.target = ts.ScriptTarget[options.target];
    if (options.paths) described.paths = { '~/*': [`${rel(UPSTREAM_DIST)}/*`] };
    return described;
  };
  const record = {
    compiler: { version: ts.version, path: recorded, sha256: compilerSha256 },
    node: process.version,
    options: {
      portable: describeOptions(portable),
      bridge: describeOptions(bridge),
      bundlerWithoutAlias: describeOptions(bundlerWithoutAlias),
    },
    defaultLib: path.basename(ts.getDefaultLibFilePath(portable)),
    shippedDeclarations: shipped,
    resolution,
    exports: parity,
    portable: portableResults,
    upstream: {
      package: `${UPSTREAM}@${upstreamManifest.version}`,
      lockfileIntegrity: locked.integrity || null,
      declarations: upstreamDeclarations,
      aliasUses,
      results: bridgeResults,
    },
    controls: controlResults,
    failures,
  };

  const negativeCount = portableResults.filter((result) => result.expected.length > 0).length;
  const bridgeNegatives = bridgeResults.filter((result) => result.expected.length > 0).length;
  console.log(`TypeScript ${ts.version} (${entry}, sha256 ${compilerSha256})`);
  console.log(
    `portable: ${positives.length} positive, ${negativeCount} negative programs; ` +
      `bridge: ${bridgeResults.length - bridgeNegatives} positive, ${bridgeNegatives} negative; ` +
      `controls: ${controlResults.length}; exports: ${parity.count}`
  );
  if (args.record) {
    fs.writeFileSync(args.record, JSON.stringify(record, null, 2) + '\n');
    console.log(`record written to ${rel(args.record)}`);
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log('all type checks passed');
}

function listDeclarations(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? listDeclarations(path.join(dir, entry.name))
        : entry.name.endsWith('.d.ts')
          ? [path.join(dir, entry.name)]
          : []
    )
    .sort();
}

main();
