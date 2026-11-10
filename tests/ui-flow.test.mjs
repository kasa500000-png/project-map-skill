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
    'src/app/page.tsx': "import { TaskList } from '@/components/TaskList';\nexport default function Home() { return <TaskList />; }\n",
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
  const { completeTask } = await import(pathToFileURL(path.join(skillRoot, 'scripts', 'lib', 'core.mjs')).href);
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
  const context = {
    document,
    window: { addEventListener() {} },
    navigator: { clipboard: { writeText: async value => { clipboard = value; } } },
    localStorage: { getItem: key => storage[key], setItem: (key, value) => { storage[key] = value; } },
    fetch: (url, options) => fetch(new URL(url, server.url), options),
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
  const target = document.querySelectorAll('.map-node').find(node => node.dataset.nodeId === 'src/app/tasks/page.tsx');
  assert.ok(target, 'The route node should be selectable');
  await target.fire('click');
  query('#request').value = 'UI integration: 입력 순서를 간결하게 정리해줘.';
  await query('#request').fire('input');
  assert.equal(query('#analyze').disabled, false);
  await query('#request-form').fire('submit');
  assert.equal(query('#impact-panel').hidden, false);
  assert.match(query('#impact-scopes').textContent, /수정 후보/);
  assert.equal(query('#save-task').disabled, false);
  await query('#save-task').fire('click');
  assert.equal(query('#saved-panel').hidden, false);
  const taskId = query('#saved-id').textContent;
  assert.match(taskId, /^task-/);
  assert.match(query('#saved-status').textContent, /대기/);
  await query('#copy-prompt').fire('click');
  await until(() => clipboard.includes(taskId));
  assert.ok(clipboard.includes('$project-map'));

  // Alter only synthetic fixture files to exercise the actual change diagram.
  await writeFile(path.join(projectRoot, 'src/app/tasks/page.tsx'), "import { TaskList } from '@/components/TaskList';\nexport default function Tasks() { return <main><h1>Task overview</h1><TaskList /></main>; }\n");
  await writeFile(path.join(projectRoot, 'src/new-theme.css'), 'main { padding: 1rem; }\n');
  await completeTask(projectRoot, taskId, {
    summary: 'Updated a synthetic screen and added a synthetic stylesheet.',
    checks: [{ name: 'Mock DOM interaction', status: 'passed', detail: 'Selected feature, previewed impact, saved request and copied prompt.' }],
  }, { stateDir });
  await query('#reload-tasks').fire('click');
  await until(() => query('#saved-status').textContent.includes('작업 완료'));
  await query('#tab-changes').fire('click');
  await until(() => !query('#change-content').hidden);
  assert.equal(query('#change-coverage').hidden, false);
  assert.match(query('#comparison-status').textContent, /소스 파일/);
  assert.match(query('#comparison-counts').textContent, /분석 파일/);
  assert.match(query('#checks').textContent, /Selected feature/);
  const changes = document.querySelectorAll('.change-card');
  assert.ok(changes.some(node => node.dataset.change === 'modified'));
  assert.ok(changes.some(node => node.dataset.change === 'added'));
  assert.equal(query('#change-alert').hidden, false, 'The added stylesheet is outside the selected edit scope');
  assert.equal(query('#error').hidden, true);
  await query('#language').fire('click');
  assert.equal(document.documentElement.lang, 'en');
  assert.match(query('#comparison-status').textContent, /indexed source/);
  t.diagnostic('Real local API: selection, scope preview, request save, prompt copy, completion, actual file changes, coverage, check details, and language. No browser layout engine was used.');
});
