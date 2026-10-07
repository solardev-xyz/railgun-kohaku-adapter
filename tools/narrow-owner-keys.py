#!/usr/bin/env python3
"""Private same-instance enrollment methods; no new package export."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
changes=[]
def apply(path, replacements):
 text=path.read_text();before=text;edits=[]
 for old,new in replacements:
  assert text.count(old)==1,(path,old[:70],text.count(old))
  edits.append({'start':text.index(old),'before':old,'after':new})
  text=text.replace(old,new,1)
 path.write_text(text)
 changes.append({'file':str(path.relative_to(root)),'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),'afterSha256':hashlib.sha256(text.encode()).hexdigest(),'replacements':edits})
p=root/'src/owners/railgun-account-enrollment.js';text=p.read_text()
start=text.index('    // Trusted host composition only.')
end=text.index('    getContext(role, operation)',start)
methods=text[start:end]
names=['PublicKeys','PublicCatalogKey','PublicGenerationKeys','TxidGenerationKeys','GenerationKeys']
functions=''
for name in names:
 functions+='function withRailgunEnrollment'+name+'(enrollment, ...args) {\n  const methods = keyMethods.get(enrollment);\n  check(methods);\n  return methods.with'+name+'(...args);\n}\n'
apply(p,[(methods,''),('  credentialOwners = new WeakMap(),','  credentialOwners = new WeakMap(),\n  keyMethods = new WeakMap(),'),('  instances.add(instance);','  keyMethods.set(instance, Object.freeze({\n'+methods+'  }));\n  instances.add(instance);'),('module.exports = {',functions+'module.exports = {\n'+''.join('  withRailgunEnrollment'+n+',\n' for n in names))])
for name in ['railgun-account-store.js','railgun-account-public.js','railgun-account-wallet.js']:
 p=root/'src/owners'/name;text=p.read_text();replacements=[];used=[]
 for n in names:
  old='enrollment.with'+n+'('
  if old in text:
   assert text.count(old)==1
   used.append('withRailgunEnrollment'+n)
   suffix='' if text[text.index(old)+len(old):].startswith('\n') else ' '
   replacements.append((old,'withRailgunEnrollment'+n+'(enrollment,'+suffix))
 assert used,name
 first=text.splitlines(keepends=True)[0]
 replacements.append((first,"const { "+', '.join(used)+" } = require('./railgun-account-enrollment');\n"+first))
 apply(p,replacements)
(root/'docs/owners/KEY-NARROWING.json').write_text(json.dumps({'schema':'railgun-owner-private-key-narrowing-v1','changes':changes},indent=2)+'\n')
