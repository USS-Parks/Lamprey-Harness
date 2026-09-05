"""Prepare the approved 0.32.0 candidate without creating a tag or release."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[2]
for name in ['package.json', 'package-lock.json']:
    p = root / name
    text = p.read_text(encoding='utf-8')
    data = json.loads(text)
    assert data['version'] == '0.31.0', name
    text = text.replace('"version": "0.31.0"', '"version": "0.32.0"', 2 if name == 'package-lock.json' else 1)
    updated = json.loads(text)
    assert updated['version'] == '0.32.0'
    if name == 'package-lock.json':
        assert updated['packages']['']['version'] == '0.32.0'
    p.write_text(text, encoding='utf-8', newline='\n')
