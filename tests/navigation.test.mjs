import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillRoot = process.env.PROJECT_MAP_SKILL || fileURLToPath(new URL('../skills/project-map', import.meta.url));
const { scanProject, getMap, analyzeImpact } = await import(pathToFileURL(path.join(skillRoot, 'scripts/lib/core.mjs')));
const { normalizeRoute } = await import(pathToFileURL(path.join(skillRoot, 'scripts/lib/flow.mjs')));

async function write(root, relative, text) {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}

async function fixture(t, entries = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'project-map-navigation-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const files = {
    'package.json': JSON.stringify({ name: 'navigation-fixture' }),
    'src/app/page.tsx': 'export default function Home() { return <main>Home</main>; }',
    'src/app/tasks/page.tsx': 'export default function Tasks() { return <main>Tasks</main>; }',
    'src/app/reports/page.tsx': 'export default function Reports() { return <main>Reports</main>; }',
    'src/app/settings/page.tsx': 'export default function Settings() { return <main>Settings</main>; }',
    ...entries,
  };
  for (const [file, text] of Object.entries(files)) await write(root, file, text);
  return root;
}

function flows(map, source = 'src/app/page.tsx') {
  return map.edges.filter(edge => edge.kind === 'navigates' && (!source || edge.source === source));
}

test('route normalization preserves internal paths and rejects ambiguous URL/traversal inputs', () => {
  assert.equal(normalizeRoute('/'), '/');
  assert.equal(normalizeRoute('/tasks/?view=open#first'), '/tasks');
  assert.equal(normalizeRoute('/tasks/[id]'), '/tasks/[id]');
  assert.equal(normalizeRoute('/users/:id'), '/users/:id');
  assert.equal(normalizeRoute('/%ED%95%9C%EA%B8%80'), '/한글');
  for (const invalid of [null, undefined, 42, '', 'tasks', '../tasks', '#section', 'https://example.com/tasks', '//example.com/tasks', 'javascript:alert(1)', '/a/../tasks', '/a/%2e%2e/tasks', '/a%2fb', '/a%5cb', '/a\\b', '/tasks//', '/ta sks', '/%zz', ' /tasks', '/tasks\n']) assert.equal(normalizeRoute(invalid), null, String(invalid));
});

test('imports and shared code do not themselves create screen navigation', async t => {
  const root = await fixture(t, {
    'src/app/page.tsx': "import Tasks from './tasks/page';\nimport { Card } from '../components/Card';\nexport default function Home() { return <Card />; }",
    'src/components/Card.tsx': 'export function Card() { return <div>Card</div>; }',
  });
  const map = await scanProject(root);
  assert.ok(map.edges.some(edge => edge.kind === 'imports' && edge.target === 'src/app/tasks/page.tsx'));
  assert.equal(flows(map, null).length, 0);
});

test('literal JSX links and supported navigation calls produce inferred screen flow', async t => {
  const root = await fixture(t, {
    'src/app/tasks/[id]/page.tsx': 'export default function Detail() { return <main>Detail</main>; }',
    'src/app/about/page.tsx': 'export default function About() { return <main>About</main>; }',
    'src/app/page.tsx': [
      "import Link from 'next/link';",
      'export default function Home() {',
      "  const open = () => { router.push('/tasks/sample-1?view=open#title'); router.replace('/reports'); router.navigate('/settings'); navigate('/about'); navigation.navigate('/tasks'); history.push('/reports'); router?.push('/settings'); };",
      '  return <main><Link href="/tasks">Tasks</Link><Link href={\'/reports\'}>Reports</Link><NavLink to="/settings">Settings</NavLink><a href="/about?from=home#top">About</a></main>;',
      '}',
    ].join('\n'),
  });
  const map = await scanProject(root), navigation = flows(map);
  assert.deepEqual(navigation.map(edge => edge.target).sort(), ['src/app/about/page.tsx', 'src/app/reports/page.tsx', 'src/app/settings/page.tsx', 'src/app/tasks/[id]/page.tsx', 'src/app/tasks/page.tsx'].sort());
  assert.ok(navigation.every(edge => edge.confidence === 'inferred' && /^[a-f0-9]{20}$/.test(edge.id) && /not runtime verified/.test(edge.evidence)));
  assert.ok(navigation.some(edge => edge.evidenceCount > 1));
  assert.ok(!navigation.some(edge => edge.evidence.includes('view=open')), 'query values are unnecessary evidence and should not be persisted');
  assert.equal(flows(await getMap(root)).length, navigation.length, 'stored flow edges must survive validation');
  const impact = analyzeImpact(map, { nodeIds: ['src/app/page.tsx'], intent: 'display' });
  assert.ok(!impact.readFiles.includes('src/app/tasks/[id]/page.tsx'), 'navigation does not become an import dependency');
});

test('comments, quoted snippets, templates, and regex literals cannot invent navigation', async t => {
  const root = await fixture(t, {
    'src/app/page.tsx': [
      '// router.push("/tasks"); <Link href="/tasks" />',
      '/* navigation.navigate("/tasks"); <a href="/tasks">Tasks</a> */',
      'const sample = "<Link href=\'/tasks\' />";',
      'const code = "router.push(\'/tasks\')";',
      'const template = `<Link href="/tasks" /> router.push("/tasks")`;',
      'const expression = /router\\.push\\("\\/tasks"\\)/;',
      'export default function Home() { return <main>{/* <Link href="/tasks" /> */}Home</main>; }',
    ].join('\n'),
    'index.html': '<!-- <a href="/tasks">Tasks</a><script>router.push("/tasks")</script> -->\n<p>Example</p>',
  });
  assert.equal(flows(await scanProject(root), null).length, 0);
});

test('external, computed, named, escaped, and spread-overridden destinations are omitted', async t => {
  const root = await fixture(t, {
    'src/app/page.tsx': [
      "const go = () => { router.push(target); router.push('/tasks' + suffix); router.push({ pathname: '/tasks' }); navigation.navigate('Tasks'); router.replace('/ta\\u0073ks'); };",
      'export default function Home() { return <main>',
      '<Link href="https://example.com/tasks">External</Link><a href="//example.com/tasks">External</a><a href="javascript:alert(1)">Script</a>',
      '<Link href={target}>Computed</Link><Link href={`/tasks/${id}`}>Template</Link><Link href={{ pathname: "/tasks" }}>Object</Link>',
      '<Link href="/tasks" {...props}>Spread</Link><Link href="/tasks" to="/reports">Ambiguous</Link><Link href="/tasks/[id]">Placeholder</Link>',
      '<a href="../tasks">Relative</a><a href="#tasks">Anchor</a>',
      '</main>; }',
    ].join('\n'),
  });
  const map = await scanProject(root);
  assert.equal(flows(map, null).length, 0);
  assert.ok(map.warnings.some(message => /navigation expressions were omitted/.test(message)));
  assert.ok(map.warnings.some(message => /external or URL-scheme/.test(message)));
});

test('concrete paths match single, catch-all, and optional dynamic routes with query/hash removed', async t => {
  const root = await fixture(t, {
    'src/app/tasks/[id]/page.tsx': 'export default function Detail() { return <main>Detail</main>; }',
    'src/app/docs/[...slug]/page.tsx': 'export default function Docs() { return <main>Docs</main>; }',
    'src/app/help/[[...slug]]/page.tsx': 'export default function Help() { return <main>Help</main>; }',
    'src/app/page.tsx': 'export default function Home() { return <main><Link href="/tasks/42?mode=edit#name" /><Link href="/docs/a/b" /><Link href="/help" /><Link href="/help/a/b" /></main>; }',
  });
  const navigation = flows(await scanProject(root));
  assert.deepEqual(navigation.map(edge => edge.target).sort(), ['src/app/tasks/[id]/page.tsx', 'src/app/docs/[...slug]/page.tsx', 'src/app/help/[[...slug]]/page.tsx'].sort());
});

test('reused navigation components project through imports with source evidence', async t => {
  const root = await fixture(t, {
    'src/components/Navigation.tsx': 'export function Navigation() { return <Link href="/tasks">Tasks</Link>; }',
    'src/components/Shell.tsx': "import { Navigation } from './Navigation'; export function Shell() { return <Navigation />; }",
    'src/components/Orphan.tsx': 'export function Orphan() { return <Link href="/settings">Settings</Link>; }',
    'src/app/page.tsx': "import { Shell } from '../components/Shell'; export default function Home() { return <Shell />; }",
    'src/app/reports/page.tsx': "import { Navigation } from '../../components/Navigation'; export default function Reports() { return <Navigation />; }",
  });
  const map = await scanProject(root), navigation = flows(map, null);
  assert.deepEqual(navigation.map(edge => `${edge.source}->${edge.target}`).sort(), ['src/app/page.tsx->src/app/tasks/page.tsx', 'src/app/reports/page.tsx->src/app/tasks/page.tsx'].sort());
  assert.ok(navigation.every(edge => edge.via === 'src/components/Navigation.tsx' && /import path/.test(edge.evidence)));
  assert.ok(map.warnings.some(message => /could not be associated with a screen/.test(message)));
});

test('an optional root catch-all can match the root path when no static root exists', async t => {
  const root = await fixture(t, {
    'src/app/[[...slug]]/page.tsx': 'export default function CatchAll() { return <main>Catch all</main>; }',
    'src/app/page.tsx': 'export default function Home() { return <Link href="/">Root</Link>; }',
    'project-map.config.json': JSON.stringify({ routes: { 'src/app/page.tsx': '/source' } }),
  });
  assert.deepEqual(flows(await scanProject(root)).map(edge => edge.target), ['src/app/[[...slug]]/page.tsx']);
});

test('reverse import projection is bounded and reports omitted long chains', async t => {
  const entries = {
    'src/components/Navigation.tsx': 'export function Navigation() { return <Link href="/tasks">Tasks</Link>; }',
    'src/app/page.tsx': "import { Wrapper1 } from '../components/Wrapper1'; export default function Home() { return <Wrapper1 />; }",
  };
  for (let index = 1; index <= 4; index++) {
    const next = index === 4 ? 'Navigation' : `Wrapper${index + 1}`;
    entries[`src/components/Wrapper${index}.tsx`] = `import { ${next} } from './${next}'; export function Wrapper${index}() { return <${next} />; }`;
  }
  const map = await scanProject(await fixture(t, entries));
  assert.equal(flows(map, null).length, 0);
  assert.ok(map.warnings.some(message => /Navigation coverage limit reached/.test(message)));
});

test('duplicate route-group destinations are omitted instead of guessing a screen', async t => {
  const root = await fixture(t, {
    'src/app/(alternate)/tasks/page.tsx': 'export default function AlternateTasks() { return <main>Other tasks</main>; }',
    'src/app/page.tsx': 'export default function Home() { return <Link href="/tasks">Tasks</Link>; }',
  });
  const map = await scanProject(root);
  assert.equal(flows(map).length, 0);
  assert.ok(map.warnings.some(message => /matched multiple screen routes/.test(message)));
});

test('an exact static route wins while overlapping dynamic matches are omitted', async t => {
  const root = await fixture(t, {
    'src/app/tasks/[id]/page.tsx': 'export default function Detail() { return <main>Detail</main>; }',
    'src/app/tasks/[slug]/page.tsx': 'export default function Slug() { return <main>Slug</main>; }',
    'src/app/tasks/new/page.tsx': 'export default function Create() { return <main>New</main>; }',
    'src/app/page.tsx': 'export default function Home() { return <main><Link href="/tasks/new" /><Link href="/tasks/42" /></main>; }',
  });
  const map = await scanProject(root);
  assert.deepEqual(flows(map).map(edge => edge.target), ['src/app/tasks/new/page.tsx']);
  assert.ok(map.warnings.some(message => /matched multiple screen routes/.test(message)));
});

test('implicit layout projection requires explicit framework package evidence and respects its subtree', async t => {
  const root = await fixture(t, {
    'src/app/tasks/layout.tsx': 'export default function Layout({ children }) { return <main><Link href="/settings">Settings</Link>{children}</main>; }',
    'src/app/tasks/[id]/page.tsx': 'export default function Detail() { return <main>Detail</main>; }',
  });
  assert.equal(flows(await scanProject(root), null).length, 0);
  await write(root, 'package.json', JSON.stringify({ name: 'layout-fixture', dependencies: { next: 'test-fixture' } }));
  const navigation = flows(await scanProject(root), null);
  assert.deepEqual(navigation.map(edge => edge.source).sort(), ['src/app/tasks/[id]/page.tsx', 'src/app/tasks/page.tsx'].sort());
  assert.ok(navigation.every(edge => edge.target === 'src/app/settings/page.tsx' && /Next layout convention/.test(edge.evidence)));
});

test('configured routes support screen directories without inventing named navigator mappings', async t => {
  const root = await fixture(t, {
    'src/screens/User.tsx': 'export default function User() { return <main>User</main>; }',
    'src/app/page.tsx': 'export default function Home() { return <Link href="/users/42">User</Link>; }',
    'project-map.config.json': JSON.stringify({ routes: { 'src/screens/User.tsx': '/users/:id' } }),
  });
  const map = await scanProject(root);
  assert.equal(map.nodes.find(node => node.id === 'src/screens/User.tsx').route, '/users/:id');
  assert.deepEqual(flows(map).map(edge => edge.target), ['src/screens/User.tsx']);
});
