#!/usr/bin/env python3
"""Record repository-only host-test adaptations; never transform runtime source."""
import difflib, hashlib, json, subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[1]
base = '91e8445996947764fa278df855d0c4b29042ed65'
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
assert len(changes) == 6
(root/'docs/owners/test-staging/HOST-PURE-ADAPTATIONS.json').write_text(json.dumps({
    'baseRevision': base, 'productionTransforms': False,
    'scope': 'Six fixed import/pure-data tests; original assertions retained. Paged-store child gets fixed context bootstrap before private module load; selector asserts closed enum and scans actual package src.',
    'changes': changes,
}, indent=2)+'\n')
print(json.dumps({'adaptedFiles': len(changes)}))
