"""Check the UX relocation contract against actual source identities."""
import json
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
folder = Path(__file__).parent
source = (root / 'src/stores/ui-store.ts').read_text(encoding='utf-8')
contract = (folder / 'UX_CONTRACTS.md').read_text(encoding='utf-8')

def union(name):
    body = source.split(f'export type {name} =', 1)[1].split('\n\n', 1)[0]
    return set(re.findall(r"'([^']+)'", body))

tools_section = contract.split('## Complete tool destination map', 1)[1].split('## Workspace acceptance scenarios', 1)[0]
settings_section = contract.split('## Complete settings relocation map', 1)[1].split('## Composer, tasks and feedback acceptance', 1)[0]
tools = re.findall(r'^\| `([^`]+)` \|', tools_section, re.M)
settings = re.findall(r'^\| `([^`]+)` \|', settings_section, re.M)
assert len(tools) == len(set(tools)) == 13 and set(tools) == union('ToolId')
assert len(settings) == len(set(settings)) == 24 and set(settings) == union('SettingsTabId')
tabs_source = (root / 'src/components/settings/SettingsDialog.tsx').read_text(encoding='utf-8').split('const TABS = [',1)[1].split('] as const',1)[0]
assert set(settings) == set(re.findall(r"id: '([^']+)'", tabs_source))
defined = set(re.findall(r'^\| ([WCNAP]\d{2}) \|', contract, re.M))
required = set(re.findall(r'\b[WCNAP]\d{2}\b', contract))
assert required == defined, required - defined
assert set(re.findall(r'\| (S\d{2}) \|', settings_section)) == {f'S{i:02}' for i in range(1,25)}
paths = sorted(set(re.findall(r'`((?:src|electron|scripts)/[^`]+\.(?:ts|tsx|cjs))`', contract)))
assert all((root / p).is_file() for p in paths), [p for p in paths if not (root / p).is_file()]
pattern = 'openSettings|setActiveTool|toggleTool|seedSideChat|requestOpenFile|__openArtifact|toggleMemory|toggleWorkflowPalette|toggleQuickOpen'
result = subprocess.run(['rg','-n',pattern,'src','electron/services/shortcuts.ts','-g','!*.test.ts','-g','!*.test.tsx'],cwd=root,text=True,capture_output=True,check=True)
sha = subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
report = {'prompt':'UX-01','source':sha,'gate':'local-pass','toolIds':tools,'settingsIds':settings,'definedScenarios':sorted(defined),'settingsScenarios':24,'verifiedSourcePaths':paths,'callerInventory':result.stdout.splitlines(),'productChanges':False,'commands':['python PLANNING/evidence/ux-simplification/validate-contracts.py'],'limitations':['Completeness validation only; future UI and authority behavior require the named real acceptance scenarios.'],'commitLookup':'git log -1 --diff-filter=A --format=%H -- PLANNING/evidence/ux-simplification/UX01.json'}
(folder/'UX01.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
print(f'PASS: {len(tools)} tools, {len(settings)} settings, {len(defined)} named behavior scenarios plus 24 settings cases, {len(paths)} source paths, {len(report["callerInventory"])} caller lines.')
