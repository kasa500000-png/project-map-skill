import test from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

// Exercise the shipped browser event handlers against the real local HTTP API.
// This deliberately small DOM adapter has no CSS layout, paint, or accessibility
// tree engine. Passing this test is not evidence of browser rendering quality.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.resolve(
  process.env.PROJECT_MAP_SKILL || path.join(repositoryRoot, 'skills', 'project-map'),
);

class Element {
  constructor(tag) {
    this.tagName = tag.toLowerCase();
    this.attrs = {};
    this.dataset = {};
    this.children = [];
    this.parentElement = null;
    this._text = '';
    this.listeners = {};
    this.style = {};
    this.hidden = false;
    this.checked = false;
    this.disabled = false;
    this._value = undefined;
  }

  get textContent() {
    return this._text + this.children.map(node => node.textContent).join('');
  }

  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }

  get className() { return this.attrs.class || ''; }
  set className(value) { this.attrs.class = String(value); }
  get id() { return this.attrs.id || ''; }

  get value() {
    if (this._value !== undefined) return this._value;
    if (this.tagName === 'select') {
      return this.children.find(child => child.tagName === 'option')?.value || '';
    }
    return this.attrs.value || '';
  }

  set value(value) { this._value = String(value); }

  get classList() {
    return {
      toggle: (className, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        if (force ?? !classes.has(className)) classes.add(className);
        else classes.delete(className);
        this.className = [...classes].join(' ');
      },
    };
  }

  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key.startsWith('data-')) {
      const dataKey = key.slice(5).replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      this.dataset[dataKey] = String(value);
    }
    if (key === 'hidden') this.hidden = true;
  }

  removeAttribute(key) { delete this.attrs[key]; }

  append(...nodes) {
    for (let node of nodes) {
      if (typeof node === 'string') {
        const text = new Element('#text');
        text._text = node;
        node = text;
      }
      node.parentElement = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this._text = '';
    this.append(...nodes);
  }

  addEventListener(name, callback) {
    (this.listeners[name] ??= []).push(callback);
  }

  async fire(name, extra = {}) {
    for (const callback of this.listeners[name] || []) {
      await callback({ type: name, target: this, preventDefault() {}, shiftKey: false, ...extra });
    }
  }

  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (matches(node, selector)) return node;
    }
    return null;
  }

  focus() { this.focused = true; }

  getBoundingClientRect() {
    // Fixed placeholder geometry permits drawing code to execute, but does not
    // measure real positions, overlapping labels, responsive layout, or paint.
    return { left: 20, top: 20, width: 180, height: 90, right: 200, bottom: 110 };
  }
}

function matches(node, selector) {
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1));
  if (selector.startsWith('[')) {
    const [, key, value] = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/) || [];
    return Boolean(key && key in node.attrs && (value === undefined || node.attrs[key] === value));
  }
  return node.tagName === selector.toLowerCase();
}

function descendants(root) {
  return root.children.flatMap(node => [node, ...descendants(node)]);
}

function findAll(root, selector) {
  const parts = selector.split(/\s+/);
  return descendants(root).filter(node => {
    if (!matches(node, parts.at(-1))) return false;
    let ancestor = node.parentElement;
    for (let index = parts.length - 2; index >= 0; index--) {
      while (ancestor && !matches(ancestor, parts[index])) ancestor = ancestor.parentElement;
      if (!ancestor) return false;
      ancestor = ancestor.parentElement;
    }
    return true;
  });
}

function parseDocument(html) {
  const root = new Element('document');
  const stack = [root];
  for (const token of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      stack.pop();
    } else if (token.startsWith('<')) {
      const name = token.match(/^<([\w-]+)/)?.[1];
      if (!name) continue;
      const node = new Element(name);
      const attributes = token.slice(name.length + 1, -1);
      for (const match of attributes.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        node.setAttribute(match[1], match[2] ?? match[3] ?? match[4] ?? '');
      }
      stack.at(-1).append(node);
      if (!['meta', 'link', 'input', 'br', 'hr', 'img'].includes(name) && !token.endsWith('/>')) {
        stack.push(node);
      }
    } else {
      const text = new Element('#text');
      text._text = token;
      stack.at(-1).append(text);
    }
  }
  return root;
}

async function createFixture(root) {
  const files = {
    'package.json': JSON.stringify({ name: 'project-map-ui-fixture', private: true }),
    'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
    'src/app/page.tsx': "import Link from 'next/link';\nimport { TaskList } from '@/components/TaskList';\nexport default function Home() { return <main><Link href=\"/tasks\">Tasks</Link><TaskList /></main>; }\n",
    'src/app/tasks/page.tsx': "import { TaskList } from '@/components/TaskList';\nexport default function Tasks() { return <main><h1>Tasks</h1><TaskList /></main>; }\n",
    'src/components/TaskList.tsx': "import { tasks } from '@/lib/tasks';\nexport function TaskList() { return <ul>{tasks.map(task => <li key={task.id}>{task.title}</li>)}</ul>; }\n",
    'src/lib/tasks.ts': "export const tasks = [{ id: 'sample', title: 'Example task' }];\n",
  };
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
}

test('UI request flow against the real API with a mock DOM (no browser layout)', async t => {
  const { startServer } = await import(pathToFileURL(path.join(skillRoot, 'scripts', 'lib', 'server.mjs')).href);
  const { completeTask, proposeTask, getTask, updateTask } = await import(pathToFileURL(path.join(skillRoot, 'scripts', 'lib', 'core.mjs')).href);
  const temporaryRoot = await mkdtemp(path.join(await realpath(tmpdir()), 'project-map-ui-'));
  const projectRoot = path.join(temporaryRoot, 'fixture');
  const stateDir = path.join(temporaryRoot, 'state');
  const frames = new Set();
  let server;
  t.after(async () => {
    for (const frame of frames) clearTimeout(frame);
    try {
      if (server) await server.close();
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
  await createFixture(projectRoot);
  server = await startServer({ projectRoot, stateDir });

  const dom = parseDocument(await readFile(path.join(skillRoot, 'assets', 'index.html'), 'utf8'));
  const document = {
    querySelector: selector => findAll(dom, selector)[0] || null,
    querySelectorAll: selector => findAll(dom, selector),
    createElement: tag => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
    createTextNode: value => { const node = new Element('#text'); node._text = value; return node; },
    visibilityState: 'visible',
    documentElement: findAll(dom, 'html')[0],
    title: '',
  };
  let clipboard = '';
  const storage = {};
  const requests = [];
  const context = {
    document,
    window: { addEventListener() {} },
    navigator: { clipboard: { writeText: async value => { clipboard = value; } } },
    localStorage: { getItem: key => storage[key], setItem: (key, value) => { storage[key] = value; } },
    fetch: (url, options) => {
      requests.push({ url, method: options?.method || 'GET', body: options?.body ? JSON.parse(options.body) : null });
      return fetch(new URL(url, server.url), options);
    },
    setInterval: () => 1, // Explicit actions exercise polling updates without background timers.
    requestAnimationFrame: callback => {
      const timer = setTimeout(() => { frames.delete(timer); callback(); }, 0);
      frames.add(timer);
      return timer;
    },
    cancelAnimationFrame: timer => { clearTimeout(timer); frames.delete(timer); },
    ResizeObserver: class { observe() {} },
    console, setTimeout, clearTimeout, Intl, URL, Set, Map, JSON, Date, Array, String, Number, Object,
  };
  const query = selector => document.querySelector(selector);
  async function until(predicate) {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('UI condition timed out. Error panel: ' + query('#error')?.textContent);
  }

  vm.runInNewContext(await readFile(path.join(skillRoot, 'assets', 'app.js'), 'utf8'), context, { filename: 'app.js' });
  await until(() => document.querySelectorAll('.map-node').length > 0);
  assert.equal(query('#error').hidden, true);
  // Edges represent source evidence and remain visible when nothing is selected.
  await query('#clear-selection').fire('click');
  assert.ok(document.querySelectorAll('.graph-edge').some(node => node.attrs['data-edge-kind'] === 'navigates'));
  assert.ok(document.querySelectorAll('.graph-edge').every(node => node.attrs['marker-end']));
  await query('[data-connections="implementation"]').fire('click');
  assert.ok(document.querySelectorAll('.graph-edge').length > 0, 'Implementation edges appear before selection');
  assert.ok(document.querySelectorAll('.graph-edge').every(node => node.attrs['data-edge-kind'] !== 'navigates'));
  await query('[data-connections="flow"]').fire('click');

  const targetId = 'src/app/tasks/page.tsx';
  const addedId = 'src/app/tasks/review/page.tsx';
  const target = document.querySelectorAll('.map-node').find(node => node.dataset.nodeId === targetId);
  assert.ok(target, 'The route node should be selectable');
  await target.fire('click');
  assert.match(query('#relations-list').textContent, /화면 이동/);
  query('#request').value = 'UI integration: 작업 요약 제목을 바꾸고 검토 화면을 연결해줘.';
  await query('#request').fire('input');
  assert.equal(query('#analyze').disabled, false);
  await query('#request-form').fire('submit');
  assert.equal(query('#impact-panel').hidden, false);
  assert.match(query('#impact-scopes').textContent, /수정 후보/);
  assert.equal(query('#save-task').disabled, false);
  await query('#save-task').fire('click');
  assert.equal(query('#view-review').hidden, false);
  const taskId = query('#saved-id').textContent;
  assert.match(taskId, /^task-/);
  assert.match(query('#review-overview').textContent, /계획 작성 대기/);
  assert.equal(query('#plan-content').hidden, true);
  await query('#review-copy').fire('click');
  assert.ok(clipboard.includes(taskId) && clipboard.includes('$project-map'));
  assert.match(clipboard, /먼저 변경 계획/);
  assert.match(clipboard, /승인할 때까지 코드 수정은 시작하지/);

  // The browser never manufactures a semantic plan. Simulate the host agent
  // publishing a real persisted proposal through the same core used by the CLI.
  const proposal = {
    summary: '작업 제목을 간결하게 바꾸고 별도 검토 화면을 연결합니다.',
    writeFiles: [targetId, addedId],
    effects: [
      { nodeId: targetId, change: '제목 문자열과 검토 화면 링크 변경', expected: '소스에 Task overview 제목과 검토 화면 경로가 포함됨', verify: '제목과 링크 문자열을 소스에서 확인' },
      { nodeId: addedId, change: '검토 화면 추가', expected: '사용자가 목록에서 검토 화면으로 이동할 수 있음', verify: '브라우저에서 이동 경로 확인' },
    ],
    newNodes: [{ id: addedId, label: '작업 검토', kind: 'screen', route: '/tasks/review' }],
    flowChanges: [{ source: targetId, target: addedId, kind: 'navigates', action: 'add', reason: '검토 화면 링크 추가' }],
  };
  let proposed = await proposeTask(projectRoot, taskId, proposal, { stateDir });
  await query('#review-refresh').fire('click');
  await until(() => !query('#plan-content').hidden);
  assert.match(query('#review-overview').textContent, /계획 검토 대기/);
  assert.match(query('#plan-effects').textContent, /브라우저에서 이동 경로 확인/);
  assert.ok(findAll(query('#plan-before-graph'), '.graph-edge').length > 0);
  assert.ok(findAll(query('#plan-after-graph'), '.graph-edge').some(node => node.attrs['data-edge-action'] === 'add'));
  assert.match(query('#plan-after-graph').textContent, /작업 검토/);
  assert.equal(query('#review-actions').hidden, false);

  query('#review-note').value = '검토 화면에 읽기 쉬운 제목을 추가해줘.';
  await query('#revise-plan').fire('click');
  assert.equal((await getTask(projectRoot, taskId, { stateDir })).status, 'queued');
  assert.equal(query('#plan-content').hidden, true, 'A superseded plan cannot be approved');
  await query('#review-copy').fire('click');
  assert.match(clipboard, /검토 화면에 읽기 쉬운 제목/);
  proposed = await proposeTask(projectRoot, taskId, { ...proposal, summary: '검토 화면의 제목까지 포함한 수정 계획' }, { stateDir });
  await query('#review-refresh').fire('click');
  await until(() => query('#plan-version').textContent.includes('계획 버전 2'));
  await query('#approve-plan').fire('click');
  const approved = await getTask(projectRoot, taskId, { stateDir });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approval.revision, proposed.plan.revision);
  assert.equal(approved.approval.snapshotId, proposed.plan.snapshotId);
  const approvalRequest = requests.findLast(request => request.url.endsWith('/review') && request.body?.decision === 'approve');
  assert.deepEqual(approvalRequest.body, { decision: 'approve', revision: proposed.plan.revision, snapshotId: proposed.plan.snapshotId, note: '' });
  assert.equal(query('#review-actions').hidden, true);
  await query('#review-copy').fire('click');
  assert.match(clipboard, /승인된 계획/);

  await updateTask(projectRoot, taskId, { status: 'running' }, { stateDir });
  await query('#review-refresh').fire('click');
  await until(() => query('#review-overview').textContent.includes('작업 중'));

  // Alter only synthetic fixture files. One source-level effect is checked;
  // browser navigation stays unverified despite an unrelated passing check.
  const updatedSource = "import Link from 'next/link';\nimport { TaskList } from '@/components/TaskList';\nexport default function Tasks() { return <main><h1>Task overview</h1><Link href=\"/tasks/review\">Review</Link><TaskList /></main>; }\n";
  await writeFile(path.join(projectRoot, targetId), updatedSource);
  await mkdir(path.dirname(path.join(projectRoot, addedId)), { recursive: true });
  await writeFile(path.join(projectRoot, addedId), 'export default function Review() { return <h1>Review tasks</h1>; }\n');
  await writeFile(path.join(projectRoot, 'src/new-theme.css'), 'main { padding: 1rem; }\n');
  assert.match(await readFile(path.join(projectRoot, targetId), 'utf8'), /Task overview/);
  assert.match(await readFile(path.join(projectRoot, targetId), 'utf8'), /href="\/tasks\/review"/);
  await completeTask(projectRoot, taskId, {
    summary: 'Updated a synthetic screen, added a route, and added a stylesheet.',
    checks: [
      { name: 'Source title and route string', nodeId: targetId, status: 'passed', detail: 'Checked fixture source only; no browser behavior claim.' },
      { name: 'Mock DOM interaction', status: 'passed', detail: 'Selected feature, reviewed a proposal, and approved the exact revision.' },
    ],
  }, { stateDir });
  await query('#review-refresh').fire('click');
  await until(() => query('#review-overview').textContent.includes('작업 완료'));
  await query('#review-result').fire('click');
  await until(() => !query('#change-content').hidden);
  assert.equal(query('#actual-graphs').hidden, false);
  assert.ok(findAll(query('#result-before-graph'), '.graph-edge').length > 0);
  assert.ok(findAll(query('#result-after-graph'), '.graph-edge').length > 0);
  const outcomeCards = findAll(query('#outcomes'), '.effect-card');
  assert.match(outcomeCards.find(node => node.dataset.nodeId === targetId).textContent, /통과/);
  const unverified = outcomeCards.find(node => node.dataset.nodeId === addedId);
  assert.match(unverified.textContent, /미확인/);
  assert.doesNotMatch(unverified.textContent, /통과/);
  assert.equal(query('#change-coverage').hidden, false);
  assert.match(query('#comparison-status').textContent, /소스 파일/);
  assert.match(query('#comparison-counts').textContent, /분석 파일/);
  assert.match(query('#checks').textContent, /Selected feature/);
  const changes = document.querySelectorAll('.change-card');
  assert.ok(changes.some(node => node.dataset.change === 'modified'));
  assert.ok(changes.some(node => node.dataset.change === 'added'));
  assert.equal(query('#change-alert').hidden, false, 'The stylesheet remains outside the approved plan');

  await query('#continue-task').fire('click');
  assert.equal(query('#view-structure').hidden, false);
  assert.equal(query('#followup-context').hidden, false);
  assert.match(query('#followup-label').textContent, new RegExp(taskId));
  const selectedNodes = document.querySelectorAll('.map-node').filter(node => node.attrs['aria-pressed'] === 'true');
  assert.ok(selectedNodes.some(node => node.dataset.nodeId === addedId), 'New features are available for follow-up');
  query('#request').value = '검토 화면의 안내 문구를 짧게 바꿔줘.';
  await query('#request').fire('input');
  await query('#request-form').fire('submit');
  await query('#save-task').fire('click');
  const followupId = query('#saved-id').textContent;
  const followup = await getTask(projectRoot, followupId, { stateDir });
  assert.equal(followup.parentTaskId, taskId);
  assert.equal(followup.status, 'queued');
  assert.equal(query('#error').hidden, true);

  // Removing a feature must be explicit in the before graph. A newer proposal
  // invalidates the displayed approval and requires a separate user decision.
  const removal = {
    summary: '검토 화면을 제거하는 후속 계획',
    writeFiles: [addedId],
    effects: [{ nodeId: addedId, change: '검토 화면 제거', expected: '기존 목록에서 작업을 확인함', verify: '삭제 후 경로와 깨진 링크 확인' }],
    removeNodeIds: [addedId],
  };
  await proposeTask(projectRoot, followupId, removal, { stateDir });
  await query('#review-refresh').fire('click');
  await until(() => query('#plan-summary').textContent === removal.summary);
  const removedCard = findAll(query('#plan-before-graph'), '.comparison-node').find(node => node.dataset.nodeId === addedId);
  assert.equal(removedCard.dataset.change, 'deleted');
  assert.match(removedCard.textContent, /제거 예정/);
  assert.ok(!findAll(query('#plan-after-graph'), '.comparison-node').some(node => node.dataset.nodeId === addedId));
  await proposeTask(projectRoot, followupId, { ...removal, summary: '최신 삭제 계획' }, { stateDir });
  await query('#approve-plan').fire('click');
  assert.equal((await getTask(projectRoot, followupId, { stateDir })).status, 'awaiting_review');
  assert.equal(query('#error').hidden, false);
  assert.match(query('#plan-version').textContent, /계획 버전 2/);
  assert.match(query('#error').textContent, /새로 표시된 계획/);
  await query('#review-refresh').fire('click');
  await until(() => query('#error').hidden);
  await query('#language').fire('click');
  assert.equal(document.documentElement.lang, 'en');
  await query('#tab-changes').fire('click');
  await until(() => query('#comparison-status').textContent.includes('indexed source'));
  t.diagnostic('Real local API + mock DOM: visible source edges, selection, scope, queued plan prompt, proposal/revision/exact approval, completion, observed graphs, per-feature verification, linked follow-up, and language. No browser layout engine was used.');
});
