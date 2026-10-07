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
 # Root HMAC derivation moved to the pinned fixed credential host. All other
 # persistent domains, including child-purpose HMAC input, stay unchanged.
 if row['destination']=='src/owners/railgun-account-enrollment.js':
  expected=[s for s in expected if s!='Freedom Railgun account storage v1\0']
 assert actual==expected,(row['source'],set(expected)-set(actual),set(actual)-set(expected))
 rows.append({'source':row['source'],'destination':row['destination'],'literals':actual,'relocatedToCredentialHost':['Freedom Railgun account storage v1\0'] if row['destination']=='src/owners/railgun-account-enrollment.js' else []})
(root/'docs/owners/PERSISTED-LITERALS.json').write_text(json.dumps({'scope':'All Railgun/Freedom-prefixed static string literals, not a complete semantic persistence audit. Source tests reconstruct unchanged non-import source bytes too.','files':rows},indent=2)+'\n')
print(json.dumps({'files':len(files),'parseErrors':{k:v['syntaxDiagnostics'] for k,v in ast.items() if v['syntaxDiagnostics']},'persistedRows':len(rows)}))

capabilities={name:[] for name in ['credentials','signers','transactions','submitter']}
for file,item in ast.items():
 for family in item['hostFamilies']:
  if family in capabilities:capabilities[family].append(file)
expected={
 'credentials':['src/owners/credential-loan.js','src/owners/railgun-account-enrollment.js','src/owners/railgun-identity.js'],
 'signers':['src/owners/railgun-kohaku-plugin.js','src/owners/railgun-private-operation.js','src/owners/railgun-private-submission.js'],
 'transactions':['src/owners/railgun-private-submission.js','src/owners/railgun-shield-operation.js'],
 'submitter':['src/owners/railgun-kohaku-plugin.js','src/owners/railgun-private-submission.js','src/owners/railgun-shield-origin.js'],
}
assert capabilities==expected,(capabilities,expected)
(root/'docs/owners/HOST-CAPABILITIES.json').write_text(json.dumps({'scope':'Exact static imports of high-authority host families; not semantic whole-JavaScript authority proof. Dynamic or whole-family-object aliases refuse source parsing.','allowed':expected,'files':{file:sha((root/file).read_bytes()) for file in sorted(set(sum(expected.values(),[])))}},indent=2)+'\n')
