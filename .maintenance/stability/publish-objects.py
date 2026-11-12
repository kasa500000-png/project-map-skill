"""Create verified Git objects only; the authorized connector updates main later."""
import json, os, pathlib, subprocess, sys, urllib.request
report_path = pathlib.Path(sys.argv[1])
report = json.loads(report_path.read_text())
repo = os.environ['GITHUB_REPOSITORY']
assert repo == 'kasa500000-png/project-map-skill'
def git(*args):
    return subprocess.check_output(['git', *args])
def post(endpoint, value):
    req = urllib.request.Request('https://api.github.com/repos/' + repo + endpoint, data=json.dumps(value).encode(), method='POST', headers={'Authorization':'Bearer ' + os.environ['GH_TOKEN'], 'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)
def entries(ref):
    result = {}
    for entry in git('ls-tree','-rz',ref).split(b'\0'):
        if not entry: continue
        meta, path = entry.split(b'\t',1)
        mode, kind, sha = meta.decode().split()
        result[path.decode()] = {'mode':mode,'type':kind,'sha':sha}
    return result
local_parent = report['base']
remote_parent = report['base']
remote_tree = git('rev-parse', local_parent + '^{tree}').decode().strip()
for stage in report['commits']:
    before, after = entries(local_parent), entries(stage['sha'])
    updates = []
    for path in sorted(set(before) | set(after)):
        if before.get(path) == after.get(path): continue
        if path not in after:
            updates.append({'path':path,'mode':before[path]['mode'],'type':before[path]['type'],'sha':None})
        else:
            entry = after[path]
            assert entry['type'] == 'blob', 'Unexpected non-blob change'
            updates.append({'path':path,'mode':entry['mode'],'type':'blob','content':git('cat-file','blob',entry['sha']).decode('utf-8')})
    tree = post('/git/trees', {'base_tree':remote_tree,'tree':updates})
    assert tree['sha'] == stage['tree'], 'Published tree differs from verified tree'
    commit = post('/git/commits', {'message':stage['message'],'tree':tree['sha'],'parents':[remote_parent]})
    stage['localSha'] = stage['sha']
    stage['sha'] = commit['sha']
    local_parent = stage['localSha']; remote_parent = commit['sha']; remote_tree = tree['sha']
report['remoteHead'] = remote_parent
report['refUpdated'] = False
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(report_path.read_text())
