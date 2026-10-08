#!/usr/bin/env python3
"""Read-only closed removal metadata validation. There is no apply/delete mode."""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess

PREVIOUS_PLAN = 'ea5895799270a55387d0b2d7d01dae61797e4ccb35dbc1918747a7e279066fc3'
PREVIOUS_PROVENANCE = 'dd7e4ce74b258cdf0c339765dec315874a5a9c814dcc8e9098d6734cf5ac833a'
ORIGINAL_PACKAGE = 'c925fa8b9b509af46ba188ad2c87bbf36cfe10b0'
SOURCE = '65ec63615cda835da3f1e344b9fdc3bdcad9b771'
CLEANUP = 'b0ecd1657362e72c402e9c7e54df6fc4e1959301'
CURRENT_PACKAGE = '26bbbf09c8da2c4fbb78a5038025c0c38ad0f745'
E2E = 'test-e2e/kohaku-runtime.spec.js'
RETAINED_SHA256 = '0d131bf4b7fbb20b9a2521f1e238a791525e3a3a6850a6698b5af4114fe469ba'


def check(condition, detail):
    if not condition:
        raise ValueError(detail)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def relative(value):
    check(isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_./-]+', value), 'invalid relative path')
    path = pathlib.PurePosixPath(value)
    check(not path.is_absolute() and str(path) == value and '..' not in path.parts, 'unsafe relative path')
    return value


def blobs(root, revision, paths):
    check(re.fullmatch(r'[a-f0-9]{40}', revision), 'invalid revision')
    ordered = sorted({relative(path) for path in paths})
    if not ordered:
        return {}
    result = subprocess.run(
        ['git', 'cat-file', '--batch'], cwd=root,
        input=''.join(f'{revision}:{path}\n' for path in ordered).encode(),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
    ).stdout
    values, at = {}, 0
    for path in ordered:
        end = result.index(b'\n', at)
        header = result[at:end].split()
        check(len(header) == 3 and header[1] == b'blob', f'missing pinned blob: {path}')
        size = int(header[2])
        at = end + 1
        values[path] = result[at:at + size]
        at += size + 1
    check(at == len(result), 'unexpected Git object output')
    return values


def current_file(root, name):
    path = root / relative(name)
    for item in [path, *path.parents]:
        if item == root:
            break
        check(not item.is_symlink(), f'source symlink: {name}')
    check(path.is_file(), f'missing current source: {name}')
    return path.read_bytes()


def metadata(plan):
    check(plan['schema'] == 'freedom-railgun-closed-removal-v2', 'wrong schema')
    check(plan['deletionEnabled'] is False and plan['removalReady'] is False, 'deletion must remain disabled')
    check(plan['metadataClosed'] is True and plan['unresolvedPreservationRows'] == [], 'unclosed preservation')
    check(plan['previousPlanSha256'] == PREVIOUS_PLAN, 'wrong previous plan')
    check(plan['previousProvenanceSha256'] == PREVIOUS_PROVENANCE, 'wrong previous joins')
    check(plan['sourceCommit'] == SOURCE and plan['cleanupSourceCommit'] == CLEANUP, 'wrong source basis')
    check(plan['originalPackageCommit'] == ORIGINAL_PACKAGE, 'wrong original package basis')
    check(plan['resolvedPackageCommit'] == CURRENT_PACKAGE, 'wrong resolved package basis')
    actions = plan['actions']
    paths = [relative(row['path']) for row in actions]
    check(len(paths) == len(set(paths)) == 777, 'expected exactly777 distinct source files')
    check(paths.count(E2E) == 1, 'missing exact historical E2E')
    check(all(p.startswith(('src/', 'scripts/')) or p == E2E for p in paths), 'unexpected source scope')
    previous = [{'path': row['path'], 'provenance': row['originalProvenance']} for row in actions if row['path'] != E2E]
    check(digest(canonical(previous)) == PREVIOUS_PROVENANCE, 'original provenance changed')
    original = [m for row in actions for m in row['originalProvenance'] if m.get('destinationSha256')]
    resolved = [m for row in actions for m in row['resolvedProvenance']]
    check(len(original) == 799 and len(resolved) == 54, 'destination counts changed')
    check(plan['counts']['candidates'] == 777 and plan['counts']['originalDestinationJoins'] == 799, 'count metadata changed')
    check(plan['counts']['resolvedDestinationJoins'] == 54, 'resolved count metadata changed')
    retained = []
    for key, count in [('retainedSixScripts', 6), ('retainedEightCompositionFiles', 8), ('retainedCompositionAndIntegrationTests', 10)]:
        values = plan[key]
        check(len(values) == len(set(values)) == count, f'wrong protected list: {key}')
        retained.extend(relative(p) for p in values)
    check(len(set(retained)) == 24 and not set(retained).intersection(paths), 'protected file selected for removal')
    check(digest(canonical(retained)) == RETAINED_SHA256, 'protected membership changed')
    check(len(plan['originalUnresolved']) == 34, 'wrong original gap inventory')
    by_path = {row['path']: row for row in actions}
    for row in plan['originalUnresolved']:
        check(bool(by_path[row['path']]['resolvedProvenance']), f'former gap lacks successor: {row["path"]}')
    for row in actions:
        check(not row['disposition'].startswith('UNRESOLVED'), f'unresolved: {row["path"]}')
        check(row['originalProvenance'] or row['resolvedProvenance'], f'no preservation: {row["path"]}')
        for entry in row['originalProvenance'] + row['resolvedProvenance']:
            if entry.get('destinationSha256'):
                relative(entry['destination'])
                check(re.fullmatch(r'[a-f0-9]{64}', entry['destinationSha256']), 'invalid destination digest')
    check(plan['additionalRetainedHostFiles'] == ['test/railgun-qualification-archive.test.js'], 'wrong retained host successor')
    check(not set(plan['additionalRetainedHostFiles']).intersection(paths), 'retained successor selected for removal')
    host_joins = [entry for row in actions for entry in row.get('retainedHostProvenance', [])]
    check(len(host_joins) == 1 and plan['counts']['retainedHostSuccessorJoins'] == 1, 'wrong host successor count')
    check(host_joins[0]['destination'] == plan['additionalRetainedHostFiles'][0], 'wrong host successor destination')
    source_test = by_path['scripts/railgun-qualification-archive.test.js']
    check(host_joins[0]['destinationSha256'] == source_test['sourceSha256'], 'host test is not byte-exact')
    return actions, retained, original, resolved


def verify(plan, host, package):
    actions, retained, original, resolved = metadata(plan)
    paths = [row['path'] for row in actions]
    old_sources = blobs(host, SOURCE, paths)
    cleanup_sources = blobs(host, CLEANUP, paths + retained)
    old_targets = blobs(package, ORIGINAL_PACKAGE, [row['destination'] for row in original])
    current_targets = blobs(package, CURRENT_PACKAGE, [row['destination'] for row in resolved + plan['currentMappingInputs']])
    for row in actions:
        name = row['path']
        for data in [old_sources[name], cleanup_sources[name], current_file(host, name)]:
            check(digest(data) == row['sourceSha256'] and len(data) == row['bytes'], f'source content drift: {name}')
        data = old_sources[name]
        blob_id = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
        check(blob_id == row['sourceGitBlob'], f'source blob mismatch: {name}')
    for name in retained:
        current_file(host, name)  # Retained host edits are permitted; disappearance is not.
    for entries, target in [(original, old_targets), (resolved + plan['currentMappingInputs'], current_targets)]:
        for entry in entries:
            data = target[entry['destination']]
            check(digest(data) == entry['destinationSha256'], f'destination drift: {entry["destination"]}')
            if 'bytes' in entry:
                check(len(data) == entry['bytes'], f'destination size: {entry["destination"]}')
    for row in actions:
        for entry in row.get('retainedHostProvenance', []):
            data = current_file(host, entry['destination'])
            check(digest(data) == entry['destinationSha256'] and len(data) == entry['bytes'], 'retained host successor drift')
    for row in plan['scriptTestClassificationRows']:
        subject = row.get('primarySubject')
        if subject and row['classification'] == 'historical-only-after-subject-removal':
            check(subject['source'] in paths, f'historical subject not removed: {row["source"]}')
    return {'metadataValid': True, 'sourceFilesVerified': 777, 'sourceBasesVerified': 2,
            'currentWorktreeSourcesVerified': 777, 'originalDestinationJoinsVerified': 799,
            'resolvedDestinationJoinsVerified': 54, 'protectedFilesPresent': 24, 'additionalRetainedHostTestVerified': 1,
            'formerPreservationGapsResolved': 34, 'unresolvedPreservationRows': 0,
            'deletionPermitted': False, 'removalReady': False,
            'scope': 'Git objects and current source files only; external host coverage and post-cleanup acceptance remain conditional.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan', type=pathlib.Path)
    parser.add_argument('--host', type=pathlib.Path, required=True)
    parser.add_argument('--package', type=pathlib.Path, required=True)
    args = parser.parse_args()
    print(json.dumps(verify(json.loads(args.plan.read_text()), args.host.resolve(strict=True), args.package.resolve(strict=True)), indent=2))
