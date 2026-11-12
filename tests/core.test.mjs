import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillRoot = process.env.PROJECT_MAP_SKILL || fileURLToPath(new URL('../skills/project-map', import.meta.url));
const { scanProject, getMap, analyzeImpact, createTask, getTask, listTasks, proposeTask, reviewTask, updateTask, completeTask } = await import(pathToFileURL(path.join(skillRoot, 'scripts/lib/core.mjs')));
const cli = path.join(skillRoot, 'scripts/project-map.mjs');

async function write(root, relative, content) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function tempProject(t, prefix = 'project-map-core-') {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function fixture(t, { useGit = false } = {}) {
  const root = await tempProject(t);
  if (useGit) git(root, 'init', '-q');
  await write(root, '.gitignore', '.agents/project-map-state/\nignored.ts\nnode_modules/\n.env*\n');
  await write(root, 'package.json', JSON.stringify({ name: 'fixture-app' }));
  await write(root, 'tsconfig.json', '{ // Local alias\n "compilerOptions": {"baseUrl":".", "paths":{"@/*":["src/*"],},},}\n');
  await write(root, 'src/app/tasks/page.tsx', "import { TaskCard } from '@/components/TaskCard';\nexport default function Tasks(){ return <TaskCard />; }\n");
  await write(root, 'src/app/tasks/[id]/page.tsx', "import { TaskCard } from '../../../components/TaskCard';\nexport default function Detail(){ return <TaskCard />; }\n");
  await write(root, 'src/app/settings/page.tsx', 'export default function Settings(){ return <p>Settings</p>; }\n');
  await write(root, 'src/components/TaskCard.tsx', "import { tasks } from '../data/tasks';\nexport function TaskCard(){ return <p>{tasks.length}</p>; }\n");
  await write(root, 'src/data/tasks.ts', 'export const tasks = []; // SOURCE_BODY_MUST_NOT_BE_PERSISTED\n');
  return root;
}

async function queued(root, nodeIds = ['src/app/tasks/page.tsx']) {
  const map = await scanProject(root);
  return createTask(root, { nodeIds, intent: 'display', request: '선택한 화면의 표시를 정리해줘.', snapshotId: map.snapshotId });
}

async function approve(root, task) {
  const proposed = await proposeTask(root, task.id, {
    summary: '선택한 화면의 표시를 정리하고 결과를 확인합니다.',
    writeFiles: task.nodeIds,
    effects: task.nodeIds.map(nodeId => ({ nodeId, change: '화면 표시 정리', expected: '변경한 표시가 화면에 보입니다.', verify: '실제 화면을 열어 변경된 표시를 확인합니다.' })),
  });
  return reviewTask(root, task.id, { decision: 'approve', revision: proposed.plan.revision, snapshotId: proposed.plan.snapshotId, source: 'conversation' });
}

test('maps actual files, resolves imports and aliases, and keeps feature labels inferred', async t => {
  const root = await fixture(t);
  const map = await scanProject(root);
  assert.equal(map.schemaVersion, 1);
  assert.equal(map.project.name, 'fixture-app');
  assert.equal(map.project.git.available, false);
  assert.ok(map.warnings.some(message => /not a Git|Git is unavailable/.test(message)));
  const list = map.nodes.find(node => node.id === 'src/app/tasks/page.tsx');
  const detail = map.nodes.find(node => node.id === 'src/app/tasks/[id]/page.tsx');
  assert.equal(list.kind, 'screen');
  assert.equal(list.label, '작업 목록');
  assert.equal(detail.label, '작업 상세');
  assert.equal(detail.confidence, 'inferred');
  assert.equal(detail.route, '/tasks/[id]');
  assert.ok(map.edges.some(edge => edge.source === list.id && edge.target === 'src/components/TaskCard.tsx' && edge.confidence === 'confirmed'));
  assert.ok(map.edges.some(edge => edge.source === detail.id && edge.target === 'src/components/TaskCard.tsx'));
  assert.equal((await getMap(root)).snapshotId, map.snapshotId);
  assert.equal((await scanProject(root)).snapshotId, map.snapshotId, 'state creation must not change the source snapshot');
  assert.ok(!(await fs.readFile(path.join(root, '.agents/project-map-state/map.json'), 'utf8')).includes('SOURCE_BODY_MUST_NOT_BE_PERSISTED'));
});

test('Git discovery excludes ignored, secret-like, and generated paths', async t => {
  const root = await fixture(t, { useGit: true });
  for (const file of ['ignored.ts', '.env.local', 'node_modules/dependency/index.ts', 'dist/generated.ts', 'src/secrets/helper.ts', 'credentials/config.ts']) await write(root, file, 'export const token = "PRIVATE_VALUE";');
  git(root, 'add', '.');
  const map = await scanProject(root);
  assert.ok(map.project.git.available);
  for (const file of ['ignored.ts', '.env.local', 'node_modules/dependency/index.ts', 'dist/generated.ts', 'src/secrets/helper.ts', 'credentials/config.ts']) assert.ok(!map.files.some(record => record.path === file), file);
  assert.ok(!JSON.stringify(map).includes('PRIVATE_VALUE'));
});

test('source symlinks cannot bring files outside the project into the map', { skip: process.platform === 'win32' }, async t => {
  const arena = await tempProject(t);
  const root = path.join(arena, 'project');
  await fs.mkdir(root);
  await write(root, 'main.ts', 'export const value = 1;');
  await write(arena, 'outside.ts', 'export const value = "OUTSIDE_SOURCE";');
  await fs.symlink(path.join(arena, 'outside.ts'), path.join(root, 'linked.ts'));
  git(root, 'init', '-q');
  git(root, 'add', '.');
  const map = await scanProject(root);
  assert.ok(!map.nodes.some(node => node.id === 'linked.ts'));
  assert.ok(!JSON.stringify(map).includes('OUTSIDE_SOURCE'));
  assert.ok(map.coverage.skippedFiles > 0);
});

test('comments, strings, regex literals, and HTML/CSS comments do not invent import edges', async t => {
  const root = await tempProject(t);
  await write(root, 'target.ts', 'export const value = 1;');
  await write(root, 'main.ts', "// import x from './target';\n/* import y from './target'; */\nconst quoted = \"import z from './target'\";\nconst expression = /import('.\\/target')/;\nconst name = './target'; import(name);\n");
  await write(root, 'main.css', '/* @import "./target.ts"; */\nbody { margin: 0; }');
  await write(root, 'index.html', '<!-- <script src="./target.ts"></script> -->\n<p>Example</p>');
  const map = await scanProject(root);
  assert.equal(map.edges.length, 0);
  assert.ok(map.warnings.some(message => /variable or template imports/.test(message)));
});

test('impact separates selected changes, required context, and transitive consumers', async t => {
  const root = await fixture(t);
  const map = await scanProject(root);
  const display = analyzeImpact(map, { nodeIds: ['src/app/tasks/page.tsx'], intent: 'display' });
  assert.deepEqual(display.writeFiles, ['src/app/tasks/page.tsx']);
  assert.ok(display.readFiles.includes('src/components/TaskCard.tsx'));
  assert.ok(!display.writeFiles.includes('src/components/TaskCard.tsx'));
  const behavior = analyzeImpact(map, { nodeIds: ['src/app/tasks/page.tsx'], intent: 'behavior' });
  assert.ok(behavior.readFiles.includes('src/data/tasks.ts'));
  const contract = analyzeImpact(map, { nodeIds: ['src/data/tasks.ts'], intent: 'contract' });
  assert.ok(contract.verifyFiles.includes('src/components/TaskCard.tsx'));
  assert.ok(contract.verifyFiles.includes('src/app/tasks/page.tsx'));
  assert.ok(contract.verifyFiles.includes('src/app/tasks/[id]/page.tsx'));
  assert.deepEqual(contract.writeFiles, ['src/data/tasks.ts']);
  assert.ok(contract.parallelCandidates.some(candidate => candidate.nodeId === 'src/app/settings/page.tsx' && candidate.reason));
  assert.ok(contract.warnings.length, 'candidate scope must retain its limitations');
});

test('declared configuration improves names without presenting relationships as verified imports', async t => {
  const root = await fixture(t);
  await write(root, 'project-map.config.json', JSON.stringify({ name: '예시 앱', labels: { 'src/app/tasks/page.tsx': '내 작업' }, descriptions: { 'src/app/tasks/page.tsx': '현재 작업을 확인하는 화면' }, relationships: [{ source: 'src/app/settings/page.tsx', target: 'src/data/tasks.ts', kind: 'reads', reason: 'Declared relationship' }] }));
  const map = await scanProject(root);
  assert.equal(map.project.name, '예시 앱');
  assert.equal(map.nodes.find(node => node.id === 'src/app/tasks/page.tsx').label, '내 작업');
  const declared = map.edges.find(edge => edge.source === 'src/app/settings/page.tsx' && edge.target === 'src/data/tasks.ts');
  assert.equal(declared.kind, 'reads');
  assert.equal(declared.confidence, 'inferred');
});

test('invalid node selections, intents, requests, and task IDs are rejected', async t => {
  const root = await fixture(t);
  const map = await scanProject(root);
  assert.throws(() => analyzeImpact(map, { nodeIds: [] }), /Select/);
  assert.throws(() => analyzeImpact(map, { nodeIds: ['../outside.ts'] }), error => error.code === 'NODE_NOT_FOUND');
  assert.throws(() => analyzeImpact(map, { nodeIds: [map.nodes[0].id], intent: 'execute' }), /intent/);
  await assert.rejects(() => createTask(root, { nodeIds: [map.nodes[0].id], request: ' ' }), error => error.code === 'INVALID_INPUT');
  await assert.rejects(() => getTask(root, '../../outside'), error => error.code === 'INVALID_INPUT');
  await assert.rejects(() => getTask(root, 'task-00000000-0000-0000-0000-000000000000'), error => error.code === 'TASK_NOT_FOUND');
});

test('stale snapshots are rejected both when queueing and before first execution', async t => {
  const root = await fixture(t);
  const map = await scanProject(root);
  await fs.appendFile(path.join(root, 'src/app/tasks/page.tsx'), '// changed before queue\n');
  await assert.rejects(() => createTask(root, { nodeIds: ['src/app/tasks/page.tsx'], request: '정리해줘', snapshotId: map.snapshotId }), error => error.code === 'STALE_SNAPSHOT');
  assert.equal((await listTasks(root)).length, 0);
  const task = await queued(root);
  await approve(root, task);
  await fs.appendFile(path.join(root, 'src/components/TaskCard.tsx'), '// changed before start\n');
  await assert.rejects(() => updateTask(root, task.id, { status: 'running' }), error => error.code === 'STALE_SNAPSHOT');
  assert.equal((await getTask(root, task.id)).status, 'approved');
});

test('completion uses the request baseline and reports additions, deletions, and scope escapes', async t => {
  const root = await fixture(t, { useGit: true });
  git(root, 'add', '.');
  git(root, '-c', 'user.name=Project Map Tests', '-c', 'user.email=tests@example.invalid', 'commit', '-qm', 'fixture');
  await fs.appendFile(path.join(root, 'src/data/tasks.ts'), '// pre-existing dirty change\n');
  const task = await queued(root);
  assert.ok((await getMap(root)).project.git.dirty);
  await approve(root, task);
  const running = await updateTask(root, task.id, { status: 'running' });
  assert.ok(running.startedAt);
  await fs.appendFile(path.join(root, 'src/app/tasks/page.tsx'), '// requested change\n');
  await fs.unlink(path.join(root, 'src/components/TaskCard.tsx'));
  await write(root, 'src/data/added.ts', 'export const added = true;');
  const completed = await completeTask(root, task.id, { summary: '화면 수정 및 변경 비교' });
  assert.equal(completed.status, 'completed');
  const changes = new Map(completed.result.changes.map(change => [change.path, change]));
  assert.equal(changes.size, 3);
  assert.ok(!changes.has('src/data/tasks.ts'), 'pre-existing unchanged dirty content must not be attributed to this task');
  assert.equal(changes.get('src/app/tasks/page.tsx').status, 'modified');
  assert.equal(changes.get('src/components/TaskCard.tsx').status, 'deleted');
  assert.equal(changes.get('src/data/added.ts').status, 'added');
  assert.equal(changes.get('src/app/tasks/page.tsx').outOfScope, false);
  assert.ok(completed.result.outOfScopeFiles.includes('src/components/TaskCard.tsx'));
  assert.ok(completed.result.outOfScopeFiles.includes('src/data/added.ts'));
  assert.ok(completed.result.beforeNodes.some(node => node.id === 'src/components/TaskCard.tsx'));
  assert.ok(!completed.result.afterNodes.some(node => node.id === 'src/components/TaskCard.tsx'));
  assert.equal(completed.result.comparisonCoverage.sourceFilesOnly, true);
  assert.equal(completed.verificationStatus, 'not_run');
  assert.equal((await getTask(root, task.id)).result.changes.length, 3);
});

test('verification reflects recorded outcomes and cannot be forged through a status patch', async t => {
  const root = await fixture(t);
  const outcomes = [
    { checks: [], expected: 'not_run' },
    { checks: [{ name: 'actual check', status: 'passed' }], expected: 'not_run' }, // AI report alone is not execution proof.
    { checks: [{ name: 'actual check', status: 'failed' }], expected: 'failed' },
    { checks: [{ name: 'one check', status: 'passed' }, { name: 'another check', status: 'not_run' }], expected: 'not_run' },
  ];
  for (const { checks, expected } of outcomes) {
    const task = await queued(root);
    await assert.rejects(() => updateTask(root, task.id, { status: 'completed' }), error => error.code === 'INVALID_INPUT');
    await assert.rejects(() => updateTask(root, task.id, { projectRoot: '/elsewhere' }), error => error.code === 'INVALID_INPUT');
    await approve(root, task);
    await updateTask(root, task.id, { status: 'running' });
    const done = await completeTask(root, task.id, { checks });
    assert.equal(done.verificationStatus, expected);
    assert.equal(done.result.verificationStatus, expected);
    await assert.rejects(() => updateTask(root, task.id, { status: 'running' }), error => error.code === 'TASK_COMPLETED');
  }
});

test('custom state folders stay outside source coverage and stable snapshots', async t => {
  const root = await fixture(t);
  const options = { stateDir: '.custom-state' };
  const first = await scanProject(root, options);
  await write(root, '.custom-state/generated.ts', 'export const cache = true;');
  const second = await scanProject(root, options);
  assert.equal(first.snapshotId, second.snapshotId);
  assert.ok(!second.files.some(file => file.path.startsWith('.custom-state/')));
  assert.equal((await getMap(root, options)).snapshotId, first.snapshotId);
});

test('symlinked state or task directories cannot redirect writes outside the project', { skip: process.platform === 'win32' }, async t => {
  const arena = await tempProject(t);
  const external = path.join(arena, 'external');
  await fs.mkdir(external);
  for (const mode of ['state', 'tasks']) {
    const root = path.join(arena, mode);
    await fs.mkdir(root);
    await write(root, 'main.ts', 'export const value = 1;');
    await fs.mkdir(path.join(root,'.agents'),{recursive:true});
    if (mode === 'state') await fs.symlink(external, path.join(root, '.agents/project-map-state'));
    else { await fs.mkdir(path.join(root, '.agents/project-map-state'), {recursive:true}); await fs.symlink(external, path.join(root, '.agents/project-map-state/tasks')); }
    await assert.rejects(() => scanProject(root), error => error.code === 'UNSAFE_STATE_PATH');
  }
  assert.deepEqual(await fs.readdir(external), []);
});

test('persisted map and task validation reject forged paths, roots, and baseline hashes', async t => {
  const root = await fixture(t);
  const task = await queued(root);
  const taskPath = path.join(root, '.agents/project-map-state/tasks', `${task.id}.json`);
  const original = JSON.parse(await fs.readFile(taskPath, 'utf8'));
  for (const mutate of [
    value => { value.projectRoot = path.dirname(root); },
    value => { value.baseline[0].path = '../../outside.ts'; },
    value => { value.baseline[0].hash = '0'.repeat(64); },
    value => { value.impact.writeFiles = ['/etc/passwd']; },
  ]) {
    const bad = structuredClone(original); mutate(bad);
    await fs.writeFile(taskPath, JSON.stringify(bad));
    await assert.rejects(() => getTask(root, task.id), error => error.code === 'INVALID_STATE');
  }
  await fs.writeFile(taskPath, JSON.stringify(original));
  assert.equal((await listTasks(root)).length, 1);
  const mapPath = path.join(root, '.agents/project-map-state/map.json');
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  map.nodes[0].files = ['/etc/passwd'];
  await fs.writeFile(mapPath, JSON.stringify(map));
  await assert.rejects(() => getMap(root), error => error.code === 'INVALID_STATE');
});

test('oversized and binary sources produce an explicit incomplete-comparison warning', async t => {
  const root = await fixture(t);
  await write(root, 'src/oversized.ts', 'x'.repeat(512 * 1024 + 1));
  await write(root, 'src/binary.ts', Buffer.from([0, 1, 2, 3]));
  const task = await queued(root);
  assert.equal(task.baselineCoverage.skippedFiles, 2);
  await approve(root, task);
  await updateTask(root, task.id, { status: 'running' });
  const done = await completeTask(root, task.id, {});
  assert.equal(done.result.comparisonCoverage.completeWithinScannedSources, false);
  assert.ok(done.result.warnings.some(message => /incomplete/.test(message)));
});

test('CLI entry point works through an installed skill link and project paths containing spaces', { skip: process.platform === 'win32' }, async t => {
  const arena = await tempProject(t, 'project map cli ');
  const root = path.join(arena, 'my sample project');
  await write(root, 'app/page.tsx', 'export default function Page(){return null;}');
  const installed = path.join(arena, 'installed skill');
  await fs.symlink(await fs.realpath(skillRoot), installed, 'dir');
  const linkedCLI = path.join(installed, 'scripts/project-map.mjs');
  const run = args => JSON.parse(execFileSync(process.execPath, [linkedCLI, ...args, '--project', root], { encoding: 'utf8', cwd: root }));
  assert.equal(run(['doctor']).ok, true);
  assert.equal(run(['scan', '--summary']).nodes, 1);
  const task = await queued(root, ['app/page.tsx']);
  const summary = run(['task', '--id', task.id]);
  assert.equal(summary.id, task.id);
  assert.equal(summary.baseline, undefined);
  assert.equal(summary.baselineNodes, undefined);
  await approve(root, task);
  assert.equal(run(['start', '--id', task.id]).status, 'running');
  assert.equal(run(['complete', '--id', task.id, '--summary', '완료']).verificationStatus, 'not_run');
  assert.ok(cli.endsWith('project-map.mjs'));
});
