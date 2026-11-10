import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillRoot = process.env.PROJECT_MAP_SKILL || fileURLToPath(new URL('../skills/project-map', import.meta.url));
const { scanProject, analyzeImpact, createTask, getTask, proposeTask, reviewTask, updateTask, completeTask } = await import(pathToFileURL(path.join(skillRoot, 'scripts/lib/core.mjs')));
const HOME = 'app/page.tsx';
const TASKS = 'app/tasks/page.tsx';
const SETTINGS = 'app/settings/page.tsx';
const CARD = 'components/Card.tsx';

async function write(root, file, value) {
  const absolute = path.join(root, file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, value);
}

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'project-map-workflow-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await write(root, HOME, "import { Card } from '../components/Card'; export default function Home(){ return <><Card/><a href=\"/tasks\">Tasks</a></>; }\n");
  await write(root, TASKS, 'export default function Tasks(){ return <p>Tasks</p>; }\n');
  await write(root, SETTINGS, 'export default function Settings(){ return <p>Settings</p>; }\n');
  await write(root, CARD, 'export function Card(){ return <p>Card</p>; }\n');
  const map = await scanProject(root);
  return { root, map };
}

function effect(nodeId, label = '화면 표시를 정리합니다.') {
  return { nodeId, change: label, expected: '사용자가 요청한 표시를 확인할 수 있습니다.', verify: '화면을 열고 해당 표시를 직접 확인합니다.' };
}

function plan(writeFiles = [HOME]) {
  return { summary: '선택한 기능과 변경 결과를 먼저 검토합니다.', writeFiles, effects: writeFiles.map(file => effect(file)) };
}

async function queued(root, input = {}) {
  return createTask(root, { nodeIds: [HOME], intent: 'behavior', request: '홈 화면을 개선하고 변경 결과를 확인하고 싶어요.', ...input });
}

async function approve(root, task, input = plan()) {
  const proposed = await proposeTask(root, task.id, input);
  return reviewTask(root, task.id, { decision: 'approve', revision: proposed.plan.revision, snapshotId: proposed.plan.snapshotId, source: 'conversation', note: '이 계획의 변경 범위를 확인했습니다.' });
}

async function running(root, input = plan()) {
  const task = await queued(root);
  await approve(root, task, input);
  return updateTask(root, task.id, { status: 'running' });
}

function code(expected) { return error => error.code === expected; }

async function stored(root, task) {
  const file = path.join(root, '.project-map/tasks', task.id + '.json');
  return { file, value: JSON.parse(await fs.readFile(file, 'utf8')) };
}

test('a request cannot start, complete, self-approve, or bypass the visual plan', async t => {
  const { root } = await fixture(t);
  const task = await queued(root);
  assert.equal(task.reviewRequired, true);
  assert.ok(task.baselineEdges.some(edge => edge.kind === 'navigates'));
  assert.equal(task.approval, null);
  await assert.rejects(() => updateTask(root, task.id, { status: 'running' }), code('REVIEW_REQUIRED'));
  await assert.rejects(() => completeTask(root, task.id), code('REVIEW_REQUIRED'));
  await assert.rejects(() => updateTask(root, task.id, { status: 'approved' }), code('INVALID_INPUT'));
  await assert.rejects(() => queued(root, { reviewRequired: false }), code('INVALID_INPUT'));
  await assert.rejects(() => queued(root, { approval: { decision: 'approve' } }), code('INVALID_INPUT'));
  assert.equal((await getTask(root, task.id)).status, 'queued');
});

test('planned new nodes and flow changes appear before approval without altering source files', async t => {
  const { root, map } = await fixture(t);
  const task = await queued(root);
  const newFile = 'app/checkout/page.tsx';
  const proposed = await proposeTask(root, task.id, {
    summary: '홈에서 새 결제 화면으로 이동하는 흐름을 추가합니다.',
    writeFiles: [HOME, newFile], effects: [effect(HOME), effect(newFile)],
    newNodes: [{ id: newFile, label: '결제', kind: 'screen' }],
    flowChanges: [{ source: HOME, target: TASKS, kind: 'navigates', action: 'remove', reason: '기존 버튼 목적지를 바꿉니다.' }, { source: HOME, target: newFile, kind: 'navigates', action: 'add', reason: '결제 화면을 열 수 있게 합니다.' }],
  });
  assert.equal(proposed.status, 'awaiting_review');
  assert.equal(proposed.plan.revision, 1);
  assert.equal(proposed.approval, null);
  assert.ok(!proposed.plan.beforeGraph.nodes.some(node => node.id === newFile));
  assert.ok(proposed.plan.afterGraph.nodes.some(node => node.id === newFile && node.planned && node.kind === 'screen'));
  assert.ok(proposed.plan.beforeGraph.edges.some(edge => edge.target === TASKS && edge.action === 'remove'));
  assert.ok(!proposed.plan.afterGraph.edges.some(edge => edge.source === HOME && edge.target === TASKS && edge.kind === 'navigates'));
  assert.ok(proposed.plan.afterGraph.edges.some(edge => edge.target === newFile && edge.kind === 'navigates' && edge.planned));
  assert.equal((await scanProject(root)).snapshotId, map.snapshotId);
  await assert.rejects(() => fs.stat(path.join(root, newFile)), error => error.code === 'ENOENT');
  await assert.rejects(() => updateTask(root, task.id, { status: 'running' }), code('REVIEW_REQUIRED'));
  assert.equal((await getTask(root, task.id)).plan.afterGraph.nodes.length, proposed.plan.afterGraph.nodes.length);
});

test('approval binds to the latest revision and revision feedback returns the request to the queue', async t => {
  const { root } = await fixture(t);
  const task = await queued(root);
  const first = await proposeTask(root, task.id, plan());
  const revised = await reviewTask(root, task.id, { decision: 'revise', revision: first.plan.revision, snapshotId: first.plan.snapshotId, note: '문구만 바꿔주세요.', source: 'dashboard' });
  assert.equal(revised.status, 'queued');
  assert.equal(revised.lastReview.note, '문구만 바꿔주세요.');
  await assert.rejects(() => updateTask(root, task.id, { status: 'running' }), code('REVIEW_REQUIRED'));
  const second = await proposeTask(root, task.id, { ...plan(), summary: '수정한 문구만 반영합니다.' });
  assert.equal(second.plan.revision, 2);
  await assert.rejects(() => reviewTask(root, task.id, { decision: 'approve', revision: first.plan.revision, snapshotId: first.plan.snapshotId }), code('STALE_PLAN'));
  const approved = await reviewTask(root, task.id, { decision: 'approve', revision: second.plan.revision, snapshotId: second.plan.snapshotId, source: 'dashboard' });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approval.source, 'dashboard');
  const next = await proposeTask(root, task.id, plan([HOME, CARD]));
  assert.equal(next.plan.revision, 3);
  assert.equal(next.approval, null);
  await assert.rejects(() => updateTask(root, task.id, { status: 'running' }), code('REVIEW_REQUIRED'));
});

test('source changes invalidate the initial proposal and a displayed approval preview', async t => {
  const { root } = await fixture(t);
  const stale = await queued(root);
  await fs.appendFile(path.join(root, HOME), '// changed before first proposal\n');
  await assert.rejects(() => proposeTask(root, stale.id, plan()), code('STALE_SNAPSHOT'));
  const task = await queued(root);
  const proposed = await proposeTask(root, task.id, plan());
  await fs.appendFile(path.join(root, CARD), '// changed before review\n');
  await assert.rejects(() => reviewTask(root, task.id, { decision: 'approve', revision: proposed.plan.revision, snapshotId: proposed.plan.snapshotId }), code('STALE_SNAPSHOT'));
  assert.equal((await getTask(root, task.id)).status, 'awaiting_review');
  assert.equal((await getTask(root, task.id)).approval, null);
});

test('started work can be replanned against current sources while retaining the original baseline', async t => {
  const { root } = await fixture(t);
  const task = await running(root);
  await fs.appendFile(path.join(root, HOME), '// first approved change\n');
  await updateTask(root, task.id, { status: 'blocked', note: '공통 카드 수정이 추가로 필요합니다.' });
  await assert.rejects(() => updateTask(root, task.id, { status: 'running' }), code('STALE_SNAPSHOT'));
  const proposed = await proposeTask(root, task.id, plan([HOME, CARD]));
  assert.notEqual(proposed.plan.snapshotId, task.snapshotId);
  assert.equal(proposed.snapshotId, task.snapshotId);
  assert.deepEqual(proposed.baseline, task.baseline);
  assert.equal(proposed.approval, null);
  await assert.rejects(() => completeTask(root, task.id), code('REVIEW_REQUIRED'));
  await reviewTask(root, task.id, { decision: 'approve', revision: proposed.plan.revision, snapshotId: proposed.plan.snapshotId });
  const resumed = await updateTask(root, task.id, { status: 'running' });
  assert.equal(resumed.startedAt, task.startedAt);
  await fs.appendFile(path.join(root, CARD), '// second approved change\n');
  const done = await completeTask(root, task.id, { summary: '최초 요청 이후의 두 변경을 비교했습니다.' });
  assert.deepEqual(new Set(done.result.changes.map(change => change.path)), new Set([HOME, CARD]));
  assert.deepEqual(done.result.outOfScopeFiles, []);
  assert.equal(done.result.beforeSnapshotId, task.snapshotId);
});

test('actual comparisons use approved writeFiles and retain changed nodes in before/after graphs', async t => {
  const { root } = await fixture(t);
  const newFile = 'app/checkout/page.tsx';
  const task = await running(root, { summary: '새 결제 화면을 만들고 사용하지 않는 카드를 제거합니다.', writeFiles: [HOME, CARD, newFile], effects: [effect(HOME), effect(CARD), effect(newFile)], newNodes: [{ id: newFile, label: '결제', kind: 'screen' }], flowChanges: [{ source: HOME, target: newFile, kind: 'navigates', action: 'add', reason: '결제 이동을 추가합니다.' }] });
  assert.ok(!task.impact.writeFiles.includes(CARD));
  await write(root, HOME, 'export default function Home(){ return <a href="/checkout">Checkout</a>; }');
  await write(root, newFile, 'export default function Checkout(){ return <p>Checkout</p>; }');
  await fs.unlink(path.join(root, CARD));
  await fs.appendFile(path.join(root, SETTINGS), '// unrelated edit\n');
  const done = await completeTask(root, task.id, { checks: [{ name: 'build', status: 'passed' }] });
  assert.deepEqual(done.result.outOfScopeFiles, [SETTINGS]);
  assert.ok(done.result.beforeGraph.nodes.some(node => node.id === CARD && node.changeStatus === 'deleted'));
  assert.ok(!done.result.afterGraph.nodes.some(node => node.id === CARD));
  assert.ok(done.result.afterGraph.nodes.some(node => node.id === newFile && node.changeStatus === 'added'));
  assert.ok(done.result.afterGraph.edges.some(edge => edge.source === HOME && edge.target === newFile && edge.kind === 'navigates'));
  assert.ok(done.result.outcomes.every(outcome => outcome.status === 'not_run'), 'a build pass is not evidence that each expected behavior works');
  assert.equal((await getTask(root, task.id)).result.outcomes.length, 3);
});

test('only checks explicitly linked to a planned node determine its outcome', async t => {
  const { root } = await fixture(t);
  const task = await running(root, plan([HOME, CARD]));
  await assert.rejects(() => completeTask(root, task.id, { checks: [{ name: 'unplanned check', status: 'passed', nodeId: SETTINGS }] }), code('INVALID_INPUT'));
  const done = await completeTask(root, task.id, { checks: [{ name: 'build', status: 'passed' }, { name: 'home preview', status: 'passed', nodeId: HOME }, { name: 'card keyboard test', status: 'failed', nodeId: CARD, detail: '버튼 초점을 받지 못했습니다.' }] });
  assert.equal(done.result.outcomes.find(outcome => outcome.nodeId === HOME).status, 'passed');
  assert.equal(done.result.outcomes.find(outcome => outcome.nodeId === CARD).status, 'failed');
  assert.equal(done.verificationStatus, 'failed');
  assert.equal(done.result.changes.length, 0, 'a recorded check need not imply a file modification');
  assert.equal((await getTask(root, task.id)).result.outcomes[0].checks.length, 1);
});

test('incomplete linked checks keep the corresponding expected behavior unverified', async t => {
  const { root } = await fixture(t);
  const task = await running(root);
  const done = await completeTask(root, task.id, { checks: [{ name: 'label visible', status: 'passed', nodeId: HOME }, { name: 'navigation behavior', status: 'not_run', nodeId: HOME }] });
  assert.equal(done.result.outcomes[0].status, 'not_run');
  assert.equal(done.result.outcomes[0].checks.length, 2);
});

test('plan inputs require visible effects, supported paths, and bounded explicit descriptions', async t => {
  const { root } = await fixture(t);
  const task = await queued(root);
  for (const input of [
    { ...plan(), effects: [] },
    { ...plan([HOME, CARD]), effects: [effect(HOME)] },
    { ...plan(), effects: [{ ...effect(HOME), verify: '   ' }] },
    { ...plan(), writeFiles: ['../outside.ts'], effects: [effect('../outside.ts')] },
    { ...plan(), writeFiles: ['.project-map/hidden.ts'], effects: [effect('.project-map/hidden.ts')] },
    { ...plan(), writeFiles: ['src/secrets/password.ts'], effects: [effect('src/secrets/password.ts')] },
    { ...plan(['new.ts']), newNodes: [] },
    { ...plan(), effects: Array.from({ length: 61 }, () => effect(HOME)) },
    { ...plan(), approval: true },
    { ...plan(), flowChanges: [{ source: HOME, target: SETTINGS, kind: 'navigates', action: 'remove', reason: '존재하지 않는 관계 제거' }] },
  ]) await assert.rejects(() => proposeTask(root, task.id, input), code('INVALID_INPUT'));
  assert.equal((await getTask(root, task.id)).status, 'queued');
});

test('planned writes cannot traverse a source symlink, including one substituted after preview', { skip: process.platform === 'win32' }, async t => {
  const { root } = await fixture(t);
  const outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'project-map-outside-')));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(root, 'linked'));
  const task = await queued(root);
  await assert.rejects(() => proposeTask(root, task.id, { ...plan(['linked/new.ts']), newNodes: [{ id: 'linked/new.ts', label: '외부', kind: 'module' }] }), code('INVALID_INPUT'));
  const plannedFile = 'features/new.ts';
  const proposed = await proposeTask(root, task.id, { ...plan([plannedFile]), newNodes: [{ id: plannedFile, label: '새 기능', kind: 'module' }] });
  await fs.symlink(outside, path.join(root, 'features'));
  await assert.rejects(() => getTask(root, task.id), code('INVALID_STATE'));
  await assert.rejects(() => reviewTask(root, task.id, { decision: 'approve', revision: proposed.plan.revision, snapshotId: proposed.plan.snapshotId }), code('INVALID_STATE'));
  assert.deepEqual(await fs.readdir(outside), []);
});

test('persisted plans, approval bindings, and visual graphs reject forged metadata', async t => {
  const { root } = await fixture(t);
  const task = await queued(root);
  await approve(root, task);
  const { file, value } = await stored(root, task);
  for (const mutate of [
    entry => { entry.plan.writeFiles.push(SETTINGS); },
    entry => { entry.plan.afterGraph.nodes[0].files = ['../../outside.ts']; },
    entry => { entry.plan.beforeGraph.edges[0].target = '/etc/passwd'; },
    entry => { entry.plan.effects[0].nodeId = '../outside.ts'; },
    entry => { entry.plan.effects[0].expected = '원래 승인과 다른 결과'; },
    entry => { entry.approval.revision++; },
    entry => { entry.approval.snapshotId = '0'.repeat(32); },
    entry => { entry.approval.source = 'request'; },
    entry => { entry.baselineEdges[0].source = '../outside.ts'; },
  ]) {
    const forged = structuredClone(value); mutate(forged);
    await fs.writeFile(file, JSON.stringify(forged));
    await assert.rejects(() => getTask(root, task.id), code('INVALID_STATE'));
  }
  await fs.writeFile(file, JSON.stringify(value));
  assert.equal((await getTask(root, task.id)).status, 'approved');
});

test('stored outcomes cannot silently claim an expected behavior passed without linked checks', async t => {
  const { root } = await fixture(t);
  const task = await running(root);
  await completeTask(root, task.id, { checks: [{ name: 'build', status: 'passed' }] });
  const { file, value } = await stored(root, task);
  value.result.outcomes[0].status = 'passed';
  await fs.writeFile(file, JSON.stringify(value));
  await assert.rejects(() => getTask(root, task.id), code('INVALID_STATE'));
});

test('legacy queued work requires review while already running and completed records remain readable', async t => {
  const { root } = await fixture(t);
  const waiting = await queued(root), active = await queued(root);
  for (const [task, status] of [[waiting, 'queued'], [active, 'running']]) {
    const { file, value } = await stored(root, task);
    delete value.reviewRequired; delete value.approval; delete value.baselineEdges;
    value.status = status;
    if (status === 'running') value.startedAt = new Date().toISOString();
    await fs.writeFile(file, JSON.stringify(value));
  }
  await assert.rejects(() => updateTask(root, waiting.id, { status: 'running' }), code('REVIEW_REQUIRED'));
  const upgraded = await approve(root, waiting);
  assert.equal(upgraded.reviewRequired, true);
  assert.equal((await updateTask(root, waiting.id, { status: 'running' })).status, 'running');
  const completed = await completeTask(root, active.id, { summary: '기존 실행 중인 작업을 마감합니다.' });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.outcomes, undefined);
  assert.ok(completed.result.warnings.some(warning => /legacy task/.test(warning)));
  const { file, value } = await stored(root, completed);
  delete value.result.beforeGraph; delete value.result.afterGraph;
  await fs.writeFile(file, JSON.stringify(value));
  assert.equal((await getTask(root, completed.id)).status, 'completed');
});

test('follow-up requests reference a completed same-project task and preserve its comparison', async t => {
  const { root } = await fixture(t);
  const parent = await running(root);
  await assert.rejects(() => queued(root, { parentTaskId: parent.id }), code('INVALID_PARENT_TASK'));
  await fs.appendFile(path.join(root, HOME), '// parent change\n');
  const completed = await completeTask(root, parent.id);
  const followUp = await queued(root, { parentTaskId: parent.id, request: '변경한 화면의 문구를 한 번 더 다듬어 주세요.' });
  assert.equal(followUp.parentTaskId, parent.id);
  assert.equal(followUp.snapshotId, completed.result.afterSnapshotId);
  assert.notEqual(followUp.snapshotId, completed.snapshotId);
  assert.equal((await getTask(root, parent.id)).result.changes.length, 1);
  const other = await fixture(t);
  await assert.rejects(() => queued(other.root, { parentTaskId: parent.id }), code('TASK_NOT_FOUND'));
});

test('navigation neighbors are verification candidates without becoming imported source context', async t => {
  const { map } = await fixture(t);
  const display = analyzeImpact(map, { nodeIds: [HOME], intent: 'display' });
  const behavior = analyzeImpact(map, { nodeIds: [HOME], intent: 'behavior' });
  assert.ok(display.readNodes.includes(CARD));
  assert.ok(!display.readNodes.includes(TASKS));
  assert.ok(!display.verifyNodes.includes(TASKS));
  assert.ok(!behavior.readNodes.includes(TASKS));
  assert.ok(behavior.verifyNodes.includes(TASKS));
  assert.ok(!behavior.writeNodes.includes(TASKS));
  assert.ok(behavior.reasons.some(reason => /화면 이동/.test(reason)));
});

test('replanning keeps only five historical summaries and always clears approval', async t => {
  const { root } = await fixture(t);
  const task = await queued(root);
  let current;
  for (let revision = 1; revision <= 7; revision++) current = await proposeTask(root, task.id, { ...plan(), summary: '검토할 계획 ' + revision });
  assert.equal(current.plan.revision, 7);
  assert.equal(current.planHistory.length, 5);
  assert.deepEqual(current.planHistory.map(entry => entry.revision), [2, 3, 4, 5, 6]);
  assert.ok(current.planHistory.every(entry => !Object.hasOwn(entry, 'beforeGraph')));
  assert.equal(current.approval, null);
  assert.equal((await getTask(root, task.id)).planHistory.length, 5);
});

test('an already satisfied request can use a verification-only plan without inventing file changes', async t => {
  const { root, map } = await fixture(t);
  const task = await running(root, { summary: '요청한 표시가 이미 있어 코드 변경 없이 동작을 확인합니다.', writeFiles: [], effects: [effect(HOME, '기존 화면이 요청을 이미 충족하므로 변경하지 않습니다.')] });
  assert.deepEqual(task.plan.writeFiles, []);
  assert.ok(task.plan.afterGraph.nodes.every(node => !node.planned));
  const done = await completeTask(root, task.id, { summary: '기존 표시를 확인했습니다.', checks: [{ name: '기존 화면 확인', status: 'passed', nodeId: HOME }] });
  assert.deepEqual(done.result.changes, []);
  assert.deepEqual(done.result.outOfScopeFiles, []);
  assert.equal(done.result.outcomes[0].status, 'passed');
  assert.equal(done.result.afterSnapshotId, map.snapshotId);
  assert.equal((await getTask(root, task.id)).status, 'completed');
});

test('a removal preview marks the original node and can show an empty expected graph', async t => {
  const { root } = await fixture(t);
  for (const file of [TASKS, SETTINGS, CARD]) await fs.unlink(path.join(root, file));
  await write(root, HOME, 'export default function Home(){ return <p>Retired screen</p>; }');
  const task = await queued(root);
  const proposed = await proposeTask(root, task.id, { ...plan(), summary: '사용하지 않는 화면을 제거합니다.', removeNodeIds: [HOME] });
  assert.deepEqual(proposed.plan.removeNodeIds, [HOME]);
  assert.ok(proposed.plan.beforeGraph.nodes.some(node => node.id === HOME && node.planned && node.action === 'remove'));
  assert.deepEqual(proposed.plan.afterGraph.nodes, []);
  assert.deepEqual(proposed.plan.afterGraph.edges, []);
  await assert.rejects(() => proposeTask(root, task.id, { ...plan([]), effects: [effect(HOME)], removeNodeIds: [HOME] }), code('INVALID_INPUT'));
  await reviewTask(root, task.id, { decision: 'approve', revision: proposed.plan.revision, snapshotId: proposed.plan.snapshotId });
  await updateTask(root, task.id, { status: 'running' });
  await fs.unlink(path.join(root, HOME));
  const done = await completeTask(root, task.id);
  assert.equal(done.result.changes[0].status, 'deleted');
  assert.deepEqual(done.result.outOfScopeFiles, []);
  assert.deepEqual(done.result.afterGraph.nodes, []);
  assert.equal(done.result.outcomes[0].status, 'not_run');
  assert.equal((await getTask(root, task.id)).status, 'completed');
});

test('a reviewed deletion continues through replanning without reviving the removed node', async t => {
  const { root } = await fixture(t);
  const task = await queued(root, { nodeIds: [HOME, TASKS] });
  const deletion = { ...plan([HOME, TASKS]), summary: '기존 작업 화면을 제거하고 홈을 정리합니다.', removeNodeIds: [TASKS] };
  await approve(root, task, deletion);
  const started = await updateTask(root, task.id, { status: 'running' });
  await fs.unlink(path.join(root, TASKS));
  await updateTask(root, task.id, { status: 'blocked' });
  const proposed = await proposeTask(root, task.id, { ...deletion, summary: '삭제를 유지하면서 홈 표시를 다시 검토합니다.' });
  assert.equal(proposed.status, 'awaiting_review');
  assert.equal(proposed.approval, null);
  assert.deepEqual(proposed.plan.alreadyRemovedNodeIds, [TASKS]);
  assert.notEqual(proposed.plan.snapshotId, task.snapshotId);
  assert.deepEqual(proposed.baseline, task.baseline);
  for (const graph of [proposed.plan.beforeGraph, proposed.plan.afterGraph]) {
    assert.ok(!graph.nodes.some(node => node.id === TASKS));
    assert.ok(!graph.edges.some(edge => edge.source === TASKS || edge.target === TASKS));
  }
  assert.equal((await getTask(root, task.id)).plan.alreadyRemovedNodeIds[0], TASKS);
  await assert.rejects(() => proposeTask(root, task.id, { ...deletion, removeNodeIds: [] }), code('INVALID_INPUT'));
  await reviewTask(root, task.id, { decision: 'revise', revision: proposed.plan.revision, snapshotId: proposed.plan.snapshotId, note: '삭제 상태를 유지합니다.' });
  const revised = await proposeTask(root, task.id, { ...deletion, summary: '삭제 후 남은 홈 표시만 정리합니다.' });
  assert.deepEqual(revised.plan.alreadyRemovedNodeIds, [TASKS]);
  assert.ok(!revised.plan.afterGraph.nodes.some(node => node.id === TASKS));
  await reviewTask(root, task.id, { decision: 'approve', revision: revised.plan.revision, snapshotId: revised.plan.snapshotId });
  assert.equal((await updateTask(root, task.id, { status: 'running' })).startedAt, started.startedAt);
  const done = await completeTask(root, task.id);
  assert.equal(done.result.beforeSnapshotId, task.snapshotId);
  assert.deepEqual(done.result.changes.map(change => [change.path, change.status, change.outOfScope]), [[TASKS, 'deleted', false]]);
  assert.ok(done.result.beforeGraph.nodes.some(node => node.id === TASKS && node.changeStatus === 'deleted'));
  assert.ok(!done.result.afterGraph.nodes.some(node => node.id === TASKS));
  assert.deepEqual(done.result.outOfScopeFiles, []);
  assert.equal((await getTask(root, task.id)).status, 'completed');
});

test('deletion continuation cannot authorize an unrelated missing node or a skipped existing file', async t => {
  const { root } = await fixture(t);
  const task = await running(root, { ...plan([HOME, TASKS]), removeNodeIds: [TASKS] });
  await fs.unlink(path.join(root, SETTINGS));
  await assert.rejects(() => proposeTask(root, task.id, { ...plan([HOME, SETTINGS]), removeNodeIds: [SETTINGS] }), code('INVALID_INPUT'));
  await write(root, TASKS, 'x'.repeat(512 * 1024 + 1));
  await assert.rejects(() => proposeTask(root, task.id, { ...plan([HOME, TASKS]), removeNodeIds: [TASKS] }), error => error.code === 'INVALID_INPUT' && /still exists/.test(error.message));
  assert.equal((await getTask(root, task.id)).status, 'running');
});
