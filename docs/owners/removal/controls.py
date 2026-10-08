#!/usr/bin/env python3
"""Bounded negative controls for the read-only verifier; no application imports."""
import argparse
import copy
import importlib.util
import json
import pathlib
import sys
sys.dont_write_bytecode = True
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('closed_removal_verifier', pathlib.Path(__file__).with_name('verify.py'))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


def run(plan, host, package):
    observed = []
    def rejects(name, change, full=False):
        value = copy.deepcopy(plan)
        change(value)
        try:
            verifier.verify(value, host, package) if full else verifier.metadata(value)
        except ValueError:
            observed.append(name)
            return
        raise RuntimeError('control did not refuse: ' + name)

    rejects('deletion-flag', lambda p: p.update(deletionEnabled=True))
    rejects('missing-e2e', lambda p: p['actions'].pop())
    rejects('old-join-drift', lambda p: p['actions'][0]['originalProvenance'][0].update(destinationSha256='0' * 64))
    rejects('protected-membership-substitution', lambda p: p['retainedSixScripts'].__setitem__(0, 'scripts/other.js'))
    rejects('protected-removal-inclusion', lambda p: p['actions'][0].update(path=p['retainedSixScripts'][0]))
    def new_join(plan):
        return next(row['resolvedProvenance'][0] for row in plan['actions'] if row['resolvedProvenance'])
    rejects('new-join-traversal', lambda p: new_join(p).update(destination='../outside.js'))
    rejects('new-join-content-drift', lambda p: new_join(p).update(destinationSha256='0' * 64), True)
    rejects('source-content-drift', lambda p: p['actions'][0].update(sourceSha256='0' * 64), True)
    rejects('wrong-original-package', lambda p: p.update(originalPackageCommit='0' * 40))
    with patch.object(pathlib.Path, 'is_symlink', return_value=True):
        try:
            verifier.current_file(host, plan['actions'][0]['path'])
        except ValueError:
            observed.append('source-symlink')
        else:
            raise RuntimeError('source symlink control did not refuse')
    with patch.object(pathlib.Path, 'is_symlink', return_value=False), patch.object(pathlib.Path, 'is_file', return_value=False):
        try:
            verifier.current_file(host, verifier.E2E)
        except ValueError:
            observed.append('missing-current-e2e')
        else:
            raise RuntimeError('missing E2E control did not refuse')
    return {'controlsPassed': len(observed), 'controls': observed, 'deletionPermitted': False,
            'scope': 'Metadata/content mutations and explicit filesystem predicate doubles; no source writes or target runtime imports.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan', type=pathlib.Path)
    parser.add_argument('--host', type=pathlib.Path, required=True)
    parser.add_argument('--package', type=pathlib.Path, required=True)
    args = parser.parse_args()
    print(json.dumps(run(json.loads(args.plan.read_text()), args.host.resolve(strict=True), args.package.resolve(strict=True)), indent=2))
