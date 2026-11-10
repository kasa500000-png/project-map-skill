import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillRoot = process.env.PROJECT_MAP_SKILL || fileURLToPath(new URL('../skills/project-map', import.meta.url));
const { startServer } = await import(pathToFileURL(path.join(skillRoot, 'scripts/lib/server.mjs')));

function request(url, { method = 'GET', headers = {}, json, raw } = {}) {
  const body = json !== undefined ? JSON.stringify(json) : raw;
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, agent: false, headers: { Connection: 'close', ...(body !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}), ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let value;
        try { value = JSON.parse(text); } catch { value = null; }
        resolve({ status: res.statusCode, headers: res.headers, text, value });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Local test request timed out.')));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function fixture(t, beforeStart) {
  const arena = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'project-map-server-')));
  const root = path.join(arena, 'project');
  await fs.mkdir(path.join(root, 'app/tasks'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'server-fixture' }));
  await fs.writeFile(path.join(root, 'app/tasks/page.tsx'), 'export default function Tasks(){return null;}\n');
  let instance;
  t.after(async () => { if (instance) await instance.close(); await fs.rm(arena, { recursive: true, force: true }); });
  if (beforeStart) await beforeStart({ arena, root });
  instance = await startServer({ projectRoot: root });
  const session = await request(`${instance.url}/api/session`);
  assert.equal(session.status, 200);
  const token = session.value.token;
  const auth = { 'X-Project-Map-Token': token };
  return { arena, root, instance, url: instance.url, token, auth };
}

test('server binds loopback, serves only its assets, and applies local-response headers', async t => {
  const { instance, url } = await fixture(t);
  assert.equal(instance.server.address().address, '127.0.0.1');
  for (const [route, contentType] of [['/', 'text/html'], ['/app.js', 'text/javascript'], ['/styles.css', 'text/css']]) {
    const response = await request(`${url}${route}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers['content-type'].startsWith(contentType));
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.ok(response.headers['content-security-policy'].includes("frame-ancestors 'none'"));
  }
  assert.equal((await request(`${url}/healthz`)).value.ok, true);
  assert.equal((await request(`${url}/package.json`)).status, 404);
  assert.equal((await request(`${url}/scripts/lib/core.mjs`)).status, 404);
});

test('unrecognized hosts, cross-origin requests, and cross-site fetches are rejected', async t => {
  const { url } = await fixture(t);
  for (const [headers, expected] of [
    [{ Host: 'attacker.example' }, 'FORBIDDEN_HOST'],
    [{ Origin: 'https://attacker.example' }, 'FORBIDDEN_ORIGIN'],
    [{ 'Sec-Fetch-Site': 'cross-site' }, 'FORBIDDEN_ORIGIN'],
    [{ 'Sec-Fetch-Site': 'same-site' }, 'FORBIDDEN_ORIGIN'],
  ]) {
    const response = await request(`${url}/api/session`, { headers });
    assert.equal(response.status, 403);
    assert.equal(response.value.error, expected);
  }
  assert.equal((await request(`${url}/api/map`, { headers: { Origin: url, 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
});

test('mutations require the local token and reject Unicode lookalikes without crashing', async t => {
  const { url, auth, token } = await fixture(t);
  assert.match(token, /^[0-9a-f]{64}$/);
  for (const headers of [{}, { 'X-Project-Map-Token': 'wrong' }, { 'X-Project-Map-Token': 'é'.repeat(64) }]) {
    const response = await request(`${url}/api/refresh`, { method: 'POST', headers, json: {} });
    assert.equal(response.status, 403);
    assert.equal(response.value.error, 'INVALID_SESSION');
  }
  assert.equal((await request(`${url}/api/refresh`, { method: 'POST', headers: auth, json: {} })).status, 200);
  assert.equal((await request(`${url}/healthz`)).status, 200);
});

test('request validation rejects wrong content types and malformed or non-object JSON', async t => {
  const { url, auth } = await fixture(t);
  assert.equal((await request(`${url}/api/refresh`, { method: 'POST', headers: { ...auth, 'Content-Type': 'text/plain' }, raw: '{}' })).status, 415);
  for (const raw of ['{', '[]', 'null']) {
    const response = await request(`${url}/api/refresh`, { method: 'POST', headers: auth, raw });
    assert.equal(response.status, 400);
  }
  assert.equal((await request(`${url}/api/tasks`)).value.tasks.length, 0);
});

test('Unicode requests persist as queued tasks and API summaries omit large baselines', async t => {
  const { url, auth } = await fixture(t);
  const map = (await request(`${url}/api/map`)).value;
  const input = { nodeIds: ['app/tasks/page.tsx'], intent: 'display', request: '작업 목록을 읽기 쉽게 정리해줘. 🚢', snapshotId: map.snapshotId };
  const impact = await request(`${url}/api/impact`, { method: 'POST', headers: auth, json: input });
  assert.equal(impact.status, 200);
  assert.deepEqual(impact.value.writeFiles, ['app/tasks/page.tsx']);
  const created = await request(`${url}/api/tasks`, { method: 'POST', headers: auth, json: input });
  assert.equal(created.status, 201);
  assert.equal(created.value.request, input.request);
  assert.equal(created.value.status, 'queued');
  assert.equal(created.value.baseline, undefined);
  assert.equal(created.value.baselineNodes, undefined);
  const detail = await request(`${url}/api/tasks/${created.value.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.value.id, created.value.id);
  const tasks = (await request(`${url}/api/tasks`)).value.tasks;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].baseline, undefined);
  const changes = (await request(`${url}/api/changes?task=${created.value.id}`)).value;
  assert.equal(changes.status, 'queued');
  assert.equal(changes.result, null, 'queueing must not claim execution or verification');
});

test('a stale displayed map cannot queue work and refresh exposes the new snapshot', async t => {
  const { root, url, auth } = await fixture(t);
  const oldMap = (await request(`${url}/api/map`)).value;
  await fs.appendFile(path.join(root, 'app/tasks/page.tsx'), '// changed after display\n');
  const rejected = await request(`${url}/api/tasks`, { method: 'POST', headers: auth, json: { nodeIds: ['app/tasks/page.tsx'], intent: 'display', request: '정리해줘', snapshotId: oldMap.snapshotId } });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.value.error, 'STALE_SNAPSHOT');
  assert.equal((await request(`${url}/api/tasks`)).value.tasks.length, 0);
  const refreshed = await request(`${url}/api/refresh`, { method: 'POST', headers: auth, json: {} });
  assert.equal(refreshed.status, 200);
  assert.notEqual(refreshed.value.snapshotId, oldMap.snapshotId);
  assert.equal((await request(`${url}/api/map`)).value.snapshotId, refreshed.value.snapshotId);
});

test('routes use exact endpoints and expose no HTTP code-execution operation', async t => {
  const { url, auth } = await fixture(t);
  assert.equal((await request(`${url}/api/map/extra`)).status, 404);
  assert.equal((await request(`${url}/api/refresh/extra`, { method: 'POST', headers: auth, json: {} })).status, 404);
  assert.equal((await request(`${url}/api/tasks/fake/start`, { method: 'POST', headers: auth, json: {} })).status, 404);
  assert.equal((await request(`${url}/api/execute`, { method: 'POST', headers: auth, json: { command: 'echo forbidden' } })).status, 404);
  assert.equal((await request(`${url}/api/tasks`, { method: 'DELETE' })).status, 405);
  assert.equal((await request(`${url}/api/tasks/not-a-task`)).status, 400);
  assert.equal((await request(`${url}/api/changes?task=..%2F..%2Foutside`)).status, 400);
});

test('startup atomically replaces a metadata symlink without modifying its target', { skip: process.platform === 'win32' }, async t => {
  let outside;
  const { root, instance } = await fixture(t, async ({ arena, root: project }) => {
    outside = path.join(arena, 'outside.json');
    await fs.writeFile(outside, 'DO_NOT_CHANGE');
    await fs.mkdir(path.join(project, '.project-map'));
    await fs.symlink(outside, path.join(project, '.project-map/server.json'));
  });
  assert.equal(await fs.readFile(outside, 'utf8'), 'DO_NOT_CHANGE');
  const infoPath = path.join(root, '.project-map/server.json');
  assert.equal((await fs.lstat(infoPath)).isSymbolicLink(), false);
  assert.equal(JSON.parse(await fs.readFile(infoPath, 'utf8')).url, instance.url);
});

test('shutdown never follows or deletes a replacement metadata symlink', { skip: process.platform === 'win32' }, async t => {
  const { arena, root, instance } = await fixture(t);
  const outside = path.join(arena, 'outside.json');
  await fs.writeFile(outside, JSON.stringify({ pid: process.pid, url: instance.url, keep: true }));
  const infoPath = path.join(root, '.project-map/server.json');
  await fs.unlink(infoPath);
  await fs.symlink(outside, infoPath);
  await instance.close();
  assert.equal((await fs.lstat(infoPath)).isSymbolicLink(), true);
  assert.equal(JSON.parse(await fs.readFile(outside, 'utf8')).keep, true);
});
