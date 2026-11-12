"""Apply a checksum-verified, locally tested three-commit maintenance series.
This helper lives only on the review branch, never in the resulting main tree.
"""
import argparse, base64, hashlib, json, lzma, os, pathlib, subprocess, tempfile
BASE = '1b3363a1af5a2a61842608d3fd1b6abd8fc3d98e'
BASE_TREE = '93a08a3b95e9e2830b1c854dae07cc3aab757132'
DIGEST = 'fd26a003ce9eef0e6d2f30a3e06f669ab949713c2ae9d6e4e48e4d4ec3d237d1'
TREES = ['b2e0b482f5126ea30f0a68d592ca426962a8451f', 'c0fa285432b5ce6962a7fc1328a29cafd65f5970', '9c5980d4fccb38ad32aaf5e673ac362990a5d72d']
parser = argparse.ArgumentParser()
parser.add_argument('--target', required=True)
parser.add_argument('--payload', required=True)
parser.add_argument('--report', required=True)
parser.add_argument('--validate', action='store_true')
args = parser.parse_args()
target = pathlib.Path(args.target).resolve()
report = pathlib.Path(args.report).resolve()
report.parent.mkdir(parents=True, exist_ok=True)
payload = pathlib.Path(args.payload).resolve()
parts = sorted(payload.glob('part-*.b64'))
assert [p.name for p in parts] == [f'part-{i:02}.b64' for i in range(11)], 'Missing or extra payload pieces'
compressed = base64.b64decode(''.join(p.read_text().strip() for p in parts), validate=True)
assert hashlib.sha256(compressed).hexdigest() == DIGEST, 'Maintenance bundle checksum mismatch'
series = json.loads(lzma.decompress(compressed))
assert len(series) == 3 and [s['tree'] for s in series] == TREES, 'Unexpected series'
def git(*argv):
    return subprocess.check_output(['git', *argv], cwd=target, text=True).strip()
assert git('rev-parse', 'HEAD') == BASE, 'Target is not the reviewed upstream commit'
assert git('rev-parse', 'HEAD^{tree}') == BASE_TREE
assert not git('status', '--porcelain'), 'Target worktree is dirty'
subprocess.run(['git', 'config', 'user.name', 'Project Map Maintenance'], cwd=target, check=True)
subprocess.run(['git', 'config', 'user.email', 'project-map@users.noreply.github.com'], cwd=target, check=True)
results = []
for index, stage in enumerate(series, 1):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.patch', encoding='utf-8') as patch:
        patch.write(stage['patch']); patch.flush()
        subprocess.run(['git', 'apply', '--index', '--unidiff-zero', '--binary', patch.name], cwd=target, check=True)
    tree = git('write-tree')
    assert tree == stage['tree'], f'Phase {index}: staged tree does not match verified local source'
    if args.validate:
        for label, command in [('package', ['npm', 'run', 'check']), ('tests', ['npm', 'test'])]:
            result = subprocess.run(command, cwd=target, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            (report.parent / f'phase-{index}-{label}.log').write_text(result.stdout, encoding='utf-8')
            print(result.stdout, flush=True)
            if result.returncode: raise SystemExit(f'Phase {index} {label} failed: {result.returncode}')
        assert git('write-tree') == tree
        subprocess.run(['git', 'diff', '--exit-code'], cwd=target, check=True)
    subprocess.run(['git', 'commit', '--no-gpg-sign', '-m', stage['message']], cwd=target, check=True)
    assert git('rev-parse', 'HEAD^{tree}') == tree
    results.append({'phase': index, 'sha': git('rev-parse', 'HEAD'), 'tree': tree, 'message': stage['message'], 'testsExecuted': args.validate})
assert not git('status', '--porcelain'), 'Unexpected files left by validation'
report.write_text(json.dumps({'base':BASE,'version':'0.7.0','finalTree':TREES[-1],'commits':results}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(report.read_text(), flush=True)
