import json
import subprocess
from pathlib import Path

result = subprocess.run(['npm.cmd', 'audit', '--json'], capture_output=True, text=True)
data = json.loads(result.stdout)
Path('PLANNING/evidence/sr31h-audit.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps(data.get('metadata', {}), indent=2))
raise SystemExit(result.returncode)
