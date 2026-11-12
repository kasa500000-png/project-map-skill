"""Upload validated source objects only. Workflow changes and refs use the user-authorized connector."""
import json, os, pathlib, subprocess, sys, urllib.request, urllib.error
report_path = pathlib.Path(sys.argv[1]); report = json.loads(report_path.read_text())
repo = os.environ['GITHUB_REPOSITORY']
assert repo == 'kasa500000-png/project-map-skill'
def git(*args): return subprocess.check_output(['git', *args])
def entries(ref):
    result = {}
    for entry in git('ls-tree','-rz',ref).split(b'\0'):
        if not entry: continue
        meta, name = entry.split(b'\t',1); mode, kind, sha = meta.decode().split()
        result[name.decode()] = {'mode':mode,'type':kind,'sha':sha}
    return result
before = entries(report['commits'][1]['sha']); after = entries(report['commits'][2]['sha'])
updates = []; deferred = []
for name in sorted(set(before) | set(after)):
    if before.get(name) == after.get(name): continue
    if name.startswith('.github/workflows/'):
        deferred.append(name); continue
    if name not in after:
        updates.append({'path':name,'mode':before[name]['mode'],'type':before[name]['type'],'sha':None})
    else:
        value=after[name]; assert value['type']=='blob'
        updates.append({'path':name,'mode':value['mode'],'type':'blob','content':git('cat-file','blob',value['sha']).decode('utf-8')})
request=urllib.request.Request('https://api.github.com/repos/'+repo+'/git/trees',data=json.dumps({'base_tree':'c0fa285432b5ce6962a7fc1328a29cafd65f5970','tree':updates}).encode(),method='POST',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'Project-Map-Source-Publication'})
try:
    with urllib.request.urlopen(request,timeout=60) as response: tree=json.load(response)
except urllib.error.HTTPError as error:
    report['publicationError']={'status':error.code,'detail':error.read(4096).decode('utf-8','replace')}
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report['publicationError'],ensure_ascii=False)); raise SystemExit(1)
assert tree['sha']=='e2bff9c45cf9350170b18f84a89ac6249eb9d11d','Published source differs from verified source'
report['nonWorkflowTree']=tree['sha']; report['deferredWorkflowPaths']=deferred; report['refUpdated']=False
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n'); print(report_path.read_text())
