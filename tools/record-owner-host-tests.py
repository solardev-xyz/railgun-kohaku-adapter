#!/usr/bin/env python3
"""Record repository-only host-test adaptations; never transform runtime source."""
import difflib, hashlib, json, subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[1]
base = '197219144e806474af7eef1987f24a8db978b311'
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
assert len(changes) == 11
(root/'docs/owners/test-staging/HOST-ADAPTATIONS.json').write_text(json.dumps({
    'baseRevision': base, 'productionTransforms': False,
    'scope': 'Fixed genuine context and exact generic-host storage fixtures; original test bodies retained. Historical reader keeps original source hash plus added executed-copy hash.',
    'changes': changes,
}, indent=2)+'\n')
print(json.dumps({'adaptedFiles': len(changes)}))
