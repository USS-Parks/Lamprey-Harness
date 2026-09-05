"""Read-only storage/preservation inventory; writes only its named receipt."""
import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
def git(path, *args):
    p = subprocess.run(['git', '-c', f'safe.directory={path.as_posix()}', '-C', str(path), *args], capture_output=True, text=True)
    return {'exit': p.returncode, 'output': p.stdout.strip(), 'error': p.stderr.strip()}

def size(path):
    if path.is_symlink() or path.is_junction():
        return {'shared_target': str(path.resolve()), 'separate_bytes': 0}
    if not path.is_dir():
        return {'bytes': path.stat().st_size}
    total = 0
    errors = []
    links = []
    for parent, dirs, files in os.walk(path, followlinks=False, onerror=lambda e: errors.append(str(e))):
        for name in dirs[:]:
            child = Path(parent) / name
            if child.is_symlink() or child.is_junction():
                links.append({'path': str(child), 'target': str(child.resolve())})
                dirs.remove(name)
        for name in files:
            try:
                total += (Path(parent) / name).stat().st_size
            except OSError as e:
                errors.append(str(e))
    return {'bytes': total, 'errors': errors, 'shared_links': links}

subprocess.run(['git', 'fetch', 'origin', 'main'], cwd=root, check=True)
remote = git(root, 'rev-parse', 'origin/main')['output']
live_remote = git(root, 'ls-remote', 'origin', 'refs/heads/main')['output'].split()[0]
assert remote == live_remote
rows = []
for block in git(root, 'worktree', 'list', '--porcelain')['output'].split('\n\n'):
    path = Path(block.splitlines()[0][9:])
    head = git(path, 'rev-parse', 'HEAD')['output']
    rows.append({
        'path': str(path), 'registration': block, 'head': head,
        'status': git(path, 'status', '--short'),
        'unpublished_against_main': git(path, 'log', '--oneline', f'{remote}..HEAD'),
        'preserved_on_main': git(path, 'merge-base', '--is-ancestor', head, remote)['exit'] == 0,
        'generated': {name: size(path / name) for name in ('node_modules', 'out', 'dist', 'coverage', 'target') if (path / name).exists()},
        'purpose': 'Active sequential remediation and release' if path.resolve() == root.resolve() else 'Retained prior audit lane; no current session ownership established',
        'retirement_blocker': 'Active canonical checkout' if path.resolve() == root.resolve() else 'Explicit path-specific removal authorization and owner confirmation required'
    })
receipt = {
    'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'remote_main': remote, 'worktrees': rows,
    'dist_entries': {p.name: size(p) for p in (root / 'dist').iterdir()},
    'disk': dict(zip(('total', 'used', 'free'), shutil.disk_usage(root))),
    'deletions': []
}
out = root / sys.argv[1]
out.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'remote_main': remote, 'worktrees': rows, 'disk': receipt['disk']}, indent=2))
