"""Preserve the owned planning edit while advancing the approved source baseline."""
import hashlib
import json
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[2]
out = pathlib.Path(__file__).parent
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root)

owned = ['PLANNING/README.md', 'PLANNING/LAMPREY_AUGUST_2026_AUDIT.md',
         'PLANNING/LAMPREY_AUGUST_2026_AUDIT_PLAN.md', 'PLANNING/LAMPREY_SADDLE_PADDOCK_PLAN.md']
before = {p: hashlib.sha256((root/p).read_bytes()).hexdigest() for p in owned}
head = git('rev-parse', 'HEAD').decode().strip()
remote = git('rev-parse', 'origin/main').decode().strip()
original = (root/owned[0]).read_bytes()
(out/'sr00-planning-readme-original.txt').write_bytes(original)
(out/'sr00-owned-planning.patch').write_bytes(git('diff', '--', owned[0]))
base = out/'sr00-readme-base.txt'
incoming = out/'sr00-readme-incoming.txt'
base.write_bytes(git('show', f'{head}:{owned[0]}'))
incoming.write_bytes(git('show', f'{remote}:{owned[0]}'))
merge = subprocess.run(['git', 'merge-file', '-p', str(out/'sr00-planning-readme-original.txt'),
                        str(base), str(incoming)], cwd=root, capture_output=True)
if merge.returncode:
    # Reviewed conflict: retain upstream's evidenced release status and the owner's draft entry.
    owner_rows = [line for line in original.decode('utf-8').splitlines()
                  if line.startswith('| `LAMPREY_AUGUST_2026_AUDIT_PLAN.md`')]
    assert len(owner_rows) == 1
    incoming_text = incoming.read_text(encoding='utf-8')
    assert 'TL-W4 stays [ ]' in incoming_text
    marker = '| `TL_BASELINE.md`'
    merge.stdout = incoming_text.replace(marker, owner_rows[0]+'\n'+marker, 1).encode('utf-8')
manifest = {'beforeHead': head, 'upstreamHead': remote, 'ownedSha256': before,
            'statusBefore': git('status', '--short').decode()}
(root/owned[0]).write_bytes(base.read_bytes())
try:
    subprocess.run(['git', 'switch', '-c', 'codex/september-2026-remediation', remote], cwd=root, check=True)
except Exception:
    (root/owned[0]).write_bytes(original)
    raise
(root/owned[0]).write_bytes(merge.stdout)
for p in owned[1:]:
    assert hashlib.sha256((root/p).read_bytes()).hexdigest() == before[p]
manifest['reconciledReadmeSha256'] = hashlib.sha256(merge.stdout).hexdigest()
manifest['afterHead'] = git('rev-parse', 'HEAD').decode().strip()
manifest['statusAfter'] = git('status', '--short').decode()
(out/'sr00-preservation.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps(manifest, indent=2))
