import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildFeatureMap, resolveSelection, suggestIntent } from '../skills/project-map/scripts/lib/feature-map.mjs';
import * as workspace from '../skills/project-map/scripts/lib/workspace.mjs';
import { startServer } from '../skills/project-map/scripts/lib/server.mjs';
const model = {
  nodes: [
    { id: 'app/page.tsx', label: '홈', kind: 'screen', files: ['app/page.tsx'] },
    { id: 'app/report/page.tsx', label: '리포트', kind: 'screen', files: ['app/report/page.tsx'] },
    { id: 'components/Card.tsx', label: '카드', kind: 'component', files: ['components/Card.tsx'] },
    { id: 'lib/save.ts', label: '저장', kind: 'module', files: ['lib/save.ts'] }
  ],
  edges: [
    { source: 'app/page.tsx', target: 'components/Card.tsx', kind: 'imports' },
    { source: 'app/report/page.tsx', target: 'components/Card.tsx', kind: 'imports' },
    { source: 'components/Card.tsx', target: 'lib/save.ts', kind: 'imports' },
    { source: 'app/page.tsx', target: 'app/report/page.tsx', kind: 'navigates' }
  ]
};
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pm-feature-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'app/report'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/page.tsx'), 'export default function Home(){return <a href="/report">Report</a>;}');
  await fs.writeFile(path.join(root, 'app/report/page.tsx'), 'export default function Report(){return null;}');
  return root;
}
test('features group source files and retain shared membership without inventing navigation', () => {
  const graph = buildFeatureMap(model), home = graph.nodes.find(n => n.label === '홈');
  assert.deepEqual(home.files, ['app/page.tsx', 'components/Card.tsx', 'lib/save.ts']);
  assert.equal(graph.nodes.filter(n => n.kind === 'feature').length, 2);
  assert.equal(graph.nodes.filter(n => n.kind === 'shared').length, 2);
  assert.equal(graph.edges.filter(e => e.kind === 'navigates').length, 1);
  assert.equal(graph.edges.filter(e => e.kind === 'uses').length, 4);
});
test('configured features can share files and retain explicit names', () => {
  const graph = buildFeatureMap(model, { features: [{ id: 'report-save', label: '리포트 저장', entries: ['app/report/page.tsx'], files: ['lib/save.ts'] }], featureLabels: { 'feature:app/page.tsx': '내 홈' } });
  assert.ok(graph.nodes.some(n => n.id === 'feature:custom:report-save' && n.label === '리포트 저장'));
  assert.ok(graph.nodes.some(n => n.label === '내 홈'));
  assert.ok(!graph.nodes.some(n => n.id === 'feature:app/report/page.tsx'));
});
test('invalid feature groups and unknown source paths are never trusted', () => {
  const graph = buildFeatureMap(model, { features: [{ id: '../../x', entries: ['/etc/passwd'], label: 'bad' }, { id: 'missing', entries: ['missing.ts'], label: 'bad' }] });
  assert.equal(graph.warnings.length, 2); assert.ok(!JSON.stringify(graph).includes('/etc/passwd'));
});
test('selecting a feature targets entry files, not all shared dependencies', () => {
  const map = { ...model, featureGraph: buildFeatureMap(model) };
  const resolved = resolveSelection(map, { featureIds: ['feature:app/page.tsx'] });
  assert.deepEqual(resolved.nodeIds, ['app/page.tsx']);
  assert.throws(() => resolveSelection(map, { featureIds: ['unknown'] }));
  assert.throws(() => resolveSelection(map, { featureIds: [] }));
});
test('intent suggestion is only a coarse hint', () => {
  assert.equal(suggestIntent('제목 문구 변경'), 'display');
  assert.equal(suggestIntent('로그인 권한 수정'), 'contract');
  assert.equal(suggestIntent('버튼을 눌러 이동'), 'behavior');
});
test('renaming persists while preserving existing config and invalidating snapshots', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'project-map.config.json'), JSON.stringify({ name: '내 앱', descriptions: { keep: 'preserve' } }));
  const before = await workspace.scanProject(root);
  const changed = await workspace.workspaceRoute(root, '/api/features/rename', { id: 'feature:app/page.tsx', label: '첫 화면', snapshotId: before.snapshotId });
  assert.notEqual(changed.value.snapshotId, before.snapshotId);
  assert.equal((await workspace.scanProject(root)).featureGraph.nodes.find(n => n.id === 'feature:app/page.tsx').label, '첫 화면');
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'project-map.config.json'))).descriptions.keep, 'preserve');
  await assert.rejects(() => workspace.workspaceRoute(root, '/api/features/rename', { id: 'feature:app/page.tsx', label: 'x', snapshotId: before.snapshotId }), e => e.statusCode === 409);
});
test('feature-based HTTP requests enter the existing review lifecycle', async t => {
  const root = await fixture(t), server = await startServer({ projectRoot: root }); t.after(() => server.close());
  const get = async p => (await fetch(server.url + p)).json();
  const { token } = await get('/api/session'), map = await get('/api/map');
  const post = (p, body) => fetch(server.url + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Project-Map-Token': token }, body: JSON.stringify(body) });
  assert.match(await (await fetch(server.url)).text(), /workbench.js/);
  assert.match(await (await fetch(server.url + '/legacy')).text(), /app.js/);
  const response = await post('/api/tasks', { featureIds: ['feature:app/page.tsx'], intent: 'auto', request: '제목 문구 수정', snapshotId: map.snapshotId });
  assert.equal(response.status, 201);
  const task = await response.json(); assert.equal(task.intent, 'display'); assert.equal(task.status, 'queued'); assert.ok(task.experience);
  await assert.rejects(() => workspace.updateTask(root, task.id, { status: 'running' }), e => e.code === 'REVIEW_REQUIRED');
});
test('configuration symlinks are refused', { skip: process.platform === 'win32' }, async t => {
  const root = await fixture(t); await fs.writeFile(path.join(root, 'outside.json'), '{}');
  await fs.symlink(path.join(root, 'outside.json'), path.join(root, 'project-map.config.json'));
  await assert.rejects(() => workspace.scanProject(root), /설정 파일/);
});
