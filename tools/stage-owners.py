#!/usr/bin/env python3
"""One-way, explicit source staging. No target imports or dependency installs.
Review metadata is regenerated from immutable Git objects, never mutable main.
"""
import hashlib,json,os,posixpath,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FREEDOM=Path('/private/tmp/freedom-kernel-observers-oct8')
REV='c6afd0432918d1258c1aafe11117f133cdd21ef4'
BASE='714401ae4a6f18275829e297ef5856d305a820ae'
def git(*args): return subprocess.check_output(['git',*args],cwd=FREEDOM)
def sha(b): return hashlib.sha256(b).hexdigest()
paths=git('ls-tree','-r','--name-only',REV,'src/main').decode().splitlines()
original={p:git('show',REV+':'+p).decode() for p in paths if ('/railgun-' in p and p.endswith(('.js','.json')) and not p.endswith('.test.js'))}
def parse(contents):
 return json.loads(subprocess.check_output(['node',str(ROOT/'tools/owner-source-ast.cjs')],input=json.dumps(contents).encode(),env=os.environ))
ast=parse({p:s for p,s in original.items() if p.endswith('.js')})
graph=json.load(open('/private/tmp/railgun-owner-extraction-graph-oct8.json'))
seeds=set(graph['closure'])|{'src/main/wallet/'+name+'.js' for name in ['railgun-private-submission','railgun-shield-operation','railgun-shield-receive','railgun-poi-output-recovery','railgun-poi-cold-validation','railgun-session-worker-entry','railgun-process-entry']}
seeds.add('src/main/networks/railgun-host-provider.js')
def target(source,request):
 if not request.startswith('.'): return None
 base=posixpath.normpath(posixpath.join(posixpath.dirname(source),request))
 return next((p for p in [base,base+'.js',base+'.json'] if p in original),None)
selected=set();todo=sorted(seeds)
while todo:
 source=todo.pop()
 if source in selected:continue
 if source not in original:raise ValueError('Missing source '+source)
 selected.add(source)
 for edge in ast.get(source,{}).get('edges',[]):
  found=target(source,edge['request'])
  if found and found not in selected:todo.append(found)
# Reuse each existing issuer/data/job implementation, never duplicate it.
existing={}
for directory in ['src/data','src/execution','src']:
 for p in sorted((ROOT/directory).glob('railgun-*')):
  if p.is_file() and p.suffix in ['.js','.json']:
   existing.setdefault(p.name,p.relative_to(ROOT).as_posix())
# Most wrappers only re-export data. Capsule additionally binds the current
# engine/account/preparation; preserve the existing complete execution wrapper.
existing["railgun-private-capsule.js"] = "src/execution/railgun-private-capsule.js"
mapping={p:existing.get(posixpath.basename(p),'src/owners/'+posixpath.basename(p)) for p in sorted(selected)}
hosts={
 '../networks/privacy-context':'context','./privacy-artifacts':'artifacts',
 './privacy-storage':'storage','./privacy-session':'sessions',
 '../networks/private-rpc':'rpc','../networks/wallet-tor-transport':'transport',
 './private-transaction-intent':'transactionIntent','./private-transaction-network':'transactionNetwork',
 './private-submission-journal':'submissionJournal','./privacy-journal-retention':'journalRetention',
 './transaction-service':'transactions','./signers':'signers','../profile-resolver':'profiles',
 '../settings-store':'settings','../tor-manager':'tor',
}
# These require a semantic credential/custody or enum/worker transition, not a
# compatible-looking fallback. Missing private paths make the boundary explicit.
blocked={
 '../identity/privacy-keys':'./unbound/credential-lifetime',
 '../identity/vault':'./unbound/credential-session-transition',
 './privacy-profile-guard':'./unbound/storage-root-guard-transition',
 '@scure/bip39':'./unbound/storage-root-loan-transition',
 '../identity-manager':'./unbound/eoa-wallet-record-transition',
}
rows=[];edges=[];exceptions=[]
for source in sorted(selected):
 destination=mapping[source];text=original[source];changes=[];reused=not destination.startswith('src/owners/')
 if not reused:
  for edge in ast.get(source,{}).get('edges',[]):
   request=edge['request'];found=target(source,request); replacement=None;status='builtin-or-peer'
   assert text[edge['start']+1:edge['end']-1]==request,(source,edge)
   if found:
    mapped=mapping[found];relative=posixpath.relpath(mapped,posixpath.dirname(destination));relative=relative if relative.startswith('.') else './'+relative
    replacement=json.dumps(relative);start,end=edge['start'],edge['end'];status='package-private'
   elif request in hosts:
    replacement=("require('./context-bindings')" if hosts[request]=='context' else "require('./host-bindings')."+hosts[request]);start,end=edge['callStart'],edge['callEnd'];status='fixed-host-family'
   elif request in blocked:
    replacement=json.dumps(blocked[request]);start,end=edge['start'],edge['end'];status='activation-blocker'
   elif request.startswith('@freedom/railgun-kohaku-adapter'):
    sub=request.split('@freedom/railgun-kohaku-adapter',1)[1]
    dest={'':'index.cjs','/read':'read.cjs','/host/data':'host-data.cjs','/host/poi':'host-poi.cjs','/host/execution':'host-execution.cjs'}[sub]
    replacement=json.dumps('../../'+dest);start,end=edge['start'],edge['end'];status='same-package-instance'
   elif request.startswith('.'):
    status='unresolved-relative'
   if replacement is not None:
    changes.append({'start':start,'end':end,'before':text[start:end],'after':replacement})
   edges.append({'source':source,**edge,'status':status,'target':mapping.get(found), 'hostFamily':hosts.get(request)})
  for edit in sorted(changes,key=lambda x:x['start'],reverse=True):text=text[:edit['start']]+edit['after']+text[edit['end']:]
  output=ROOT/destination;output.parent.mkdir(parents=True,exist_ok=True);output.write_text(text)
 for entry in ast.get(source,{}).get('dynamic',[]):exceptions.append({'source':source,**entry,'disposition':'review-required; not executed or admitted by this staging'})
 rows.append({'source':source,'sourceBlob':git('rev-parse',REV+':'+source).decode().strip(),'sourceSha256':sha(original[source].encode()),'destination':destination,'disposition':'existing package implementation' if reused else 'private owner staging','edits':changes,'sourcePersistedLiterals':ast.get(source,{}).get('literals',[])})
(ROOT/'docs/owners/TRANSLATION.json').write_text(json.dumps({'sourceRevision':REV,'packageBase':BASE,'originalScc':graph['scc'],'seedCount':len(seeds),'files':rows},indent=2)+'\n')
(ROOT/'docs/owners/IMPORTS.json').write_text(json.dumps({'sourceRevision':REV,'literalEdges':edges,'dynamicExceptions':exceptions,'meaning':'Source parser inventory, not semantic execution coverage or dependency admission.'},indent=2)+'\n')
print(json.dumps({'selected':len(selected),'staged':sum(r['disposition']=='private owner staging' for r in rows),'reused':sum(r['disposition']=='existing package implementation' for r in rows),'edges':len(edges),'dynamic':len(exceptions),'unresolved':[(r['source'],r['request']) for r in edges if r['status']=='unresolved-relative']},indent=2))
