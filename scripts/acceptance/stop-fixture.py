"""Stop only a hung acceptance fixture, never an installed Lamprey session."""
import json
import subprocess
script = "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like '*acceptance*electron-fixture.cjs*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
result = subprocess.run(['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script], capture_output=True, text=True, check=True)
rows = json.loads(result.stdout or '[]')
if isinstance(rows, dict):
    rows = [rows]
for row in rows:
    assert 'electron-fixture.cjs' in row['CommandLine']
    print('Stopping isolated acceptance fixture PID', row['ProcessId'])
    subprocess.run(['taskkill', '/PID', str(row['ProcessId']), '/T', '/F'], check=True)
