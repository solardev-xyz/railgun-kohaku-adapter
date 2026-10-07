#!/usr/bin/env python3
"""Separate stable-owner pending signer behavior fix over reviewed merged source."""
import difflib,hashlib,json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base='8e41803c7d1efa79c5249f77c36a989208877db9'
def sha(text):return hashlib.sha256(text.encode()).hexdigest()
rows=[]
files=['src/owners/railgun-identity.js']
for file in files:
 before=subprocess.check_output(['git','show',base+':'+file],cwd=root,text=True)
 after=(root/file).read_text();left=before.splitlines(keepends=True);right=after.splitlines(keepends=True)
 starts=[0]
 for line in left:starts.append(starts[-1]+len(line))
 edits=[{'start':starts[a],'before':''.join(left[a:b]),'after':''.join(right[c:d])} for tag,a,b,c,d in difflib.SequenceMatcher(None,left,right,autojunk=False).get_opcodes() if tag!='equal']
 rows.append({'file':file,'beforeSha256':sha(before),'afterSha256':sha(after),'replacements':sorted(edits,key=lambda e:e['start'],reverse=True)})
(root/'docs/owners/SIGNER-LIFETIME-TRANSITIONS.json').write_text(json.dumps({'baseRevision':base,'label':'Behavior fix: stable-owner exclusion remains held by pending original signer closure, callbacks and host loans after identity close or vault replacement.','changes':rows},indent=2)+'\n')
ast=json.loads(subprocess.check_output(['node',str(root/'tools/owner-source-ast.cjs')],input=json.dumps({p:(root/p).read_text() for p in files}).encode(),env=os.environ))
(root/'docs/owners/SIGNER-LIFETIME-STAGED-IMPORTS.json').write_text(json.dumps(ast,indent=2)+'\n')
# Only the modified identity capability source and modified test get new pins;
# original fixture/source provenance and all allowlists remain unchanged.
p=root/'docs/owners/HOST-CAPABILITIES.json'
audit=json.loads(p.read_text());file=files[0]
audit['files'][file]=sha((root/file).read_text())
p.write_text(json.dumps(audit,indent=2)+'\n')
p=root/'docs/owners/CREDENTIAL-TEST-SOURCES.json';rows=json.loads(p.read_text())
for row in rows:
 if row['fixture']=='test/owner-identity-credentials.test.js':
  b=(root/row['fixture']).read_bytes();row['current']={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
p.write_text(json.dumps(rows,indent=2)+'\n')
