#!/usr/bin/env python3
import hashlib,json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
def sha(b):return hashlib.sha256(b).hexdigest()
x=json.loads((root/'docs/owners/TRANSLATION.json').read_text())
for row in x['files']:
 p=root/row['destination'];row['destinationSha256']=sha(p.read_bytes())
(root/'docs/owners/TRANSLATION.json').write_text(json.dumps(x,indent=2)+'\n')
files={str(p.relative_to(root)):p.read_text() for p in sorted((root/'src/owners').glob('*.js'))}
ast=json.loads(subprocess.check_output(['node',str(root/'tools/owner-source-ast.cjs')],input=json.dumps(files).encode(),env=os.environ))
(root/'docs/owners/STAGED-IMPORTS.json').write_text(json.dumps(ast,indent=2)+'\n')
# Exact source literals in every translated private file, including all schemas,
# record/floor/store names. No package-prefixed migration of persistent strings.
rows=[]
for row in x['files']:
 if not row['destination'].startswith('src/owners/'):continue
 expected=row['sourcePersistedLiterals'];actual=ast.get(row['destination'],{}).get('literals',[])
 assert actual==expected,(row['source'],set(expected)-set(actual),set(actual)-set(expected))
 rows.append({'source':row['source'],'destination':row['destination'],'literals':actual})
(root/'docs/owners/PERSISTED-LITERALS.json').write_text(json.dumps({'scope':'All Railgun/Freedom-prefixed static string literals, not a complete semantic persistence audit. Source tests reconstruct unchanged non-import source bytes too.','files':rows},indent=2)+'\n')
print(json.dumps({'files':len(files),'parseErrors':{k:v['syntaxDiagnostics'] for k,v in ast.items() if v['syntaxDiagnostics']},'persistedRows':len(rows)}))
