"""Record exact-commit hosted workflow results, failing unless all required runs pass."""
import datetime
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
sha, output = sys.argv[1:]
runs = json.loads(subprocess.check_output(['gh', 'run', 'list', '--repo', 'USS-Parks/Lamprey-Harness', '--commit', sha, '--limit', '50', '--json', 'name,status,conclusion,databaseId,headSha,url'], cwd=root, text=True))
required = {'CI', 'Build Lamprey', 'pages build and deployment'}
latest = {}
for run in runs:
    latest.setdefault(run['name'], run)
assert required <= latest.keys(), runs
for name in required:
    run = latest[name]
    assert run['headSha'] == sha and run['status'] == 'completed' and run['conclusion'] == 'success', run
receipt = {'source': sha, 'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'runs': list(latest.values())}
(root / output).write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps(receipt, indent=2))
