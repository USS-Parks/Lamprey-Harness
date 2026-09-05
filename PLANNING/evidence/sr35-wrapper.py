"""Exercise the PowerShell entry point with read-only dry-run arguments."""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[2]
subprocess.run([r'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(root / 'scripts/bucket.ps1'), '-DryRun', '-NoBuild'], cwd=root, check=True)
