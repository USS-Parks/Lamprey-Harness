"""Record and commit one verified, approved roster prompt using an explicit receipt."""
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
receipt_path = root/sys.argv[1]
receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
prompt = receipt['prompt']
plan = root/'PLANNING/LAMPREY_SEPTEMBER_2026_REMEDIATION_PSPR.md'
text = plan.read_text(encoding='utf-8')
assert f'| [ ] {prompt} |' in text or f'| [x] {prompt} |' in text
text = text.replace(f'| [ ] {prompt} |', f'| [x] {prompt} |', 1)
plan.write_text(text, encoding='utf-8', newline='\n')
devlog = root/'DEVLOG.md'
entry = f"## 2026-09-05 — {prompt}: {receipt['title']}\n\n"
entry += '**Files changed:** '+', '.join(f'`{p}`' for p in receipt['files'])+'\n\n'
entry += '**Verification:** '+receipt['verification']+'\n\n'
entry += '**Notes:** '+receipt['notes']+'\n\n'
if receipt.get('keep_tree_clean'):
    entry += f'**Commit:** the commit introducing `{receipt_path.relative_to(root).as_posix()}`; resolve with `git log -1 --format=%H -- {receipt_path.relative_to(root).as_posix()}`. This avoids a self-referential post-commit edit.\n\n'
else:
    entry += f'**Commit:** see `{receipt_path.relative_to(root).as_posix()}` (SHA recorded immediately after commit).\n\n'
current = devlog.read_text(encoding='utf-8')
if current.startswith(f'## 2026-09-05 — {prompt}:'):
    current = current.split('\n\n', 5)[5]
devlog.write_text(entry+current, encoding='utf-8', newline='\n')
files = list(dict.fromkeys(receipt['files'] + [str(plan.relative_to(root)), 'DEVLOG.md', str(receipt_path.relative_to(root))]))
subprocess.run(['git','add','--',*files],cwd=root,check=True)
subprocess.run(['git','-c','core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol','diff','--cached','--check','--', ':!*.diff', ':!*.patch', ':!*-original.txt', ':!*-base.txt', ':!*-incoming.txt'],cwd=root,check=True)
subprocess.run(['git','commit','-m',f"{prompt}: {receipt['title']}\n\nAuthored and reviewed by Basho Parks, copyright 2026"],cwd=root,check=True)
receipt['commit'] = subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
if not receipt.get('keep_tree_clean'):
    receipt_path.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8',newline='\n')
print(receipt['commit'])
subprocess.run(['git','push','origin','HEAD:main'],cwd=root,check=True)
