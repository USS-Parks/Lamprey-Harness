"""Generate the source disposition ledger from checked roster and committed receipts."""
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
base = root / 'PLANNING/evidence'
plan = (root / 'PLANNING/LAMPREY_SEPTEMBER_2026_REMEDIATION_PSPR.md').read_text(encoding='utf-8')
mapping = {}
for line in plan.splitlines():
    if line.startswith('| SA-'):
        cells = [c.strip() for c in line.split('|')[1:-1]]
        for i in (0, 2):
            if cells[i]:
                mapping[cells[i]] = cells[i + 1].split(', ')
assert len(mapping) == 41
rows = []
for finding, prompts in sorted(mapping.items()):
    evidence = []
    for prompt in prompts:
        path = base / (prompt.lower().replace('-', '') + '.json')
        if path.exists():
            receipt = json.loads(path.read_text(encoding='utf-8'))
            assert re.fullmatch('[0-9a-f]{40}', receipt['commit']), prompt
            assert f'| [x] {prompt} |' in plan, prompt
            evidence.append(f'[{prompt}]({path.name}) `{receipt["commit"][:12]}`')
        else:
            assert prompt in ('SR-35', 'SR-37', 'SR-38'), prompt
            evidence.append(f'{prompt} pending publication milestone')
    state = 'Source repair verified; release work remains' if finding in ('SA-18', 'SA-19', 'SA-23') else 'Source repair verified'
    if finding == 'SA-18':
        state = 'Open: release producer repair and published-byte acceptance'
    if finding == 'SA-23':
        state = 'Inventory verified; retained storage debt disclosed; deletion not authorized'
    rows.append(f'| {finding} | {state} | {"; ".join(evidence)} |')
text = '''# SR-34 source disposition ledger

This ledger links all 41 findings to committed repair receipts and their actual checks. It does not close the release milestone early. SA-18 remains explicitly open for SR-35/SR-37; current documentation and storage closeout continue in SR-38.

| Finding | Disposition | Prompt evidence and commit |
|---|---|---|
''' + '\n'.join(rows) + '''

## Repeated source probes

The original audit probe script is preserved as historical evidence. Its inert mocks and bug-observation expectations predate the repaired interfaces. Final acceptance reruns the executable regression suites for all nine original probe targets: cancellation/unknown dispatch, malformed roots, compression, schema property names, restore, citation rejection, awaited OS-open replies and external attachments. Native restore/compression tests and real Electron attachment checks complement those source tests; the original bug-observation script is not falsely presented as a passing regression gate.

## Boundaries

Real runtime acceptance uses isolated profiles, temporary Git repositories and local HTTP/stdio services. It proves the exercised production integration, not authorization against every hosted provider or third-party account. Public quantized embedding model download and inference execute separately. Existing parked provider/playbook and platform-only gates remain explicit; unsigned builds remain the approved non-goal. No production user database or credentials were modified by acceptance.

Authored and reviewed by Basho Parks, copyright 2026
'''
(base / 'SR34_SOURCE_LEDGER.md').write_text(text, encoding='utf-8', newline='\n')
