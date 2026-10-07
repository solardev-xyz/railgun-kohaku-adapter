#!/usr/bin/env python3
"""Add the exact reviewed reverse closure without regenerating moved owners."""
import hashlib,json,os,posixpath,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
freedom=Path('/private/tmp/freedom-kernel-observers-oct8')
rev='c6afd0432918d1258c1aafe11117f133cdd21ef4'
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=freedom)
x=json.loads((root/'docs/owners/TRANSLATION.json').read_text())
imports=json.loads((root/'docs/owners/IMPORTS.json').read_text())
extra=json.loads((root/'docs/owners/REVERSE-ADDITIONS.json').read_text())
assert extra['sourceCommit']==rev and len(extra['additions'])==19
existing={r['source']:r['destination'] for r in x['files']}
assert not any(r['source'] in existing for r in extra['additions']), 'one-time additive stage only'
source={r['source']:git('show',rev+':'+r['source']).decode() for r in extra['additions']}
for r in extra['additions']:assert sha(source[r['source']].encode())==r['sha256']
mapping={**existing,**{p:'src/owners/'+posixpath.basename(p) for p in source}}
ast=json.loads(subprocess.check_output(['node',str(root/'tools/owner-source-ast.cjs')],input=json.dumps(source).encode(),env=os.environ))
hosts={'../networks/privacy-context':'context','../networks/private-rpc':'rpc','../networks/network-registry':'registry','./signers':'signers','./private-submission-journal':'submissionJournal','./privacy-session':'sessions','./private-transaction-network':'transactionNetwork'}
def target(p,request):
 if not request.startswith('.'):return None
 base=posixpath.normpath(posixpath.join(posixpath.dirname(p),request))
 return next((q for q in [base,base+'.js',base+'.json'] if q in mapping),None)
transitions=[]
for p,text in source.items():
 destination=mapping[p];edits=[]
 for edge in ast[p]['edges']:
  request=edge['request'];found=target(p,request);replacement=None;status='builtin-or-peer'
  if found:
   relative=posixpath.relpath(mapping[found],posixpath.dirname(destination));relative=relative if relative.startswith('.') else './'+relative
   replacement=json.dumps(relative);start,end=edge['start'],edge['end'];status='package-private'
  elif request in hosts:
   replacement="require('./context-bindings')" if hosts[request]=='context' else "require('./host-bindings')."+hosts[request]
   start,end=edge['callStart'],edge['callEnd'];status='fixed-host-family'
  elif request=='../identity-manager':
   replacement=json.dumps('./unbound/eoa-wallet-record-transition');start,end=edge['start'],edge['end'];status='fixed-submitter-transition-below'
  elif request.startswith('@freedom/railgun-kohaku-adapter'):
   sub=request.split('@freedom/railgun-kohaku-adapter',1)[1]
   mapped={'':'index.cjs','/read':'read.cjs','/host/data':'host-data.cjs','/host/poi':'host-poi.cjs','/host/execution':'host-execution.cjs'}[sub]
   replacement=json.dumps('../../'+mapped);start,end=edge['start'],edge['end'];status='same-package-instance'
  elif request.startswith('.'):raise ValueError((p,request))
  if replacement is not None:edits.append({'start':start,'end':end,'before':text[start:end],'after':replacement})
  imports['literalEdges'].append({'source':p,**edge,'status':status,'target':mapping.get(found),'hostFamily':hosts.get(request)})
 for edit in sorted(edits,key=lambda e:e['start'],reverse=True):text=text[:edit['start']]+edit['after']+text[edit['end']:]
 before=text;replacements=[]
 def replace(old,new):
  global text
  assert text.count(old)==1,(p,old)
  start=text.index(old);text=text[:start]+new+text[start+len(old):]
  replacements.append({'start':start,'before':old,'after':new})
 if p.endswith('/railgun-kohaku-plugin.js') or p.endswith('/railgun-shield-origin.js'):
  prefix='  ' if p.endswith('/railgun-kohaku-plugin.js') else ''
  replace(prefix+'const { getWalletRecord, WALLET_TYPES } = require("./unbound/eoa-wallet-record-transition");\n','')
  replace('  const record = getWalletRecord(0);',"  const record = require('./host-bindings').submitter.readMetadata();")
  replace('record.type === WALLET_TYPES.MNEMONIC',"record.type === 'mnemonic'")
  transitions.append({'file':destination,'beforeSha256':sha(before.encode()),'afterSha256':sha(text.encode()),'replacements':replacements})
 (root/destination).write_text(text)
 x['files'].append({'source':p,'sourceBlob':git('rev-parse',rev+':'+p).decode().strip(),'sourceSha256':sha(source[p].encode()),'destination':destination,'destinationSha256':sha(text.encode()),'disposition':'private owner staging','edits':edits,'sourcePersistedLiterals':ast[p]['literals']})
 assert not ast[p]['dynamic'],p
x['files'].sort(key=lambda r:r['source'])
(root/'docs/owners/TRANSLATION.json').write_text(json.dumps(x,indent=2)+'\n')
(root/'docs/owners/IMPORTS.json').write_text(json.dumps(imports,indent=2)+'\n')
(root/'docs/owners/REVERSE-TRANSITIONS.json').write_text(json.dumps({'sourceRevision':rev,'scope':'Only fixed public submitter metadata port; original local address/type checks remain.','changes':transitions},indent=2)+'\n')
print(json.dumps({'added':len(source),'files':len(x['files']),'literalEdges':len(imports['literalEdges'])}))
