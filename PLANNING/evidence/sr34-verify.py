"""Final source acceptance, retaining compact results and every skipped test."""
import datetime
import json
import sys
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
base = root / 'PLANNING/evidence'
prefix = sys.argv[1] if len(sys.argv) > 1 else 'sr34'
assert prefix.replace('-', '').isalnum()
sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True, cwd=root).strip()
results = []
def run(name, args):
    print(f'Running {name}', flush=True)
    with (base / f'{prefix}-{name}.log').open('w', encoding='utf-8') as log:
        result = subprocess.run(args, cwd=root, stdout=log, stderr=subprocess.STDOUT, timeout=300)
    results.append({'check': name, 'command': args, 'exit': result.returncode})
    print(f'{name}: exit {result.returncode}', flush=True)
    if result.returncode:
        print((base / f'{prefix}-{name}.log').read_text(encoding='utf-8')[-6000:])
        raise RuntimeError(f'{name} failed')

with tempfile.TemporaryDirectory(prefix='lamprey-final-tests-') as folder:
    output = str(Path(folder) / 'results.json')
    run('tests', ['node', 'node_modules/vitest/vitest.mjs', 'run', '--reporter=json', '--outputFile=' + output])
    tests = json.loads(Path(output).read_text(encoding='utf-8'))
    skips = []
    for suite in tests['testResults']:
        pending = [test['fullName'] for test in suite['assertionResults'] if test['status'] in ('pending', 'skipped', 'todo')]
        if pending:
            skips.append({'file': Path(suite['name']).relative_to(root).as_posix(), 'tests': pending})
    (base / f'{prefix}-skips.json').write_text(json.dumps({'source': sha, 'passed': tests['numPassedTests'], 'failed': tests['numFailedTests'], 'pending': tests['numPendingTests'], 'skips': skips}, indent=2) + '\n', encoding='utf-8', newline='\n')

run('native', ['node', 'scripts/test-native-db.cjs'])
run('node-unused', ['node', 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.node.json', '--noUnusedLocals', '--noUnusedParameters'])
run('web-unused', ['node', 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.web.json', '--noUnusedLocals', '--noUnusedParameters'])
run('gate-contracts', ['node', '--test', 'scripts/test-native-db.test.cjs', 'scripts/pre-push-gate.test.cjs', 'scripts/pre-push-scope.test.cjs'])
run('build', ['node', 'node_modules/electron-vite/bin/electron-vite.js', 'build'])
for mode in ['plugins', 'attachments', 'settings', 'shortcuts', 'keys', 'prs', 'resize', 'environment-git', 'browser', 'shutdown', 'startup', 'local-setup', 'workflows', 'rag']:
    run('electron-' + mode, ['node', 'scripts/acceptance/shell-link.cjs', '--' + mode])
run('electron-pending-approval', ['node', 'scripts/acceptance/shell-link.cjs', '--shutdown', '--pending-approval'])
for name in ['api-key', 'browser-lifecycle', 'environment-refresh', 'dependency-runtime', 'resize', 'subscriptions']:
    run(name, ['node', 'scripts/acceptance/' + name + '.cjs'])
run('proof', ['npm.cmd', 'run', 'verify:proof', '--', '--no-tests', '--require-smokes'])
assert sha == subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True, cwd=root).strip()
(base / f'{prefix}-local.json').write_text(json.dumps({'source': sha, 'completed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'checks': results}, indent=2) + '\n', encoding='utf-8', newline='\n')
print('All final local checks passed on ' + sha, flush=True)
