#!/usr/bin/env python3
"""Record only test-source deltas against the prior qualified58-suite commit."""
import difflib, hashlib, json, subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[1]
base = '63be312906329d4469749c0b3cb7f9c72060fe85'
sha = lambda text: hashlib.sha256(text.encode()).hexdigest()
manifest = json.loads((root/'docs/owners/test-staging/MANIFEST.json').read_text())
changes = []
for row in manifest['files']:
    name = row['destination']
    before = subprocess.check_output(['git', 'show', base+':'+name], cwd=root, text=True)
    after = (root/name).read_text()
    if before == after:
        continue
    left, right = before.splitlines(keepends=True), after.splitlines(keepends=True)
    starts = [0]
    for line in left:
        starts.append(starts[-1]+len(line.encode('utf-16-le'))//2)
    edits = [{'start': starts[a], 'before': ''.join(left[a:b]), 'after': ''.join(right[c:d])}
             for tag, a, b, c, d in difflib.SequenceMatcher(None, left, right, autojunk=False).get_opcodes()
             if tag != 'equal']
    changes.append({'file': name, 'beforeSha256': sha(before), 'afterSha256': sha(after),
                    'replacements': sorted(edits, key=lambda entry: entry['start'], reverse=True)})
assert len(changes) == 35
(root/'docs/owners/test-staging/CONTEXT-ADAPTATIONS.json').write_text(json.dumps({
    'baseRevision': base, 'productionTransforms': False,
    'scope': 'Fixed test-only genuine context composition; closed enum assertions; relocated complete capsule mock seam. Original assertions preserved by exact reversible deltas.',
    'changes': changes,
}, indent=2)+'\n')
print(json.dumps({'adaptedSuites': len(changes)}))
