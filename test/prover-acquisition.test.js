'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('prover data acquisition refuses tampered input, archives and unsafe extraction', () => {
  const source = path.resolve(__dirname, '../tools/railgun-runtime-build/acquire-prover-inputs.py');
  const code = `
import importlib.util, io, tarfile, tempfile, hashlib, base64, json, copy
from pathlib import Path
spec=importlib.util.spec_from_file_location('acquire', ${JSON.stringify(source)})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
root=Path(tempfile.mkdtemp(prefix='prover-acquisition-test-'))
recipe=json.loads((Path(m.__file__).parent/'PROVER-PACKAGES.json').read_text())
m.validate_recipe(recipe)
def refused(fn):
 try: fn()
 except ValueError: return
 raise Exception('Expected refusal')
for field,value in [('directory','/outside'),('directory','node_modules/../../outside'),('integrity','sha512-wrong'),('dependencies',{'bad':'absent@1.0.0'})]:
 bad=copy.deepcopy(recipe);bad['packages'][0][field]=value
 refused(lambda:m.validate_recipe(bad))
for i,(name,kind) in enumerate([('package/../../escape','file'),('/absolute','file'),('package/link','symlink'),('package/device','fifo')]):
 archive=root/('bad'+str(i)+'.tgz')
 with tarfile.open(archive,'w:gz') as tar:
  info=tarfile.TarInfo(name)
  if kind=='symlink':info.type=tarfile.SYMTYPE;info.linkname='/outside'
  elif kind=='fifo':info.type=tarfile.FIFOTYPE
  tar.addfile(info,io.BytesIO(b''))
 destination=root/('out'+str(i));destination.mkdir()
 refused(lambda:m.extract(archive,destination))
 assert list(destination.iterdir())==[]
archive=root/'good.tgz'
with tarfile.open(archive,'w:gz') as tar:
 info=tarfile.TarInfo('custom-root/file');info.size=3;tar.addfile(info,io.BytesIO(b'abc'))
expected='sha512-'+base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
m.verify_archive(archive,expected)
refused(lambda:m.verify_archive(archive,'sha512-wrong'))
destination=root/'good';destination.mkdir();m.extract(archive,destination)
assert (destination/'file').read_bytes()==b'abc'
inventory={'files':[{'file':'file','size':3,'sha256':hashlib.sha256(b'abc').hexdigest()}]}
m.verify_inputs(destination,inventory)
(destination/'file').write_bytes(b'abd')
refused(lambda:m.verify_inputs(destination,inventory))
refused(lambda:m.acquire(root))
print('passed')
`;
  expect(execFileSync('python3', ['-B', '-c', code], { encoding: 'utf8' }).trim()).toBe('passed');
});
