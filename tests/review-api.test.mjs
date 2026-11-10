import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillRoot = process.env.PROJECT_MAP_SKILL || fileURLToPath(new URL('../skills/project-map', import.meta.url));
const { startServer } = await import(pathToFileURL(path.join(skillRoot, 'scripts/lib/server.mjs')));
const { proposeTask, updateTask, completeTask } = await import(pathToFileURL(path.join(skillRoot, 'scripts/lib/core.mjs')));

async function workspace(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'project-map-review-')));
  await fs.mkdir(path.join(root, 'app'));
  await fs.writeFile(path.join(root, 'app/page.tsx'), 'export default function Home(){return <h1>Home</h1>;}\n');
  const server = await startServer({ projectRoot: root });
  t.after(async () => { await server.close(); await fs.rm(root, { recursive: true, force: true }); });
  const { token } = await (await fetch(`${server.url}/api/session`)).json();
  async function api(route, input, headers = {}) {
    const response = await fetch(server.url + route, input === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-project-map-token': token, ...headers }, body: JSON.stringify(input) });
    return { status: response.status, value: await response.json() };
  }
  const map = (await api('/api/map')).value;
  const task = (await api('/api/tasks', { nodeIds: ['app/page.tsx'], intent: 'display', request: '홈 제목을 분명하게 보여줘.', snapshotId: map.snapshotId })).value;
  const plan = { summary: '홈 제목을 정리합니다.', writeFiles: ['app/page.tsx'], effects: [{ nodeId: 'app/page.tsx', change: '제목 표시 개선', expected: '상단에서 제목을 읽을 수 있음', verify: '실행 화면에서 제목 확인' }] };
  return { root, api, task, plan };
}

test('dashboard reviews the exact Codex plan and preserves distinct expected and actual results', async t => {
  const { root, api, task, plan } = await workspace(t);
  const proposed = await proposeTask(root, task.id, plan);
  const loaded = (await api(`/api/tasks/${task.id}`)).value;
  assert.equal(loaded.status, 'awaiting_review');
  assert.equal(loaded.baseline, undefined);
  assert.equal(loaded.baselineNodes, undefined);
  assert.equal(loaded.baselineEdges, undefined);
  assert.ok(loaded.plan.beforeGraph.nodes.length);
  assert.ok(loaded.plan.afterGraph.nodes.length);
  const review = { decision: 'approve', revision: proposed.plan.revision, snapshotId: proposed.plan.snapshotId };
  assert.equal((await api(`/api/tasks/${task.id}/review`, review, { 'x-project-map-token': 'wrong' })).status, 403);
  assert.equal((await api(`/api/tasks/${task.id}/review`, { ...review, revision: review.revision + 1 })).status, 409);
  const approved = await api(`/api/tasks/${task.id}/review`, { ...review, source: 'conversation' });
  assert.equal(approved.status, 200);
  assert.equal(approved.value.status, 'approved');
  assert.equal(approved.value.approval.source, 'dashboard');
  await updateTask(root, task.id, { status: 'running' });
  await fs.writeFile(path.join(root, 'app/page.tsx'), 'export default function Home(){return <h1>내 작업 홈</h1>;}\n');
  await completeTask(root, task.id, { summary: '제목 변경', checks: [{ name: '소스 변경 확인', status: 'passed' }] });
  const comparison = (await api(`/api/changes?task=${task.id}`)).value;
  assert.equal(comparison.status, 'completed');
  assert.equal(comparison.plan.revision, review.revision);
  assert.ok(comparison.result.beforeGraph.nodes.length);
  assert.ok(comparison.result.afterGraph.nodes.length);
  assert.equal(comparison.result.outcomes[0].status, 'not_run', 'unlinked source checks do not prove the feature expectation');
  const freshMap = (await api('/api/map')).value;
  const followup = await api('/api/tasks', { nodeIds: ['app/page.tsx'], intent: 'display', request: '같은 화면의 안내도 개선해줘.', snapshotId: freshMap.snapshotId, parentTaskId: task.id });
  assert.equal(followup.status, 201);
  assert.equal(followup.value.parentTaskId, task.id);
  assert.equal(followup.value.status, 'queued');
  assert.notEqual(followup.value.snapshotId, task.snapshotId);
});

test('revision feedback clears approval and an earlier review cannot approve the replacement plan', async t => {
  const { root, api, task, plan } = await workspace(t);
  const first = await proposeTask(root, task.id, plan);
  const old = { revision: first.plan.revision, snapshotId: first.plan.snapshotId };
  const revised = await api(`/api/tasks/${task.id}/review`, { ...old, decision: 'revise', note: '제목은 유지하고 설명만 바꿔주세요.' });
  assert.equal(revised.status, 200);
  assert.equal(revised.value.status, 'queued');
  assert.ok(!revised.value.approval);
  const second = await proposeTask(root, task.id, { ...plan, summary: '피드백을 반영한 설명 변경' });
  assert.ok(second.plan.revision > first.plan.revision);
  assert.equal((await api(`/api/tasks/${task.id}/review`, { ...old, decision: 'approve' })).status, 409);
  assert.equal((await api(`/api/tasks/${task.id}`)).value.status, 'awaiting_review');
});
