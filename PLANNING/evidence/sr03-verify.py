import json
import pathlib
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8')
root = pathlib.Path(__file__).resolve().parents[2]
results = []
def check(label):
    result = subprocess.run(['cmd.exe','/d','/c','npm run typecheck'],cwd=root,capture_output=True,text=True,encoding='utf-8')
    results.append({'case':label,'exit':result.returncode,'output':result.stdout+result.stderr})
    return result
assert check('healthy baseline').returncode == 0
for directory in ['electron','src']:
    fixture = root/directory/'sr03-typecheck-fixture.ts'
    assert not fixture.exists()
    try:
        fixture.write_text("export const typecheckFixture: number = 'invalid'\n",encoding='utf-8',newline='\n')
        result = check(directory+' deliberate type error')
        assert result.returncode != 0 and 'sr03-typecheck-fixture.ts' in result.stdout
    finally:
        fixture.unlink()
assert check('fixtures removed').returncode == 0
(pathlib.Path(__file__).parent/'sr03-verification.json').write_text(json.dumps(results,indent=2),encoding='utf-8',newline='\n')
print(json.dumps(results,indent=2))
