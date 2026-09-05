import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[2]
ref = '1ad3618548af500a01d0358651d69a1cabf32b34'
files = ['electron/services/database.ts', 'electron/services/conversation-store.ts',
         'electron/services/sessions-search.test.ts', 'electron/services/loop-store.test.ts',
         'electron/services/loop-runner.test.ts', '.github/workflows/ci.yml']
for name in files:
    (root/name).write_bytes(subprocess.check_output(['git','show',f'{ref}:{name}'],cwd=root))
print('Reused reviewed source from PR #13; did not copy its unverified DEVLOG claims.')
