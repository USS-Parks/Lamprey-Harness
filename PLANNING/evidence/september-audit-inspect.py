"""Read-only audit helper; outputs source excerpts or repository inventory."""
import sys, pathlib, subprocess, json
import re
sys.stdout.reconfigure(encoding='utf-8')
root = pathlib.Path(__file__).resolve().parents[2]
if sys.argv[1] == 'read':
    p = root / sys.argv[2]
    lines = p.read_text(encoding='utf-8-sig').splitlines()
    start = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    end = int(sys.argv[4]) if len(sys.argv) > 4 else len(lines)
    print('\n'.join(f'{i+1}: {s}' for i,s in enumerate(lines) if start <= i+1 <= end))
elif sys.argv[1] == 'git':
    subprocess.run(['git', *sys.argv[2:]], cwd=root)
elif sys.argv[1] == 'inventory':
    paths = subprocess.check_output(['git','ls-files'], cwd=root,text=True).splitlines()
    counts = {}
    large = []
    for p in paths:
        f = root / p
        if f.is_file():
            counts[p.split('/')[0]] = counts.get(p.split('/')[0],0)+1
            if f.suffix in ('.ts','.tsx','.cjs','.ps1'):
                large.append((len(f.read_text(encoding='utf-8-sig',errors='replace').splitlines()),p))
    print(json.dumps({'tracked_count':len(paths),'by_root':counts,'largest_code':sorted(large,reverse=True)[:35]},indent=2))
elif sys.argv[1] == 'check':
    checks = {
        'tsc-node': ['node','node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.node.json'],
        'tsc-web': ['node','node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.web.json'],
        'lint': ['node','node_modules/eslint/bin/eslint.js','.'],
        'vitest': ['node','node_modules/vitest/vitest.mjs','run'],
        'unused-node': ['node','node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.node.json','--noUnusedLocals','--noUnusedParameters'],
        'unused-web': ['node','node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.web.json','--noUnusedLocals','--noUnusedParameters'],
        'native-db': ['node','scripts/test-native-db.cjs'],
    }
    name = sys.argv[2]
    out = pathlib.Path(__file__).parent / ('september-audit-'+name+'.log')
    import time
    start = time.monotonic()
    with out.open('w',encoding='utf-8') as f:
        f.write('Command: '+repr(checks[name])+'\n'); f.flush()
        proc = subprocess.run(checks[name],cwd=root,stdout=f,stderr=subprocess.STDOUT)
        f.write(f'\nExit: {proc.returncode}; seconds: {time.monotonic()-start:.2f}\n')
    print(out.read_text(encoding='utf-8')[-7000:])
    sys.exit(proc.returncode)
elif sys.argv[1] == 'scan':
    paths = subprocess.check_output(['git','ls-files'],cwd=root,text=True).splitlines()
    texts = {p:(root/p).read_text(encoding='utf-8-sig',errors='replace') for p in paths if (root/p).is_file() and pathlib.Path(p).suffix in ('.ts','.tsx','.cjs','.json','.md','.yml','.ps1','.mjs')}
    patterns = {
        'suppression':r'@ts-ignore|@ts-nocheck|eslint-disable',
        'placeholders':r'TODO|FIXME|HACK|not implemented|placeholder|stubbed',
        'skips':r'\b(?:describe|it|test)\.(?:skip|todo)|describe\.skipIf',
        'empty_catch':r'catch(?:\s*\([^)]*\))?\s*\{\s*\}',
        'whole_store':r'\buse\w+Store\(\)',
    }
    report={}
    for name, pattern in patterns.items():
        hits=[]
        for p,t in texts.items():
            if not p.startswith(('electron/','src/','scripts/')): continue
            for m in re.finditer(pattern,t):
                line=t.count('\n',0,m.start())+1
                hits.append({'path':p,'line':line,'match':m.group(0)[:100]})
        report[name]=hits
    # Candidate graph: literal imports/re-exports/requires only. Never deletion authority.
    source={p:t for p,t in texts.items() if p.endswith(('.ts','.tsx')) and p.startswith(('src/','electron/')) and '.test.' not in p}
    imports={p:[] for p in source}
    for p,t in source.items():
        for spec in re.findall(r'''(?:from\s*|import\s*\(|require\s*\(|import\s*)['"]([^'"]+)['"]''',t):
            if spec.startswith('.'):
                base=(root/p).parent/spec
            elif spec.startswith('@/'):
                base=root/'src'/spec[2:]
            else: continue
            for candidate in [base, pathlib.Path(str(base)+'.ts'),pathlib.Path(str(base)+'.tsx'),base/'index.ts',base/'index.tsx']:
                key=candidate.resolve().relative_to(root).as_posix() if candidate.resolve().is_relative_to(root) else ''
                if key in imports:
                    imports[key].append(p); break
    report['zero_literal_importers']=[{'path':p,'lines':len(source[p].splitlines())} for p,owners in imports.items() if not owners]
    reached=set()
    def visit(p):
        if p in reached: return
        reached.add(p)
        for child,owners in imports.items():
            if p in owners: visit(child)
    visit('src/main.tsx')
    report['renderer_unreachable_candidates']=[{'path':p,'lines':len(t.splitlines())} for p,t in source.items() if p.startswith('src/') and p not in reached and not p.endswith('.d.ts')]
    report['scan_counts']={'text_files':len(texts),'production_ts':len(source)}
    out=pathlib.Path(__file__).parent/'september-audit-scan.json'
    out.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:len(v) for k,v in report.items()},indent=2))
    print(json.dumps(report['zero_literal_importers'],indent=2))
elif sys.argv[1] == 'worktrees':
    raw=subprocess.check_output(['git','worktree','list','--porcelain'],cwd=root,text=True)
    rows=[]
    for block in raw.strip().split('\n\n'):
        p=pathlib.Path(block.splitlines()[0][9:])
        def git(*args):
            r=subprocess.run(['git','-c',f'safe.directory={p.as_posix()}','-C',str(p),*args],capture_output=True,text=True)
            return {'exit':r.returncode,'output':r.stdout.strip(),'error':r.stderr.strip()}
        sizes={}
        for name in ('node_modules','out','dist','coverage','target'):
            folder=p/name
            if folder.exists():
                total=0; errors=[]
                import os
                for directory,dirs,files in os.walk(folder,followlinks=False,onerror=lambda e:errors.append(str(e))):
                    dirs[:]=[d for d in dirs if not (pathlib.Path(directory)/d).is_symlink()]
                    for f in files:
                        try: total+=(pathlib.Path(directory)/f).stat().st_size
                        except OSError as e: errors.append(str(e))
                sizes[name]={'bytes':total,'read_errors':len(errors)}
        rows.append({'path':str(p),'registration':block,'status':git('status','--short'),'not_in_cached_remotes':git('log','--oneline','HEAD','--not','--remotes'),'generated_sizes':sizes})
    out=pathlib.Path(__file__).parent/'september-audit-worktrees.json'
    out.write_text(json.dumps(rows,indent=2),encoding='utf-8')
    print(json.dumps(rows,indent=2))
elif sys.argv[1] == 'provenance':
    targets={
        'SA-01':('electron/services/chat-tool-dispatch.ts','329,368'),
        'SA-02':('electron/services/chat-tool-dispatch.ts','277,285'),
        'SA-03':('electron/services/mcp-manager.ts','470,484'),
        'SA-04':('electron/services/mcp-manager.ts','298,315'),
        'SA-05':('electron/ipc/conversation.ts','493,527'),
        'SA-06':('electron/services/backup-runner.ts','238,268'),
        'SA-07':('electron/services/context-compressor.ts','172,186'),
        'SA-08':('electron/ipc/files.ts','150,156'),
        'SA-09':('electron/services/providers/schema-normalizer.ts','124,143'),
        'SA-10':('electron/services/providers/registry.ts','783,800'),
        'SA-11':('src/components/settings/SettingsDialog.tsx','66,83'),
        'SA-12':('src/components/layout/Sidebar.tsx','468,474'),
        'SA-13':('src/hooks/useKeyboardShortcuts.ts','103,118'),
        'SA-14':('src/components/settings/ApiKeyModal.tsx','26,44'),
        'SA-15':('electron/services/chat-tool-dispatch.ts','120,126'),
        'SA-16':('scripts/test-native-db.cjs','46,60'),
        'SA-17':('electron/services/pr-chat-ui-wiring.test.ts','7,27'),
        'SA-18':('scripts/bucket.ps1','221,263'),
        'SA-19':('DEVLOG.md','1,29'),
    }
    out={}
    for key,(p,span) in targets.items():
        result=subprocess.run(['git','blame','-M','-C','--line-porcelain','-L',span,'HEAD','--',p],cwd=root,capture_output=True,text=True,encoding='utf-8')
        commits={}; sha=None
        for line in result.stdout.splitlines():
            if re.match(r'^[0-9a-f]{40} ',line): sha=line.split()[0]; commits.setdefault(sha,{})
            elif sha and line.startswith(('author-time ','summary ','filename ')):
                k,v=line.split(' ',1); commits[sha][k]=v
        out[key]={'path':p,'lines':span,'commits':commits,'error':result.stderr}
    (pathlib.Path(__file__).parent/'september-audit-provenance.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
    print(json.dumps(out,indent=2))
elif sys.argv[1] == 'release':
    result=subprocess.run(['gh','release','view','v0.31.0','--repo','USS-Parks/Lamprey-Harness','--json','tagName,publishedAt,targetCommitish,assets,body,url'],cwd=root,capture_output=True,text=True)
    result.check_returncode()
    release=json.loads(result.stdout)
    import urllib.request, datetime
    config=json.loads((root/'.bucket.json').read_text())
    host=config['cloudflare']['cdnHost'].rstrip('/')
    if not host.startswith('https://'): host='https://'+host
    heads=[]
    for name in ['Lamprey-x64.exe','Lamprey-x64.zip','Lamprey-arm64.dmg','Lamprey-x86_64.AppImage']:
        url=host+'/'+name
        try:
            with urllib.request.urlopen(urllib.request.Request(url,method='HEAD'),timeout=20) as response:
                heads.append({'url':url,'status':response.status,'contentLength':response.headers.get('Content-Length'),'etag':response.headers.get('ETag')})
        except Exception as e: heads.append({'url':url,'error':str(e)})
    (pathlib.Path(__file__).parent/'september-audit-release.json').write_text(json.dumps({'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'github':release,'cdnHeads':heads},indent=2),encoding='utf-8')
    print(json.dumps(heads,indent=2))
    print('Saved release metadata')
elif sys.argv[1] == 'metrics':
    base=pathlib.Path(__file__).parent
    scan=json.loads((base/'september-audit-scan.json').read_text())
    print('scanned',scan['scan_counts'])
    print('unreachable',sum(x['lines'] for x in scan['renderer_unreachable_candidates']),scan['renderer_unreachable_candidates'])
    print('whole_store',scan['whole_store'])
    print('unused diagnostics', {n:len(re.findall(r'error TS', (base/f'september-audit-unused-{n}.log').read_text())) for n in ('node','web')})
    rows=json.loads((base/'september-audit-worktrees.json').read_text())
    for row in rows:
        for name,item in row['generated_sizes'].items():
            p=pathlib.Path(row['path'])/name
            item['junction']=p.is_junction()
            item['resolved']=str(p.resolve())
        print(row['path'],row['generated_sizes'])
    (base/'september-audit-worktrees.json').write_text(json.dumps(rows,indent=2))
elif sys.argv[1] == 'remote-evidence':
    import datetime
    def command(argv):
        r=subprocess.run(argv,cwd=root,capture_output=True,text=True,encoding='utf-8',errors='replace')
        if r.returncode: raise RuntimeError(r.stderr)
        return r.stdout
    data={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'localHead':command(['git','rev-parse','HEAD']).strip(),
          'upstreamHead':command(['git','rev-parse','origin/main']).strip(),
          'remoteRefs':command(['git','ls-remote','origin']).splitlines(),
          'upstreamCommits':command(['git','log','--format=%h:%cs:%s','HEAD..origin/main']).splitlines(),
          'openPullRequests':json.loads(command(['gh','pr','list','--repo','USS-Parks/Lamprey-Harness','--state','open','--json','number,title,headRefName,headRefOid,url'])),
          'runs':json.loads(command(['gh','run','list','--repo','USS-Parks/Lamprey-Harness','--branch','main','--limit','10','--json','databaseId,headSha,workflowName,status,conclusion,url']))}
    for label,runid in [('openwiki', '33963761725'),('ci','33882138669')]:
        logs=command(['gh','run','view',runid,'--repo','USS-Parks/Lamprey-Harness','--log'])
        logs=re.sub(r'\x1b\[[0-9;]*m','',logs)
        data[label+'LogExcerpts']=[line for line in logs.splitlines() if re.search(r'Tests\s+\d|Test Files\s+\d|ANTHROPIC_API_KEY.*required|##\[error\]',line)]
    base=pathlib.Path(__file__).parent
    (base/'september-audit-remote.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
    (base/'september-audit-upstream.diff').write_text(command(['git','diff','HEAD','origin/main']),encoding='utf-8')
    print(json.dumps({k:v for k,v in data.items() if k.endswith('LogExcerpts')},indent=2))
    print('Saved upstream diff and remote receipts')
elif sys.argv[1] == 'validate-docs':
    report=root/'PLANNING/LAMPREY_SEPTEMBER_2026_REAUDIT.md'
    plan=root/'PLANNING/LAMPREY_SEPTEMBER_2026_REMEDIATION_PSPR.md'
    guide=root/'PLANNING/evidence/SEPTEMBER_AUDIT_EVIDENCE.md'
    findings=re.findall(r'^### (SA-\d+) ',report.read_text(encoding='utf-8'),re.M)
    body=plan.read_text(encoding='utf-8')
    prompts=re.findall(r'^\| \[ \] (SR-\d+) \|',body,re.M)
    assert findings==[f'SA-{i:02}' for i in range(1,31)],findings
    assert prompts==[f'SR-{i:02}' for i in range(39)],prompts
    mapping=body.split('## Finding-to-prompt map')[1].split('## Defaults')[0]
    assert set(findings)==set(re.findall(r'SA-\d+',mapping))
    missing=[]
    for p in [report,plan,guide]:
        for target in re.findall(r'\]\(([^)]+)\)',p.read_text(encoding='utf-8')):
            if '://' not in target and not (p.parent/target).is_file(): missing.append(str(p.parent/target))
    assert not missing,missing
    print(json.dumps({'findings':len(findings),'ordered_unchecked_prompts':len(prompts),'all_findings_mapped':True,'local_links_exist':True}))
elif sys.argv[1] == 'search':
    pattern=sys.argv[2]
    for name in sys.argv[3:]:
        for i,line in enumerate((root/name).read_text(encoding='utf-8-sig').splitlines(),1):
            if re.search(pattern,line): print(f'{name}:{i}: {line}')
