import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import * as w from '../skills/project-map/scripts/lib/core.mjs';
import { executionStatus } from '../skills/project-map/scripts/lib/task-lock.mjs';
import { compareScopes } from '../skills/project-map/scripts/lib/efficiency.mjs';
import { CodexBridge } from '../skills/project-map/scripts/lib/codex-bridge.mjs';

const HOME = 'app/page.tsx';
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pm-reliable-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'app'), { recursive: true });
  await fs.writeFile(path.join(root, HOME), 'export default function Home(){return null;}');
  return root;
}
async function approved(root, options = {}) {
  const map = await w.scanProject(root, options);
  const task = await w.createTask(root, { nodeIds: [HOME], request: '제목 수정', snapshotId: map.snapshotId }, options);
  const planned = await w.proposeTask(root, task.id, { summary: '제목 표시', writeFiles: [HOME], effects: [{ nodeId: HOME, change: '제목', expected: '표시됨', verify: '화면 확인' }] }, options);
  return w.reviewTask(root, task.id, { decision: 'approve', revision: planned.plan.revision, snapshotId: planned.plan.snapshotId }, options);
}
async function running(root) { const a = await approved(root); return w.updateTask(root, a.id, { status: 'running' }); }
async function receipt(root, task, code, name = 'title') {
  return w.recordEvidence(root, task, { kind: 'check', name, nodeId: HOME, argv: [process.execPath, '-e', `process.exit(${code})`] });
}

test('R1: a real failure cannot be overwritten by an AI passed report', async t => {
  const root = await fixture(t), task = await running(root);
  const evidence = await receipt(root, task, 1);
  const done = await w.completeTask(root, task.id, { checks: [{ name: 'title', nodeId: HOME, status: 'passed' }] });
  assert.equal(done.verificationStatus, 'failed');
  assert.equal(done.result.outcomes[0].status, 'failed');
  assert.equal(done.checks[0].evidenceId, evidence.id);
  assert.equal(done.checks[0].source, 'tool');
  assert.equal((await w.getTask(root, task.id)).verificationStatus, 'failed');
});
test('a generic test never proves an unverified feature', async t => {
  const root = await fixture(t), task = await running(root);
  await w.recordEvidence(root, task, { kind: 'check', name: 'build', argv: [process.execPath, '-e', 'process.exit(0)'] });
  const done = await w.completeTask(root, task.id, { checks: [{ name: 'looks good', nodeId: HOME, status: 'passed', source: 'tool' }] });
  assert.equal(done.result.outcomes[0].status, 'not_run');
  assert.equal(done.verificationStatus, 'not_run');
  assert.equal(done.checks.find(c => c.name === 'looks good').source, 'agent');
});
test('latest current rerun of the same linked check resolves an earlier failure', async t => {
  const root = await fixture(t), task = await running(root);
  await receipt(root, task, 1); const latest = await receipt(root, task, 0);
  const done = await w.completeTask(root, task.id);
  assert.equal(done.verificationStatus, 'passed');
  assert.equal(done.checks[0].evidenceId, latest.id);
});
test('different failed checks are not hidden by an unrelated successful check', async t => {
  const root = await fixture(t), task = await running(root);
  await receipt(root, task, 1, 'required behavior'); await receipt(root, task, 0, 'another check');
  assert.equal((await w.completeTask(root, task.id)).verificationStatus, 'failed');
});
test('changed content makes execution evidence unverified', async t => {
  const root = await fixture(t), task = await running(root);
  await receipt(root, task, 0); await fs.appendFile(path.join(root, HOME), '// later edit');
  assert.equal((await w.completeTask(root, task.id)).verificationStatus, 'not_run');
});
test('R2: failed finalization is not completed and retry repairs mandatory metadata', async t => {
  const root = await fixture(t), task = await running(root);
  await fs.writeFile(path.join(root, HOME), '// too large\n' + 'a'.repeat(20 * 1024 * 1024));
  await assert.rejects(() => w.completeTask(root, task.id, { summary: 'retain this summary' }));
  const failed = await w.getTask(root, task.id);
  assert.equal(failed.status, 'finalization_failed');
  assert.equal(failed.completedAt, undefined);
  assert.equal((await executionStatus(root)).taskId, task.id);
  await fs.writeFile(path.join(root, HOME), '// valid size\nexport default function Home(){return null;}');
  const done = await w.completeTask(root, task.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.result.summary, 'retain this summary');
  assert.ok(done.experience.safety.checkpoint.sealedAt);
  assert.ok(done.experience.assurance.audit);
  assert.equal(await executionStatus(root), null);
});
test('finalization supports files growing past the previous 2MB limit', async t => {
  const root = await fixture(t), task = await running(root);
  await fs.writeFile(path.join(root, HOME), '// large\n' + 'x'.repeat(3 * 1024 * 1024));
  const done = await w.completeTask(root, task.id);
  assert.equal(done.status, 'completed'); assert.ok(done.experience.safety.checkpoint.sealedAt);
});
test('completed retries do not relabel later edits as this task', async t => {
  const root = await fixture(t), task = await running(root);
  const first = await w.completeTask(root, task.id);
  await fs.appendFile(path.join(root, HOME), '// unrelated later edit');
  const second = await w.completeTask(root, task.id);
  assert.deepEqual(second.result, first.result);
  assert.deepEqual(second.experience.assurance.audit, first.experience.assurance.audit);
});
test('R3: duplicate or overlapping starts are refused, even with different state directories', async t => {
  const root = await fixture(t), first = await approved(root), second = await approved(root, { stateDir: '.agents/other-state' });
  await w.updateTask(root, first.id, { status: 'running' });
  await assert.rejects(() => w.updateTask(root, first.id, { status: 'running' }), e => e.code === 'ALREADY_RUNNING');
  await assert.rejects(() => w.updateTask(root, second.id, { status: 'running' }, { stateDir: '.agents/other-state' }), e => e.code === 'PROJECT_IN_USE');
  assert.equal((await w.getTask(root, second.id, { stateDir: '.agents/other-state' })).status, 'approved');
  await w.updateTask(root, first.id, { status: 'blocked' });
  assert.equal((await w.updateTask(root, second.id, { status: 'running' }, { stateDir: '.agents/other-state' })).status, 'running');
});
test('concurrent CLI processes cannot both acquire execution', async t => {
  const root = await fixture(t), a = await approved(root), b = await approved(root);
  const cli = new URL('../skills/project-map/scripts/project-map.mjs', import.meta.url).pathname;
  const start = id => new Promise(resolve => {
    const child = spawn(process.execPath, [cli, 'start', '--project', root, '--id', id], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; child.stderr.on('data', b => out += b); child.on('close', code => resolve({ code, out }));
  });
  const result = await Promise.all([start(a.id), start(b.id)]);
  assert.equal(result.filter(r => r.code === 0).length, 1);
  assert.match(result.find(r => r.code !== 0).out, /PROJECT_BUSY|PROJECT_IN_USE/);
});
test('R4: indirect write/read conflict includes transitively referenced modules', () => {
  const map = { snapshotId: 'same', files: [], coverage: {}, edges: [{ source: HOME, target: 'middle.ts', kind: 'imports' }, { source: 'middle.ts', target: 'leaf.ts', kind: 'imports' }] };
  const a = { plan: { snapshotId: 'same', writeFiles: [HOME] }, impact: { readFiles: ['middle.ts'] } };
  const b = { plan: { snapshotId: 'same', writeFiles: ['leaf.ts'] }, impact: { readFiles: [] } };
  assert.equal(compareScopes(a, b, map).status, 'conflict');
});
test('R7: needs_review, needs_input, failure and missing dispositions never call completion', async () => {
  for (const outcome of ['needs_review','needs_input','failed','cancelled',undefined]) {
    const actions = [];
    const bridge = new CodexBridge({ root: '/tmp', handlers: { block: async () => actions.push('block'), complete: async () => actions.push('complete') } });
    bridge.active = { taskId: 'synthetic', phase: 'execute', threadId: 'thread', turnId: 'turn', status: 'running', text: JSON.stringify({ outcome, summary: '승인 범위를 확대해야 해서 중단했습니다.', checks: [] }) };
    await bridge.message({ method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'completed' } } });
    assert.deepEqual(actions, ['block']); assert.equal(bridge.active, null); assert.notEqual(bridge.last.status, 'completed');
  }
});
