#!/usr/bin/env python3
"""Record explicitly reviewed process/worker algorithm changes, not pure moves.
Reversible edits connect the staged source to its prior pinned implementation.
"""
import difflib,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base='31bd04dd4f1400832c145e039cdd7b5606a6faa3'
revision='f7da14e8d864a416444380cc99f2fa6c85102ff9'
rows=[]
for file in ['host-bootstrap.cjs','src/owners/railgun-process.js','src/owners/railgun-session-worker.js','src/owners/railgun-session-worker-entry.js']:
 before=subprocess.check_output(['git','show',base+':'+file],cwd=root,text=True)
 after=subprocess.check_output(['git','show',revision+':'+file],cwd=root,text=True)
 assert (root/file).read_text()==after
 assert len(before.encode('utf-16-le'))==2*len(before) and len(after.encode('utf-16-le'))==2*len(after)
 edits=[{'start':a,'before':before[a:b],'after':after[c:d]} for tag,a,b,c,d in difflib.SequenceMatcher(None,before,after,autojunk=False).get_opcodes() if tag!='equal']
 edits.sort(key=lambda x:x['start'],reverse=True)
 rows.append({'file':file,'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),'afterSha256':hashlib.sha256(after.encode()).hexdigest(),'replacements':edits})
(root/'docs/owners/PROCESS-TRANSITIONS.json').write_text(json.dumps({'baseRevision':base,'revision':revision,'label':'reviewed algorithm changes; not import-only relocation','changes':rows},indent=2)+'\n')
