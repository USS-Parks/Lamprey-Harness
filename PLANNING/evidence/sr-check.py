import pathlib
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8')
root = pathlib.Path(__file__).resolve().parents[2]
log = pathlib.Path(__file__).parent/(sys.argv[1]+'.log')
with log.open('w',encoding='utf-8',newline='\n') as stream:
    result = subprocess.run(sys.argv[2:],cwd=root,stdout=stream,stderr=subprocess.STDOUT)
    stream.write(f'\nExit: {result.returncode}\n')
print(log.read_text(encoding='utf-8')[-8000:])
sys.exit(result.returncode)
