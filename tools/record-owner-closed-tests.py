#!/usr/bin/env python3
"""Record test-only adaptations without transforming any production source."""
import collections, difflib, hashlib, json, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base='372343e3521387bc70b10ccd04dfcff65ffebe8e'
sha=lambda text:hashlib.sha256(text.encode()).hexdigest()
manifest=json.loads((root/'docs/owners/test-staging/MANIFEST.json').read_text())
reasons={
 'railgun-account-fence.test.js':'Existing intentionally mocked optional SQLite dependency becomes a virtual Jest mock; actual SQLite is not exercised.',
 'railgun-own-poi-proof.test.js':'Fixed enum replaces filename/binaryKey caller authority; assert exact enum, absent legacy fields and private registry key eligibility.',
 'railgun-poi-submit-data.test.js':'Forbidden import canaries target actual package host/context/owner boundaries, preserving refusal on load.',
 'railgun-poi-reconstruct.test.js':'Translate previously missed literal jest.requireActual to same canonical execution capsule wrapper.',
 'railgun-poi-verify-job.test.js':'Test-only fixed context binding uses original copied genuine issuer; original artifact/crypto mocks and assertions retained.',
 'railgun-relay-proof-helpers.test.js':'Same copied genuine context issuer; source-text guards read current verifier/process/bootstrap paths, not retired generic entry.',
 'railgun-relay-signature-verify.test.js':'Assert fixed enum and absent legacy selectors plus fixed keyless registry admission.',
 'railgun-relay-quote-verify.test.js':'Assert fixed quote enum and absent legacy selectors plus fixed keyless registry admission.',
 'railgun-own-txid.test.js':'Fixed journalRetention port receives exact public c6 host validator fixture; installed-host acceptance remains separate.',
 'railgun-public-policy.test.js':'Authorized semantic successor: same-process immutable snapshot, fresh-process package/host change, unchanged domain/archive/floor. Source membership replaces obsolete13-file boundary count.',
 'railgun-txid-policy.test.js':'Authorized semantic successor: fresh-init checks all17 historical validators and original21 eager files; same-process stable snapshot, host digest change, exact binding/archive refusal. Explicit package membership replaces obsolete36/20 graph counts.'}
changes=[]
for row in manifest['files']:
 p=row['destination'];before=subprocess.check_output(['git','show',base+':'+p],cwd=root,text=True);after=(root/p).read_text()
 if before==after:continue
 assert Path(p).name in reasons,p
 left=before.splitlines(keepends=True);right=after.splitlines(keepends=True);starts=[0]
 for line in left:starts.append(starts[-1]+len(line.encode('utf-16-le'))//2)
 edits=[{'start':starts[a],'before':''.join(left[a:b]),'after':''.join(right[c:d])} for tag,a,b,c,d in difflib.SequenceMatcher(None,left,right,autojunk=False).get_opcodes() if tag!='equal']
 changes.append({'file':p,'beforeSha256':sha(before),'afterSha256':sha(after),'reason':reasons[Path(p).name],'replacements':sorted(edits,key=lambda x:x['start'],reverse=True)})
(root/'docs/owners/test-staging/CLOSED-ADAPTATIONS.json').write_text(json.dumps({'baseRevision':base,'productionBasis':'40ef9bda2a596262e143bc3f5616f8139e4bad61','productionTransforms':False,'changes':changes},indent=2)+'\n')
status=json.loads((root/'docs/owners/test-staging/STATUS.json').read_text())
translation={x['source']:x['destination'] for x in json.loads((root/'docs/owners/TRANSLATION.json').read_text())['files']}
port={'privacy-context':'context','privacy-storage':'storage','private-rpc':'rpc','wallet-tor-transport':'transport','private-transaction-network':'transactionNetwork','private-submission-journal':'submissionJournal','settings-store':'settings','tor-manager':'tor','network-registry':'registry','signers':'signers','transaction-service':'transactions','private-transaction-intent':'transactionIntent','privacy-session':'sessions','profile-resolver':'profiles','privacy-journal-retention':'journalRetention','vault':'credentials','derivation':'credentials','identity-manager':'submitter/credentials (test-specific exact needs remain)'}
entries=[]
for item in status['entries']:
 if item['status'] not in ['genuine host context initialization needed','host or adjacent-module composition needed']:continue
 row=next(x for x in manifest['files'] if x['destination']==item['destination']);gaps=[]
 for edge in item['unresolved']:
  target=edge.get('target');canonical=translation.get(target)
  gaps.append({**edge,'currentPackageTarget':canonical,'currentTargetExists':bool(canonical and (root/canonical).is_file()),'fixedHostFamily':port.get(Path(target or edge['value']).stem),'requirement':'Exact test import relocation and retained assertion/authority audit' if canonical else 'Compose genuine fixed host binding or faithful explicit test port; original host/private imports cannot become package API'})
 entries.append({'source':item['source'],'destination':item['destination'],'category':item['status'],'suiteExecuted':False,'sourceOrVmHarness':row['sourceOrVmHarness'],'directPrivateContextImport':row['hostContextImport'],'canonicalImports':row['imports'],'unresolved':gaps,'computedSites':item['computed'],'activationRequirement':'Context issuer/host port composition and original lifetime/authority assertions must be qualified; no broad aliasing, raw-key export or production getter'})
counts=collections.Counter(x['category'] for x in entries);assert counts=={'genuine host context initialization needed':35,'host or adjacent-module composition needed':58}
(root/'docs/owners/test-staging/REMAINING-GAPS.json').write_text(json.dumps({'productionBasis':'40ef9bda2a596262e143bc3f5616f8139e4bad61','scope':'Original35 context and58 host/import-gap categories; concrete literal sites plus computed exceptions, not semantic full closure','counts':dict(counts),'entries':entries},indent=2)+'\n')
print(json.dumps({'adaptedSuites':len(changes),'remaining':dict(counts)}))
