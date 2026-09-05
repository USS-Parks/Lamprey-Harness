"""Check relative Markdown targets outside fenced examples in the authored wiki."""
from pathlib import Path
import re
from urllib.parse import unquote

root = Path(__file__).resolve().parents[2]
failures = []
checked = 0
for path in (root / 'openwiki').rglob('*.md'):
    fence = False
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.lstrip().startswith('```'):
            fence = not fence
        if fence:
            continue
        for target in re.findall(r'\]\(([^)]+)\)', line):
            if ':' in target or target.startswith('#'):
                continue
            target = unquote(target.split('#')[0])
            if not target:
                continue
            checked += 1
            if not (path.parent / target).exists():
                failures.append(f'{path.relative_to(root)}: {target}')
print(f'Checked {checked} local wiki links')
if failures:
    raise RuntimeError('\n'.join(failures))
