#!/usr/bin/env python3
"""Separate reversible policy rebinding over the exact reviewed merged source."""
import difflib,hashlib,json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base='59c50995c6e2b555f4f217deccf9a234ea018db1'
def sha(text):return hashlib.sha256(text.encode()).hexdigest()
rows=[]
files=['src/owners/railgun-'+name+'-policy.js' for name in ['wallet','public','txid']]
for file in files:
 before=subprocess.check_output(['git','show',base+':'+file],cwd=root,text=True)
 after=(root/file).read_text();left=before.splitlines(keepends=True);right=after.splitlines(keepends=True)
 starts=[0]
 for line in left:starts.append(starts[-1]+len(line))
 edits=[{'start':starts[a],'before':''.join(left[a:b]),'after':''.join(right[c:d])} for tag,a,b,c,d in difflib.SequenceMatcher(None,left,right,autojunk=False).get_opcodes() if tag!='equal']
 rows.append({'file':file,'beforeSha256':sha(before),'afterSha256':sha(after),'replacements':sorted(edits,key=lambda e:e['start'],reverse=True)})
(root/'docs/owners/POLICY-TRANSITIONS.json').write_text(json.dumps({'baseRevision':base,'label':'Conservative new cache-generation policies; existing domain/schema/binding strings and historical qualification limit retained. No encrypted store migration.','changes':rows},indent=2)+'\n')
files+=['src/owners/source-identity.js','src/owners/host-bindings.js']
ast=json.loads(subprocess.check_output(['node',str(root/'tools/owner-source-ast.cjs')],input=json.dumps({p:(root/p).read_text() for p in files}).encode(),env=os.environ))
(root/'docs/owners/POLICY-STAGED-IMPORTS.json').write_text(json.dumps(ast,indent=2)+'\n')
