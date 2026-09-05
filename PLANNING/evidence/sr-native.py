import os
import pathlib
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8')

root = pathlib.Path(__file__).resolve().parents[2]
env = dict(os.environ, ELECTRON_RUN_AS_NODE='1')
args = sys.argv[1:] or ['scripts/test-native-db.cjs']
log = pathlib.Path(__file__).parent/'sr-native.log'
with log.open('w',encoding='utf-8',newline='\n') as stream:
    result = subprocess.run([str(root/'node_modules/electron/dist/electron.exe'), *args],cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT)
print(log.read_text(encoding='utf-8')[-9000:])
sys.exit(result.returncode)
