#!/usr/bin/env python3
"""Record the bounded semantic transition against the reviewed capsule fix.
No source generation, imports, runtime work or secret material is performed.
"""
import difflib,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base='3515cc9'
def sha(value):return hashlib.sha256(value.encode()).hexdigest()
rows=[]
for name in ['railgun-identity.js','railgun-account-enrollment.js','railgun-private-submission.js']:
 file='src/owners/'+name
 before=subprocess.check_output(['git','show',base+':'+file],cwd=root,text=True)
 after=(root/file).read_text()
 edits=[]
 for tag,a,b,c,d in difflib.SequenceMatcher(None,before,after,autojunk=False).get_opcodes():
  if tag!='equal':edits.append({'start':a,'before':before[a:b],'after':after[c:d]})
 edits.sort(key=lambda x:x['start'],reverse=True)
 rows.append({'file':file,'beforeSha256':sha(before),'afterSha256':sha(after),'replacements':edits})
(root/'docs/owners/CREDENTIAL-TRANSITIONS.json').write_text(json.dumps({'baseRevision':subprocess.check_output(['git','rev-parse',base],cwd=root,text=True).strip(),'changes':rows},indent=2)+'\n')
