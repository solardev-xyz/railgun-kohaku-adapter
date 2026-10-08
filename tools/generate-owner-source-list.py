#!/usr/bin/env python3
"""Build/review-time membership generation, never imported by runtime code.
Uses the tracked package tree and fixed root entry names, not a runtime walk.
Regenerate after source, bootstrap or export membership changes, before packing.
"""
import hashlib,json,subprocess,sys,re,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
roots=['data.cjs','data.mjs','host-bootstrap.cjs','host-data.cjs','host-data.mjs','host-execution.cjs','host-execution.mjs','host-journal-data.cjs','host-journal-data.mjs','host-owner-authority.cjs','host-owner-authority.mjs','host-owner-worker-bootstrap.cjs','host-poi.cjs','host-poi.mjs','index.cjs','index.mjs','read.cjs','read.mjs','package.json']
files=subprocess.check_output(['git','ls-files','--','src'],cwd=root,text=True).splitlines()
files=[p for p in files if p.endswith(('.js','.cjs','.mjs','.json'))]
files=sorted(set(files+roots+['src/owners/source-files.json','src/owners/source-identity.js']))
assert len(files)==len(set(files)) and len(files)<=1024
for file in files:
 assert re.fullmatch(r'[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*\.(?:js|cjs|mjs|json)',file),file
 if file!='src/owners/source-files.json':assert (root/file).is_file(),file
package=json.loads((root/'package.json').read_text())
def exports(value):
 if isinstance(value,str):
  if value.endswith(('.js','.cjs','.mjs','.json')):assert value.removeprefix('./') in files,value
 elif isinstance(value,dict):
  for child in value.values():exports(child)
 elif isinstance(value,list):
  for child in value:exports(child)
exports(package['exports']);exports(package['main'])
raw=(json.dumps(files,indent=2)+'\n').encode();digest=hashlib.sha256(raw).hexdigest()
source=root/'src/owners/source-identity.js';text=source.read_text()
pattern=r"const LIST_SHA256 = '(?:SOURCE_LIST_SHA256|[0-9a-f]{64})';"
updated,count=re.subn(pattern,"const LIST_SHA256 = '"+digest+"';",text)
assert count==1
if '--check' in sys.argv or '--check-packed' in sys.argv:
 assert (root/'src/owners/source-files.json').read_bytes()==raw
 assert updated==text
else:
 (root/'src/owners/source-files.json').write_bytes(raw);source.write_text(updated)
if '--check-packed' in sys.argv:
 # Publication/activation check. Inspect npm's actual whitelist without running
 # lifecycle scripts, installing a dependency or writing a tarball.
 with tempfile.TemporaryDirectory(prefix='railgun-pack-list-cache-') as cache:
  packed=json.loads(subprocess.check_output(['npm','pack','--dry-run','--json','--ignore-scripts','--cache',cache],cwd=root,text=True))
 assert len(packed)==1 and isinstance(packed[0]['files'],list),'pack-list-shape'
 names=[item['path'] for item in packed[0]['files']]
 assert len(names)==len(set(names)),'duplicate-packed-file'
 runtime=sorted(name for name in names if not name.startswith(('docs/','types/')) and name.endswith(('.js','.cjs','.mjs','.json')))
 assert runtime==files,json.dumps({'missingFromPack':sorted(set(files)-set(runtime)),'unlistedPackedRuntime':sorted(set(runtime)-set(files))})
print(json.dumps({'files':len(files),'listSha256':digest,'runtimeWalk':False,'stagedBootstrapEntries':['host-owner-authority.cjs','host-owner-worker-bootstrap.cjs']}))
