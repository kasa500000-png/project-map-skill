import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectNavigation, normalizeRoute } from './flow.mjs';
import { inventory, auditable, isSensitive } from './inventory.mjs';

const exec = promisify(execFile);
const SCHEMA_VERSION = 1;
const MAX_FILES = 3000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_STATE_BYTES = 24 * 1024 * 1024;
const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.html', '.css', '.scss', '.sql', '.py', '.swift', '.kt', '.kts', '.dart']);
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.css', '.scss', '.json'];
const SKIP_DIRS = new Set(['.git', '.project-map', '.agents', '.codex', 'node_modules', 'vendor', 'dist', 'build', '.next', '.nuxt', '.output', '.expo', '.svelte-kit', 'coverage', 'out', '.turbo', '.cache', '__pycache__', '.venv', 'venv', 'Pods', '.gradle', 'DerivedData', 'target']);
const JSON_NAMES = /^(package|app|expo|vercel|routes|manifest|project-map\.config|tsconfig(?:\.[\w-]+)?|jsconfig(?:\.[\w-]+)?)\.json$/i;
const SECRET_NAMES = /(?:^\.env(?:\.|$)|credentials?|secrets?|service[-_.]?account|private[-_.]?key|^id_(?:rsa|ed25519)|\.(?:pem|key|p12|pfx|keystore|jks)$)/i;
const INTENTS = new Set(['display', 'behavior', 'contract']);
const KINDS = new Set(['screen', 'component', 'service', 'data', 'config', 'style', 'module']);
const EDGE_KINDS = new Set(['imports', 'uses', 'reads', 'writes', 'navigates']);
const PLAN_EDGE_KINDS = new Set(['uses', 'reads', 'writes', 'navigates']);
const MAX_PLAN_ITEMS = 60;
const MAX_GRAPH_NODES = 180;
const MAX_GRAPH_EDGES = 480;
const WORD_LABELS = { home: '홈', index: '홈', dashboard: '대시보드', screening: '스크리닝', report: '리포트', reports: '리포트', diary: '매매 일지', journal: '일지', stats: '통계', statistics: '통계', login: '로그인', signin: '로그인', signup: '회원가입', settings: '설정', profile: '프로필', search: '검색', stock: '종목', stocks: '종목', chat: '채팅', rooms: '방 목록', onboarding: '시작 안내', task: '작업', tasks: '작업 목록', project: '프로젝트', projects: '프로젝트 목록', user: '사용자', users: '사용자 목록', comments: '댓글 목록' };

function failure(message, code = 'INVALID_INPUT', statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function relativeName(value) {
  return value.split(path.sep).join('/');
}

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

function cleanText(value, limit = 160) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '';
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function projectPath(projectRoot) {
  if (typeof projectRoot !== 'string' || !projectRoot.trim()) throw failure('A project directory is required.');
  let root;
  try { root = await fs.realpath(path.resolve(projectRoot)); }
  catch { throw failure('Project directory does not exist.', 'PROJECT_NOT_FOUND', 404); }
  if (!(await fs.stat(root)).isDirectory()) throw failure('Project path must be a directory.');
  return root;
}

export function getStateDir(projectRoot, stateDir) {
  const root = path.resolve(projectRoot);
  if (stateDir !== undefined && (typeof stateDir !== 'string' || !stateDir.trim())) throw failure('stateDir must be a nonempty path.');
  const result = path.resolve(root, stateDir ?? '.project-map');
  if (result === root) throw failure('State directory must be separate from the project root.');
  return result;
}

async function ensureState(root, stateDir) {
  const state = getStateDir(root, stateDir);
  // Refuse symlinked state paths rather than writing through a project-controlled link.
  const ancestors = [];
  for (let current = state; current !== path.dirname(current); current = path.dirname(current)) ancestors.push(current);
  for (const current of ancestors.reverse()) {
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw failure('State directory must not contain symbolic links.', 'UNSAFE_STATE_PATH');
      if (!stat.isDirectory()) throw failure('State path is not a directory.', 'UNSAFE_STATE_PATH');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await fs.mkdir(path.join(state, 'tasks'), { recursive: true, mode: 0o700 });
  const taskStat = await fs.lstat(path.join(state, 'tasks'));
  if (!taskStat.isDirectory() || taskStat.isSymbolicLink()) throw failure('Task storage must be a real directory.', 'UNSAFE_STATE_PATH');
  return state;
}

async function atomicJSON(file, value) {
  const temporary = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch(() => {}); }
}

async function readJSON(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_STATE_BYTES) throw failure('Invalid or oversized state file.', 'INVALID_STATE');
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error instanceof SyntaxError) throw failure('State JSON is damaged. Rebuild the map before continuing.', 'INVALID_STATE'); throw error; }
}

async function git(root, args) {
  try {
    const { stdout } = await exec('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 15000, windowsHide: true });
    return stdout;
  } catch { return null; }
}

function allowedFile(rel, root, state) {
  if (typeof rel !== 'string' || !rel || rel.length > 2048 || path.isAbsolute(rel) || path.win32.isAbsolute(rel) || /[\u0000-\u001f\u007f\\]/.test(rel) || path.posix.normalize(rel) !== rel) return false;
  const normalized = rel.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.some(p => p === '..' || SKIP_DIRS.has(p) || SECRET_NAMES.test(p))) return false;
  const abs = path.resolve(root, rel);
  if (!inside(root, abs) || inside(state, abs)) return false;
  const base = path.basename(rel);
  if (SECRET_NAMES.test(base) || /(?:\.min\.[cm]?js|\.d\.ts|(?:package|pnpm|yarn|bun|composer)[.-]lock)/i.test(base)) return false;
  const ext = path.extname(rel).toLowerCase();
  return EXTENSIONS.has(ext) || (ext === '.json' && JSON_NAMES.test(base));
}

async function fileList(root, state, warnings) {
  const listed = await git(root, ['ls-files', '-c', '-o', '--exclude-standard', '-z', '--', '.']);
  if (listed !== null) return [...new Set(listed.split('\0').filter(rel => allowedFile(rel, root, state)))].sort();
  warnings.push('Git is unavailable or this directory is not a Git worktree. Built-in directory exclusions are used; .gitignore rules are not fully evaluated.');
  const result = [];
  async function walk(dir, depth = 0) {
    if (depth > 32 || result.length > MAX_FILES * 3) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { warnings.push(`Cannot read directory: ${relativeName(path.relative(root, dir))}`); return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink() || inside(state, abs)) continue;
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name) && !SECRET_NAMES.test(entry.name)) await walk(abs, depth + 1); }
      else if (entry.isFile()) {
        const rel = relativeName(path.relative(root, abs));
        if (allowedFile(rel, root, state)) result.push(rel);
      }
    }
  }
  await walk(root);
  return result.sort();
}

async function safeSource(root, rel) {
  const abs = path.resolve(root, rel);
  if (!inside(root, abs)) return null;
  // Check every path component: Git can list files below a replaced symlink directory.
  let current = root;
  for (const component of path.relative(root, abs).split(path.sep)) {
    current = path.join(current, component);
    const entry = await fs.lstat(current);
    if (entry.isSymbolicLink()) return null;
  }
  const stat = await fs.stat(abs);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
  const buffer = await fs.readFile(abs);
  if (buffer.includes(0)) return null;
  return { text: buffer.toString('utf8'), hash: digest(buffer), size: buffer.length };
}

// This is a deliberately small lexer, not an AST parser. Comments, quoted text,
// and template bodies are skipped as code so they cannot invent import edges.
function tokens(source) {
  const result = [];
  let i = 0, line = 1;
  while (i < source.length) {
    const c = source[i], next = source[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && next === '/') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) { if (source[i++] === '\n') line++; }
      i += 2; continue;
    }
    if (c === '/') {
      const previous = result.at(-1);
      const canStartRegex = !previous || (previous.type === 'punct' && ['=', '(', '[', '{', ',', ':', ';', '!', '?', '&', '|'].includes(previous.value)) || (previous.type === 'word' && ['return', 'throw', 'case', 'yield', 'typeof', 'void', 'default'].includes(previous.value));
      if (canStartRegex) {
        let cursor = i + 1, bracket = false, closed = false;
        while (cursor < source.length && source[cursor] !== '\n') {
          if (source[cursor] === '\\') { cursor += 2; continue; }
          if (source[cursor] === '[') bracket = true;
          else if (source[cursor] === ']') bracket = false;
          else if (source[cursor] === '/' && !bracket) { closed = true; cursor++; break; }
          cursor++;
        }
        if (closed) { while (/[a-z]/i.test(source[cursor] ?? '') && cursor < source.length) cursor++; result.push({ type: 'regex', value: '', line }); i = cursor; continue; }
      }
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c, startLine = line; let value = '', escaped = false; i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') { escaped = true; value += source[i + 1] ?? ''; i += 2; }
        else { if (source[i] === '\n') line++; value += source[i++]; }
      }
      i++;
      result.push({ type: quote === '`' ? 'template' : 'string', value, line: startLine, escaped });
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const start = i++;
      while (i < source.length && /[\w$]/.test(source[i])) i++;
      result.push({ type: 'word', value: source.slice(start, i), line });
      continue;
    }
    result.push({ type: 'punct', value: c, line }); i++;
  }
  return result;
}

function parseImports(source, ext) {
  const scanSource = ext === '.html' ? source.replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ' ')) : source;
  const stream = tokens(scanSource), found = [], resources = [];
  let dynamic = 0;
  for (let i = 0; i < stream.length; i++) {
    const t = stream[i], next = stream[i + 1];
    if (t.type !== 'word') continue;
    if (['.css', '.scss'].includes(ext) && stream[i - 1]?.value === '@' && ['import', 'use', 'forward'].includes(t.value)) {
      if (next?.type === 'string') found.push({ specifier: next.value, line: t.line });
      else if (next?.value === 'url' && stream[i + 2]?.value === '(' && stream[i + 3]?.type === 'string') found.push({ specifier: stream[i + 3].value, line: t.line });
    }
    if (t.value === 'import' || t.value === 'require') {
      if (next?.type === 'string') found.push({ specifier: next.value, line: t.line });
      else if (next?.value === '(') {
        if (stream[i + 2]?.type === 'string') found.push({ specifier: stream[i + 2].value, line: t.line });
        else dynamic++;
      } else if (t.value === 'import' && next?.value !== '.') {
        for (let j = i + 1; j < Math.min(i + 100, stream.length) && stream[j].value !== ';'; j++) {
          if (stream[j].value === 'from' && stream[j + 1]?.type === 'string') { found.push({ specifier: stream[j + 1].value, line: t.line }); break; }
          if (stream[j].line > t.line + 12) break;
        }
      }
    }
    if (t.value === 'export' && ['{', '*', 'type'].includes(next?.value)) {
      for (let j = i + 1; j < Math.min(i + 100, stream.length) && stream[j].value !== ';'; j++) {
        if (stream[j].value === 'from' && stream[j + 1]?.type === 'string') { found.push({ specifier: stream[j + 1].value, line: t.line }); break; }
        if (stream[j].line > t.line + 12) break;
      }
    }
    if (next?.value === '(' && stream[i + 2]?.type === 'string') {
      const literal = stream[i + 2].value;
      if (t.value === 'from' && stream[i - 1]?.value === '.' && /^[\w.-]{1,100}$/.test(literal)) {
        const following = stream.slice(i + 3, i + 32).map(v => v.value);
        const stop = following.indexOf(';');
        const clause = stop < 0 ? following : following.slice(0, stop);
        resources.push({ type: 'table', key: literal, access: clause.some(v => ['insert', 'update', 'delete', 'upsert'].includes(v)) ? 'write' : 'read', confidence: 'inferred', line: t.line });
      }
      if (t.value === 'fetch' && literal.startsWith('/') && !literal.startsWith('//')) resources.push({ type: 'endpoint', key: literal.split(/[?#]/)[0].slice(0,120), access: 'unknown', confidence: 'inferred', line: t.line });
    }
  }
  if (ext === '.html') {
    const markup = scanSource;
    for (const match of markup.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) found.push({ specifier: match[1], line: markup.slice(0, match.index).split('\n').length });
  }
  const unique = new Map();
  for (const item of found) if (item.specifier.length <= 240) unique.set(item.specifier, item);
  return { imports: [...unique.values()], resources, dynamic };
}

function stripJSONComments(source) {
  let output = '', quoted = false, escape = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) { output += c; if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; output += c; continue; }
    if (c === '/' && source[i + 1] === '/') { while (i < source.length && source[i] !== '\n') i++; output += '\n'; continue; }
    if (c === '/' && source[i + 1] === '*') { i += 2; while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) { if (source[i] === '\n') output += '\n'; i++; } i++; continue; }
    if (c === ',') { let j = i + 1; while (/\s/.test(source[j] ?? '') && j < source.length) j++; if (source[j] === '}' || source[j] === ']') continue; }
    output += c;
  }
  return output;
}

function classify(rel, expo) {
  const lower = rel.toLowerCase(), base = path.posix.basename(rel), ext = path.posix.extname(rel).toLowerCase();
  if (/\.(css|scss)$/.test(lower)) return 'style';
  if (ext === '.sql' || /(?:^|\/)(?:data|models|schema|schemas|migrations|database|db)(?:\/|\.)/.test(lower)) return 'data';
  if (/^(?:src\/)?app\/(?:.*\/)?(?:page|index)\.[jt]sx?$/.test(rel) || /^(?:src\/)?pages\/(?!api\/)(?!_)[^]+\.[jt]sx?$/.test(rel) || /(?:^|\/)screens?\/.+\.(?:[jt]sx?|dart|swift|kt)$/.test(lower) || (expo && /^(?:src\/)?app\/.+\.[jt]sx?$/.test(rel) && !base.startsWith('_')) || (ext === '.html' && !/(?:template|partial|component)/i.test(rel))) return 'screen';
  if (/^(?:src\/)?(?:app\/.+\/route|pages\/api\/).*/.test(rel) || /(?:^|\/)(?:api|services?|actions|server|functions|controllers)(?:\/|\.)/.test(lower)) return 'service';
  if (ext === '.json' || /(?:^|\/)(?:config|configuration)(?:\/|\.)/.test(lower) || /(?:^|\/)(?:next|vite|expo|tailwind|postcss|metro|babel)\.config\./.test(lower)) return 'config';
  if (/(?:^|\/)components?\//.test(lower) || /(?:^|\/)(?:_layout|layout|template)\.[jt]sx?$/.test(lower)) return 'component';
  return 'module';
}

function inferRoute(rel, kind) {
  if (kind !== 'screen') return undefined;
  if (!/^(?:src\/)?(?:app|pages)\//.test(rel) && !rel.endsWith('.html')) return undefined;
  let route = rel.replace(/^(?:src\/)?(?:app|pages)\//, '').replace(/\.(?:[cm]?[jt]sx?|html|vue|svelte)$/, '');
  if (route === rel) return undefined;
  route = route.split('/').filter(p => !/^\(.*\)$/.test(p) && !['page', 'index'].includes(p)).join('/');
  return `/${route}`;
}

function inferLabel(rel, kind) {
  const parts = rel.split('/');
  let base = path.posix.basename(rel, path.posix.extname(rel));
  const readable = value => WORD_LABELS[value.toLowerCase()] || cleanText(value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' '), 120);
  const featureParts = parts.slice(0, -1).filter(p => !/^\(.*\)$/.test(p) && !['app', 'pages', 'src', 'screens', 'screen'].includes(p));
  if (['page', 'index'].includes(base)) {
    base = featureParts.at(-1) ?? 'home';
  }
  if (['layout', '_layout', 'template'].includes(base)) return '공통 레이아웃';
  if (kind === 'screen') {
    if (/^\[.*\]$/.test(base)) {
      const parent = [...featureParts].reverse().find(p => !/^\[.*\]$/.test(p));
      return `${parent ? readable(parent).replace(/ 목록$/, '') : '항목'} 상세`;
    }
    if (['edit', 'new', 'create'].includes(base.toLowerCase())) {
      const parent = [...featureParts].reverse().find(p => !/^\[.*\]$/.test(p) && p !== base);
      if (parent) return `${readable(parent).replace(/ 목록$/, '')} ${base.toLowerCase() === 'edit' ? '수정' : '만들기'}`;
    }
    const withoutSuffix = base.replace(/(?:Screen|Page|View)$/, '');
    if (WORD_LABELS[withoutSuffix.toLowerCase()]) return WORD_LABELS[withoutSuffix.toLowerCase()];
  }
  return readable(base) || rel;
}

function resolveImport(specifier, from, available, compiler) {
  const raw = specifier.split(/[?#]/)[0];
  if (!raw || /^(?:https?:|data:|node:|\/\/)/i.test(raw)) return null;
  function find(candidate) {
    const normalized = path.posix.normalize(candidate).replace(/^\.\//, '');
    if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) return null;
    const candidates = [normalized, ...RESOLVE_EXTENSIONS.map(ext => `${normalized}${ext}`), ...RESOLVE_EXTENSIONS.map(ext => `${normalized}/index${ext}`)];
    if (/\.[cm]?jsx?$/.test(normalized)) candidates.push(normalized.replace(/\.[cm]?jsx?$/, '.ts'), normalized.replace(/\.[cm]?jsx?$/, '.tsx'));
    return candidates.find(p => available.has(p)) ?? null;
  }
  if (raw.startsWith('.')) { const target = find(path.posix.join(path.posix.dirname(from), raw)); return target ? { target, confidence: 'confirmed' } : null; }
  if (raw.startsWith('/')) { const target = find(raw.slice(1)); return target ? { target, confidence: 'inferred' } : null; }
  for (const [pattern, replacements] of Object.entries(compiler.paths ?? {})) {
    const [prefix, suffix = ''] = pattern.split('*');
    const starred = pattern.includes('*');
    if ((starred && raw.startsWith(prefix) && raw.endsWith(suffix)) || (!starred && raw === pattern)) {
      const middle = starred ? raw.slice(prefix.length, suffix ? -suffix.length : undefined) : '';
      for (const replacement of replacements) {
        const target = find(path.posix.join(compiler.baseUrl ?? '', replacement.replace('*', middle)));
        if (target) return { target, confidence: 'confirmed' };
      }
    }
  }
  if (compiler.baseUrl) { const target = find(path.posix.join(compiler.baseUrl, raw)); if (target) return { target, confidence: 'confirmed' }; }
  if (raw.startsWith('@/') || raw.startsWith('~/')) {
    const tail = raw.slice(2), options = [...new Set([find(`src/${tail}`), find(tail)].filter(Boolean))];
    if (options.length === 1) return { target: options[0], confidence: 'inferred' };
  }
  return null;
}

async function gitInfo(root, state) {
  const gitRootText = await git(root, ['rev-parse', '--show-toplevel']);
  if (gitRootText === null) return { git: { available: false, branch: null, head: null, dirty: null }, changed: new Map() };
  const gitRoot = gitRootText.trim();
  const [branch, head, rawStatus] = await Promise.all([git(root, ['branch', '--show-current']), git(root, ['rev-parse', 'HEAD']), git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'])]);
  const changed = new Map(), status = (rawStatus ?? '').split('\0');
  let dirty = false;
  for (let i = 0; i < status.length; i++) {
    const entry = status[i];
    if (!entry) continue;
    const code = entry.slice(0, 2), repoRel = entry.slice(3);
    const abs = path.resolve(gitRoot, repoRel);
    if (inside(root, abs) && !inside(state, abs)) {
      const rel = relativeName(path.relative(root, abs));
      if (!rel.split('/').includes('.project-map')) { dirty = true; changed.set(rel, code.trim()); }
    }
    if (/[RC]/.test(code)) i++;
  }
  return { git: { available: true, branch: branch?.trim() || '(detached)', head: head?.trim() || null, dirty }, changed };
}

export async function scanProject(projectRoot, options = {}) {
  const root = await projectPath(projectRoot), state = await ensureState(root, options.stateDir);
  const warnings = ['Relationships are a bounded static scan, not a complete runtime or semantic dependency analysis.'];
  const [allFiles, repo] = await Promise.all([fileList(root, state, warnings), gitInfo(root, state)]);
  const filesToScan = allFiles.slice(0, MAX_FILES);
  if (allFiles.length > MAX_FILES) warnings.push(`Coverage limit: ${MAX_FILES} of ${allFiles.length} eligible files are scanned. Narrow the project directory before relying on impact analysis.`);
  const sources = new Map(); let skipped = 0;
  for (const rel of filesToScan) {
    try { const source = await safeSource(root, rel); if (source) sources.set(relativeName(rel), source); else skipped++; }
    catch { skipped++; }
  }
  if (skipped) warnings.push(`${skipped} files were skipped because they are unavailable, symbolic links, binary, or larger than ${MAX_FILE_BYTES} bytes.`);
  let projectName = path.basename(root), expo = false;
  try {
    const pkg = JSON.parse(sources.get('package.json')?.text ?? '{}');
    projectName = cleanText(pkg.name, 100) || projectName;
    expo = Boolean(pkg.dependencies?.['expo-router'] || pkg.devDependencies?.['expo-router']);
  } catch { warnings.push('package.json could not be parsed. Framework detection uses paths only.'); }
  let config = {};
  try { config = JSON.parse(sources.get('project-map.config.json')?.text ?? '{}'); if (!plainObject(config)) throw new Error(); }
  catch { config = {}; warnings.push('project-map.config.json is not valid JSON; label and relationship overrides were ignored.'); }
  if (cleanText(config.name)) projectName = cleanText(config.name);
  const compiler = { baseUrl: '', paths: {} };
  const compilerSource = sources.get('tsconfig.json') ?? sources.get('jsconfig.json');
  if (compilerSource) {
    try {
      const parsed = JSON.parse(stripJSONComments(compilerSource.text)), settings = parsed.compilerOptions ?? {};
      if (typeof settings.baseUrl === 'string' && !path.posix.isAbsolute(settings.baseUrl)) compiler.baseUrl = settings.baseUrl;
      if (plainObject(settings.paths)) for (const [key, value] of Object.entries(settings.paths)) if (Array.isArray(value) && value.every(v => typeof v === 'string')) compiler.paths[key] = value;
      if (parsed.extends) warnings.push('Inherited tsconfig/jsconfig options are not expanded; unresolved aliases may need a declared relationship.');
    } catch { warnings.push('tsconfig/jsconfig could not be parsed; only resolvable relative imports and unambiguous common aliases are used.'); }
  }
  const available = new Set(sources.keys()), nodes = [], files = [], edges = [];
  let unresolved = 0, external = 0, dynamic = 0, unsupported = 0;
  for (const [rel, source] of sources) {
    const ext = path.posix.extname(rel).toLowerCase(), inferredKind = classify(rel, expo);
    const configuredKind = plainObject(config.kinds) ? config.kinds[rel] : undefined;
    const kind = KINDS.has(configuredKind) ? configuredKind : inferredKind;
    const label = cleanText(plainObject(config.labels) ? config.labels[rel] : '', 120) || inferLabel(rel, kind);
    const node = { id: rel, label, kind, files: [rel], confidence: 'inferred', changed: repo.changed.has(rel), gitStatus: repo.changed.get(rel) ?? null };
    let route = inferRoute(rel, kind);
    if (kind === 'screen' && plainObject(config.routes) && Object.hasOwn(config.routes, rel)) {
      const configuredRoute = normalizeRoute(config.routes[rel]);
      if (configuredRoute) route = configuredRoute;
      else warnings.push('A route override was ignored because it was not a valid local route.');
    }
    if (route) node.route = route;
    const description = cleanText(plainObject(config.descriptions) ? config.descriptions[rel] : '', 400); if (description) node.description = description;
    nodes.push(node);
    const parseable = /\.(?:[cm]?[jt]sx?|vue|svelte|html|css|scss)$/.test(rel);
    const parsed = parseable ? parseImports(source.text, ext) : { imports: [], resources: [], dynamic: 0 };
    if (!parseable && ext !== '.json') unsupported++;
    const imports = [];
    for (const item of parsed.imports) {
      const resolution = resolveImport(item.specifier, rel, available, compiler);
      if (resolution && resolution.target !== rel) {
        imports.push(resolution.target);
        edges.push({ id: digest(`${rel}\0${resolution.target}\0imports`).slice(0, 20), source: rel, target: resolution.target, kind: 'imports', confidence: resolution.confidence, evidence: `${rel}:${item.line} imports ${cleanText(item.specifier, 240)}` });
      } else if (/^(?:\.|@\/|~\/|\/)/.test(item.specifier)) unresolved++;
      else external++;
    }
    dynamic += parsed.dynamic;
    files.push({ path: rel, hash: source.hash, size: source.size, kind, label, imports: [...new Set(imports)], resources: parsed.resources, changed: node.changed, gitStatus: node.gitStatus });
  }
  if (Array.isArray(config.relationships)) {
    for (const entry of config.relationships.slice(0, 1000)) {
      if (!plainObject(entry) || !available.has(entry.source) || !available.has(entry.target) || entry.source === entry.target) continue;
      const kind = EDGE_KINDS.has(entry.kind) ? entry.kind : 'uses';
      edges.push({ id: digest(`${entry.source}\0${entry.target}\0${kind}\0declared`).slice(0, 20), source: entry.source, target: entry.target, kind, confidence: 'inferred', evidence: cleanText(entry.reason, 240) || 'Declared in project-map.config.json; not runtime verified.' });
    }
  }
  const navigation = detectNavigation({ nodes, edges, sources, config, tokens });
  edges.push(...navigation.edges);
  warnings.push(...navigation.warnings);
  if (unresolved) warnings.push(`${unresolved} local import references could not be resolved. Dynamic routing, aliases, and generated files may require manual review.`);
  if (external) warnings.push(`${external} external or package import references are omitted from the local graph.`);
  if (dynamic) warnings.push(`${dynamic} variable or template imports are not resolved.`);
  if (unsupported) warnings.push(`${unsupported} non-JavaScript source files are listed, but their language-specific imports are not analyzed.`);
  if (!nodes.length) warnings.push('No supported source files were found. Choose the application source directory or add supported files.');
  const snapshotId = digest(JSON.stringify({ root, head: repo.git.head, files: files.map(f => [f.path, f.hash]) })).slice(0, 32);
  const map = { schemaVersion: SCHEMA_VERSION, project: { name: projectName, root, git: repo.git }, generatedAt: new Date().toISOString(), snapshotId, nodes, edges: [...new Map(edges.map(e => [e.id, e])).values()], files, warnings, coverage: { eligibleFiles: allFiles.length, scannedFiles: files.length, skippedFiles: skipped, limit: MAX_FILES, truncated: allFiles.length > MAX_FILES } };
  await atomicJSON(path.join(state, 'map.json'), map);
  return map;
}

const ARTIFACT_EXTENSIONS = new Set(['.json','.jsonl','.csv','.yaml','.yml','.xml','.plist','.png','.jpg','.jpeg','.webp','.svg','.ico','.avif','.gif','.txt','.md','.lock','.toml','.gradle']);
function allowedPlanFile(value, root, state) {
  if (allowedFile(value, root, state)) return true;
  return auditable(value) && !isSensitive(value) && inside(root, path.resolve(root,value)) && !inside(state,path.resolve(root,value)) &&
    (ARTIFACT_EXTENSIONS.has(path.extname(value).toLowerCase()) || path.basename(value)==='.gitignore');
}
function validPlanPaths(values, root, state, known, maximum = MAX_FILES) {
  return Array.isArray(values) && values.length <= maximum && new Set(values).size === values.length &&
    values.every(value => allowedPlanFile(value, root, state) && (!known || known.has(value)));
}

function validStatePaths(values, root, state, known, maximum = MAX_FILES) {
  return Array.isArray(values) && values.length <= maximum && new Set(values).size === values.length && values.every(value => allowedFile(value, root, state) && (!known || known.has(value)));
}

function validStateNodes(nodes, root, state, known, planNodes = false) {
  return Array.isArray(nodes) && nodes.length <= MAX_FILES && new Set(nodes.map(node => node?.id)).size === nodes.length && nodes.every(node => plainObject(node) && (planNodes ? allowedPlanFile(node.id, root, state) : allowedFile(node.id, root, state)) && (!known || known.has(node.id)) && Array.isArray(node.files) && node.files.length === 1 && node.files[0] === node.id && typeof node.label === 'string' && node.label.length <= 160 && KINDS.has(node.kind) && ['confirmed', 'inferred'].includes(node.confidence));
}

function validateStoredMap(map, root, state) {
  const invalid = () => { throw failure('Map contains invalid project metadata or paths. Rebuild the map.', 'INVALID_STATE'); };
  if (!plainObject(map) || map.schemaVersion !== SCHEMA_VERSION || map.project?.root !== root || !Array.isArray(map.files) || map.files.length > MAX_FILES || !Array.isArray(map.edges) || map.edges.length > MAX_FILES * 150 || typeof map.snapshotId !== 'string' || !/^[0-9a-f]{32}$/.test(map.snapshotId)) invalid();
  const known = new Set();
  for (const file of map.files) {
    if (!plainObject(file) || !allowedFile(file.path, root, state) || known.has(file.path) || !/^[0-9a-f]{64}$/.test(file.hash ?? '') || !KINDS.has(file.kind)) invalid();
    known.add(file.path);
  }
  if (!validStateNodes(map.nodes, root, state, known) || map.nodes.length !== known.size) invalid();
  for (const file of map.files) if (!validStatePaths(file.imports, root, state, known)) invalid();
  for (const edge of map.edges) if (!plainObject(edge) || !known.has(edge.source) || !known.has(edge.target) || !EDGE_KINDS.has(edge.kind) || !['confirmed', 'inferred'].includes(edge.confidence)) invalid();
  const expected = digest(JSON.stringify({ root, head: map.project.git?.head ?? null, files: map.files.map(f => [f.path, f.hash]) })).slice(0, 32);
  if (expected !== map.snapshotId) invalid();
}

function boundedText(value, limit, required = true) {
  return typeof value === 'string' && value.length <= limit && (!required || Boolean(value.trim())) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function validEdges(edges, known, maximum = MAX_FILES * 150) {
  return Array.isArray(edges) && edges.length <= maximum && edges.every(edge => plainObject(edge) && typeof edge.id === 'string' && edge.id.length <= 160 && known.has(edge.source) && known.has(edge.target) && EDGE_KINDS.has(edge.kind) && ['confirmed', 'inferred'].includes(edge.confidence) && (edge.evidence === undefined || boundedText(edge.evidence, 2000, false)));
}

function validGraph(graph, root, state) {
  if (!plainObject(graph) || !Array.isArray(graph.nodes) || graph.nodes.length > MAX_GRAPH_NODES || !validStateNodes(graph.nodes, root, state, undefined, true) || typeof graph.truncated !== 'boolean') return false;
  const known = new Set(graph.nodes.map(node => node.id));
  return validEdges(graph.edges, known, MAX_GRAPH_EDGES) && graph.nodes.every(node => (node.planned === undefined || typeof node.planned === 'boolean') && (node.changeStatus === undefined || ['added', 'modified', 'deleted'].includes(node.changeStatus)) && (node.action === undefined || (node.action === 'remove' && node.planned === true)));
}

function validEffect(effect, root, state, known) {
  return plainObject(effect) && allowedPlanFile(effect.nodeId, root, state) && known.has(effect.nodeId) && boundedText(effect.change, 1200) && boundedText(effect.expected, 2000) && boundedText(effect.verify, 2000);
}

function validFlowChange(change, known) {
  return plainObject(change) && known.has(change.source) && known.has(change.target) && change.source !== change.target && PLAN_EDGE_KINDS.has(change.kind) && ['add', 'remove'].includes(change.action) && boundedText(change.reason, 800);
}

function validatePlan(plan, root, state, baseline) {
  if (!plainObject(plan) || !Number.isSafeInteger(plan.revision) || plan.revision < 1 || plan.revision > 100000 || !/^[0-9a-f]{32}$/.test(plan.snapshotId ?? '') || !Number.isFinite(Date.parse(plan.createdAt)) || !boundedText(plan.summary, 4000) || !validPlanPaths(plan.writeFiles, root, state, undefined, MAX_PLAN_ITEMS) || !validGraph(plan.beforeGraph, root, state) || !validGraph(plan.afterGraph, root, state) || !Array.isArray(plan.newNodes) || plan.newNodes.length > MAX_PLAN_ITEMS || !validStateNodes(plan.newNodes, root, state, undefined, true)) return false;
  if (plan.artifactNodes !== undefined && !validStateNodes(plan.artifactNodes, root, state, undefined, true)) return false;
  const known = new Set([...baseline, ...(plan.artifactNodes || []).map(n => n.id), ...plan.beforeGraph.nodes.map(node => node.id), ...plan.afterGraph.nodes.map(node => node.id), ...plan.newNodes.map(node => node.id)]);
  if (!Array.isArray(plan.effects) || !plan.effects.length || plan.effects.length > MAX_PLAN_ITEMS || new Set(plan.effects.map(effect => effect?.nodeId)).size !== plan.effects.length || !plan.effects.every(effect => validEffect(effect, root, state, known))) return false;
  const effects = new Set(plan.effects.map(effect => effect.nodeId)), before = new Set(plan.beforeGraph.nodes.map(node => node.id)), after = new Set(plan.afterGraph.nodes.map(node => node.id));
  const removed = plan.removeNodeIds ?? [], alreadyRemoved = plan.alreadyRemovedNodeIds ?? [];
  if (!validPlanPaths(alreadyRemoved, root, state, new Set([...baseline,...(plan.artifactNodes||[]).map(n=>n.id)]), MAX_PLAN_ITEMS) || alreadyRemoved.some(id => !removed.includes(id) || before.has(id) || after.has(id))) return false;
  const removable = new Set([...before, ...alreadyRemoved]);
  if (!validPlanPaths(removed, root, state, removable, MAX_PLAN_ITEMS) || removed.some(id => !plan.writeFiles.includes(id) || !effects.has(id) || after.has(id) || plan.newNodes.some(node => node.id === id))) return false;
  if (plan.writeFiles.some(file => !effects.has(file)) || plan.effects.some(effect => !after.has(effect.nodeId) && !removed.includes(effect.nodeId)) || plan.newNodes.some(node => !plan.writeFiles.includes(node.id) || !after.has(node.id))) return false;
  if (plan.assetBindings !== undefined && (!plainObject(plan.assetBindings) || Object.entries(plan.assetBindings).some(([file, owner]) => !plan.writeFiles.includes(file) || !known.has(owner) || file===owner))) return false;
  return Array.isArray(plan.flowChanges) && plan.flowChanges.length <= MAX_PLAN_ITEMS && plan.flowChanges.every(change => validFlowChange(change, known)) && new Set(plan.flowChanges.map(change => [change.source, change.target, change.kind].join('\0'))).size === plan.flowChanges.length;
}

function approvalMatches(task) {
  const approval = task.approval, plan = task.plan;
  return Boolean(plan && plainObject(approval) && approval.decision === 'approve' && approval.revision === plan.revision && approval.snapshotId === plan.snapshotId && approval.planHash === digest(JSON.stringify(plan)) && ['dashboard', 'conversation'].includes(approval.source) && Number.isFinite(Date.parse(approval.reviewedAt)) && boundedText(approval.note, 4000, false));
}

function validReview(review) {
  return plainObject(review) && ['approve', 'revise'].includes(review.decision) && Number.isSafeInteger(review.revision) && review.revision > 0 && /^[0-9a-f]{32}$/.test(review.snapshotId ?? '') && ['dashboard', 'conversation'].includes(review.source) && Number.isFinite(Date.parse(review.reviewedAt)) && boundedText(review.note, 4000, false);
}

function validateStoredTask(task, id, root, state) {
  const invalid = () => { throw failure('Task contains invalid project metadata, plan, approval, or paths. Create a fresh task from the current map.', 'INVALID_STATE'); };
  if (!plainObject(task) || task.schemaVersion !== SCHEMA_VERSION || task.id !== id || task.projectRoot !== root || !Array.isArray(task.baseline) || task.baseline.length > MAX_FILES || !['queued', 'awaiting_review', 'approved', 'running', 'blocked', 'finalizing', 'finalization_failed', 'completed'].includes(task.status) || !INTENTS.has(task.intent) || typeof task.request !== 'string' || !task.request.trim() || task.request.length > 6000 || typeof task.snapshotId !== 'string' || !/^[0-9a-f]{32}$/.test(task.snapshotId) || !Number.isFinite(Date.parse(task.createdAt)) || !Number.isFinite(Date.parse(task.updatedAt))) invalid();
  if (task.reviewRequired !== undefined && task.reviewRequired !== true) invalid();
  if (task.parentTaskId !== undefined) { try { validTaskId(task.parentTaskId); } catch { invalid(); } if (task.parentTaskId === id) invalid(); }
  if (task.startedAt !== undefined && !Number.isFinite(Date.parse(task.startedAt))) invalid();
  const known = new Set();
  for (const file of task.baseline) {
    if (!plainObject(file) || !allowedFile(file.path, root, state) || known.has(file.path) || !/^[0-9a-f]{64}$/.test(file.hash ?? '')) invalid();
    known.add(file.path);
  }
  if (!validStateNodes(task.baselineNodes, root, state, known) || task.baselineNodes.length !== known.size || !validStatePaths(task.nodeIds, root, state, known, 30) || !task.nodeIds.length || !plainObject(task.impact) || task.impact.snapshotId !== task.snapshotId || task.impact.intent !== task.intent) invalid();
  if (task.baselineEdges !== undefined && !validEdges(task.baselineEdges, known)) invalid();
  for (const key of ['writeFiles', 'readFiles', 'verifyFiles', 'writeNodes', 'readNodes', 'verifyNodes', 'nodeIds']) if (!validStatePaths(task.impact[key], root, state, known)) invalid();
  if (task.impact.writeFiles.length !== task.nodeIds.length || task.nodeIds.some(file => !task.impact.writeFiles.includes(file)) || task.impact.nodeIds.length !== task.nodeIds.length || task.nodeIds.some(file => !task.impact.nodeIds.includes(file))) invalid();
  if (task.baselineGitHead !== undefined) {
    if (task.baselineGitHead !== null && (typeof task.baselineGitHead !== 'string' || !/^[0-9a-f]{40,64}$/.test(task.baselineGitHead))) invalid();
    const expected = digest(JSON.stringify({ root, head: task.baselineGitHead, files: task.baseline.map(file => [file.path, file.hash]) })).slice(0, 32);
    if (expected !== task.snapshotId) invalid();
  }
  if (task.plan !== undefined && !validatePlan(task.plan, root, state, known)) invalid();
  if (task.plan?.alreadyRemovedNodeIds?.length && !task.startedAt) invalid();
  if (task.approval != null && !approvalMatches(task)) invalid();
  if (task.lastReview !== undefined && !validReview(task.lastReview)) invalid();
  if (task.planHistory !== undefined && (!Array.isArray(task.planHistory) || task.planHistory.length > 5 || !task.planHistory.every(entry => plainObject(entry) && Number.isSafeInteger(entry.revision) && entry.revision > 0 && /^[0-9a-f]{32}$/.test(entry.snapshotId ?? '') && boundedText(entry.summary, 4000) && Number.isFinite(Date.parse(entry.createdAt))))) invalid();
  if (task.status === 'awaiting_review' && (!task.plan || task.approval != null)) invalid();
  if (task.status === 'approved' && !approvalMatches(task)) invalid();
  if (task.status === 'queued' && task.approval != null) invalid();
  if (task.reviewRequired && ['running', 'finalizing', 'finalization_failed', 'completed'].includes(task.status) && !approvalMatches(task)) invalid();
  const effectIds = new Set(task.plan?.effects.map(effect => effect.nodeId) ?? []);
  try { normalizeChecks(task.checks, effectIds); } catch { invalid(); }
  if (task.result !== undefined) {
    if (!plainObject(task.result) || !Array.isArray(task.result.changes) || task.result.changes.length > MAX_FILES * 2 || !validStateNodes(task.result.beforeNodes, root, state, known) || !validStateNodes(task.result.afterNodes, root, state)) invalid();
    for (const change of task.result.changes) if (!plainObject(change) || !allowedFile(change.path, root, state) || !['added', 'modified', 'deleted'].includes(change.status) || (change.beforeHash !== null && !/^[0-9a-f]{64}$/.test(change.beforeHash ?? '')) || (change.afterHash !== null && !/^[0-9a-f]{64}$/.test(change.afterHash ?? ''))) invalid();
    const changed = new Set(task.result.changes.map(change => change.path));
    if (!validStatePaths(task.result.outOfScopeFiles, root, state, changed, MAX_FILES * 2)) invalid();
    if (task.result.beforeGraph !== undefined && !validGraph(task.result.beforeGraph, root, state)) invalid();
    if (task.result.afterGraph !== undefined && !validGraph(task.result.afterGraph, root, state)) invalid();
    if (task.result.outcomes !== undefined) {
      if (!task.plan || !Array.isArray(task.result.outcomes) || task.result.outcomes.length !== task.plan.effects.length) invalid();
      for (let index = 0; index < task.plan.effects.length; index++) {
        const outcome = task.result.outcomes[index], effect = task.plan.effects[index];
        if (!plainObject(outcome) || ['nodeId', 'change', 'expected', 'verify'].some(key => outcome[key] !== effect[key])) invalid();
        const checks = (task.checks ?? []).filter(check => check.nodeId === effect.nodeId);
        if (outcome.status !== verificationFor(checks) || JSON.stringify(outcome.checks) !== JSON.stringify(checks)) invalid();
      }
    }
  }
}

export async function getMap(projectRoot, options = {}) {
  const root = await projectPath(projectRoot), state = await ensureState(root, options.stateDir);
  try {
    const map = await readJSON(path.join(state, 'map.json'));
    validateStoredMap(map, root, state);
    return map;
  } catch (error) { if (error.code === 'ENOENT') return scanProject(root, options); throw error; }
}

function selectedNodes(map, input) {
  if (!Array.isArray(input.nodeIds) || input.nodeIds.length < 1 || input.nodeIds.length > 30 || !input.nodeIds.every(id => typeof id === 'string')) throw failure('Select between 1 and 30 valid nodes.');
  const ids = [...new Set(input.nodeIds)], known = new Set(map.nodes.map(n => n.id));
  if (ids.some(id => !known.has(id))) throw failure('A selected node no longer exists. Refresh the map.', 'NODE_NOT_FOUND', 409);
  return ids;
}

export function analyzeImpact(map, input = {}) {
  if (!map || map.schemaVersion !== SCHEMA_VERSION || !Array.isArray(map.nodes) || !Array.isArray(map.edges)) throw failure('A valid project map is required.');
  const ids = selectedNodes(map, input), intent = input.intent ?? 'display';
  if (!INTENTS.has(intent)) throw failure('intent must be display, behavior, or contract.');
  const nodes = new Map(map.nodes.map(n => [n.id, n])), adjacency = new Map(), reverse = new Map(), navigation = [];
  for (const edge of map.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    if (edge.kind === 'navigates') { navigation.push(edge); continue; }
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!reverse.has(edge.target)) reverse.set(edge.target, new Set());
    adjacency.get(edge.source).add(edge.target); reverse.get(edge.target).add(edge.source);
  }
  const write = new Set(ids), read = new Set(), verify = new Set(ids), reasons = [];
  const depth = intent === 'display' ? 1 : 3;
  let frontier = [...ids];
  for (let level = 0; level < depth; level++) {
    const next = [];
    for (const id of frontier) for (const target of adjacency.get(id) ?? []) if (!write.has(target) && !read.has(target)) { read.add(target); next.push(target); }
    frontier = next;
  }
  // Reverse reachability is intentionally conservative; using a module does not
  // imply that every consumer must be changed, only that it may need verification.
  const queue = [...ids], seen = new Set(ids);
  while (queue.length) for (const source of reverse.get(queue.shift()) ?? []) if (!seen.has(source)) { seen.add(source); verify.add(source); queue.push(source); }
  if (intent !== 'display') {
    const affected = new Set([...write, ...read, ...verify]);
    for (const edge of navigation) if (affected.has(edge.source) || affected.has(edge.target)) { verify.add(edge.source); verify.add(edge.target); }
    if (navigation.some(edge => affected.has(edge.source) || affected.has(edge.target))) reasons.push('화면 이동으로 연결된 이웃 화면도 검증 후보입니다. 이동 관계는 코드 의존성과 다르며 실제 사용자 흐름은 실행해서 확인해야 합니다.');
  }
  const records = new Map((map.files ?? []).map(f => [f.path, f]));
  const resourceKeys = new Set();
  if (intent !== 'display') for (const id of [...write, ...read]) for (const file of nodes.get(id)?.files ?? []) for (const resource of records.get(file)?.resources ?? []) resourceKeys.add(`${resource.type}:${resource.key}`);
  for (const node of map.nodes) {
    if (node.files.some(file => (records.get(file)?.resources ?? []).some(r => resourceKeys.has(`${r.type}:${r.key}`)))) verify.add(node.id);
  }
  reasons.push('선택한 기능은 수정 후보, 의존하는 코드는 참고 대상, 이를 사용하는 기능은 검증 후보입니다.');
  if (intent === 'contract') reasons.push('데이터·API 형식 변경: 공유 규칙을 먼저 확인하세요. 참고 파일은 자동 수정 대상으로 승격하지 않으며 필요한 파일을 명시적으로 추가합니다.');
  if (resourceKeys.size) reasons.push('같은 데이터 테이블 또는 API 경로를 참조하는 파일도 검증 후보에 포함했습니다. 문자열 기반 추정이므로 실제 사용 여부를 확인하세요.');
  for (const id of write) read.delete(id);
  const filesFor = set => [...new Set([...set].flatMap(id => nodes.get(id)?.files ?? []))].sort();
  const writeFiles = filesFor(write), readFiles = filesFor(read), verifyFiles = filesFor(verify);
  const footprint = new Set([...writeFiles, ...readFiles, ...verifyFiles]);
  const parallelCandidates = [];
  for (const candidate of map.nodes.filter(n => n.kind === 'screen')) {
    if (write.has(candidate.id) || verify.has(candidate.id) || read.has(candidate.id)) continue;
    const candidateFiles = new Set(candidate.files);
    const direct = adjacency.get(candidate.id) ?? new Set();
    const overlapsWrite = [...direct].some(id => write.has(id)) || candidate.files.some(f => footprint.has(f));
    const sharesResource = candidate.files.some(f => (records.get(f)?.resources ?? []).some(r => resourceKeys.has(`${r.type}:${r.key}`)));
    if (!overlapsWrite && !sharesResource && ![...candidateFiles].some(f => writeFiles.includes(f))) {
      parallelCandidates.push({ nodeId: candidate.id, label: candidate.label, reason: '표시·문구 변경에 한한 병렬 후보입니다. 공통 파일·데이터 형식을 변경하지 않는 조건이며 다른 작업의 실제 수정 범위와 다시 비교해야 합니다.' });
    }
    if (parallelCandidates.length >= 8) break;
  }
  return { nodeIds: ids, intent, snapshotId: map.snapshotId, writeFiles, readFiles, verifyFiles, writeNodes: [...write], readNodes: [...read], verifyNodes: [...verify], reasons, parallelCandidates, warnings: ['이 범위는 정적 분석에 따른 후보이며 파일 접근 권한을 제한하거나 병렬 작업의 안전성을 보장하지 않습니다.', ...(map.coverage?.truncated ? ['프로젝트 분석이 파일 수 제한으로 일부만 수행되었습니다.'] : [])] };
}

function validTaskId(id) {
  if (typeof id !== 'string' || !/^task-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw failure('Invalid task ID.');
  return id;
}

async function safeWriteTarget(root, state, relativePath, code = 'INVALID_INPUT') {
  if (!allowedPlanFile(relativePath, root, state)) throw failure('Plan files must be supported source or artifact paths inside this project, outside secrets, generated files, and state storage.', code);
  let current = root;
  const parts = relativePath.split('/');
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw failure('A planned source path must not pass through a symbolic link or non-file target.', code);
  }
}

function graphNode(node, options = {}) {
  return { id: node.id, label: node.label, kind: node.kind, files: [...node.files], confidence: node.confidence ?? 'inferred', ...(node.artifact ? { artifact: true } : {}), ...(node.route ? { route: node.route } : {}), ...(options.planned ? { planned: true } : {}), ...(options.action ? { action: options.action } : {}), ...(options.changeStatus ? { changeStatus: options.changeStatus } : {}) };
}

function focusedGraph(nodes, edges, seeds, options = {}) {
  const known = new Map(nodes.map(node => [node.id, node])), seedIds = [...new Set(seeds)].filter(id => known.has(id));
  const chosen = new Set(seedIds.slice(0, MAX_GRAPH_NODES)), initial = new Set(chosen);
  let truncated = seedIds.length > MAX_GRAPH_NODES;
  const orderedEdges = [...edges].sort((left, right) => Number(right.kind === 'navigates') - Number(left.kind === 'navigates'));
  for (const edge of orderedEdges) {
    if (!initial.has(edge.source) && !initial.has(edge.target)) continue;
    for (const id of [edge.source, edge.target]) {
      if (chosen.has(id) || !known.has(id)) continue;
      if (chosen.size < MAX_GRAPH_NODES) chosen.add(id); else truncated = true;
    }
  }
  const resultEdges = [];
  for (const edge of orderedEdges) {
    if (!chosen.has(edge.source) || !chosen.has(edge.target)) continue;
    if (resultEdges.length >= MAX_GRAPH_EDGES) { truncated = true; continue; }
    resultEdges.push({ id: edge.id, source: edge.source, target: edge.target, kind: edge.kind, confidence: edge.confidence, evidence: cleanText(edge.evidence, 2000), ...(edge.planned ? { planned: true, action: edge.action } : {}) });
  }
  return { nodes: [...chosen].map(id => graphNode(known.get(id), { planned: options.planned?.has(id) || options.removed?.has(id), action: options.removed?.has(id) ? 'remove' : undefined, changeStatus: options.changes?.get(id) })), edges: resultEdges, truncated };
}

export async function createTask(projectRoot, input, options = {}) {
  if (!plainObject(input)) throw failure('Task input must be an object.');
  if (typeof input.request !== 'string' || !input.request.trim() || input.request.length > 6000) throw failure('Write a request between 1 and 6000 characters.');
  if (input.reviewRequired === false || input.approval !== undefined || input.plan !== undefined) throw failure('A request cannot approve itself or bypass visual plan review.');
  const root = await projectPath(projectRoot), map = await scanProject(root, options);
  if (input.snapshotId !== undefined && input.snapshotId !== map.snapshotId) throw failure('The project changed after this map was shown. Refresh the map and review the scope before creating the task.', 'STALE_SNAPSHOT', 409);
  if (input.parentTaskId !== undefined) {
    const parent = await getTask(root, input.parentTaskId, options);
    if (parent.status !== 'completed') throw failure('Follow-up work must reference a completed task in this project.', 'INVALID_PARENT_TASK', 409);
  }
  const impact = analyzeImpact(map, input), state = await ensureState(root, options.stateDir), now = new Date().toISOString();
  const task = { schemaVersion: SCHEMA_VERSION, id: 'task-' + crypto.randomUUID(), status: 'queued', reviewRequired: true, approval: null, createdAt: now, updatedAt: now, request: input.request.trim(), nodeIds: impact.nodeIds, intent: impact.intent, impact, snapshotId: map.snapshotId, projectRoot: root, baseline: map.files.map(({ path: filePath, hash }) => ({ path: filePath, hash })), baselineNodes: map.nodes, baselineEdges: map.edges, baselineCoverage: map.coverage, baselineGitHead: map.project.git.head, checks: [], verificationStatus: 'not_run', ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}) };
  await atomicJSON(path.join(state, 'tasks', task.id + '.json'), task);
  return task;
}

export async function getTask(projectRoot, id, options = {}) {
  const root = await projectPath(projectRoot), state = await ensureState(root, options.stateDir);
  try {
    const task = await readJSON(path.join(state, 'tasks', validTaskId(id) + '.json'));
    validateStoredTask(task, id, root, state);
    if (task.status !== 'completed') for (const file of task.plan?.writeFiles ?? []) await safeWriteTarget(root, state, file, 'INVALID_STATE');
    return task;
  } catch (error) { if (error.code === 'ENOENT') throw failure('Task not found.', 'TASK_NOT_FOUND', 404); throw error; }
}

export async function listTasks(projectRoot, options = {}) {
  const root = await projectPath(projectRoot), state = await ensureState(root, options.stateDir), result = [];
  const names = await fs.readdir(path.join(state, 'tasks'));
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try { result.push(await getTask(root, name.slice(0, -5), options)); }
    catch { /* An invalid neighboring file must not hide other valid tasks. */ }
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function proposeTask(projectRoot, id, input, options = {}) {
  if (!plainObject(input) || Object.keys(input).some(key => !['summary', 'writeFiles', 'effects', 'newNodes', 'removeNodeIds', 'flowChanges', 'assetBindings'].includes(key))) throw failure('Plan input may contain summary, writeFiles, effects, newNodes, removeNodeIds, and flowChanges only.');
  if (!boundedText(input.summary, 4000)) throw failure('A plan needs a clear summary of at most 4000 characters.');
  const root = await projectPath(projectRoot), state = await ensureState(root, options.stateDir), task = await getTask(root, id, options);
  if (task.status === 'completed') throw failure('A completed task cannot be replanned. Create a follow-up request.', 'TASK_COMPLETED', 409);
  const map = await scanProject(root, options);
  if (!task.plan && !task.startedAt && task.status !== 'blocked' && map.snapshotId !== task.snapshotId) throw failure('The project changed before its first plan. Create a fresh request from the current map.', 'STALE_SNAPSHOT', 409);
  if (!validPlanPaths(input.writeFiles, root, state, undefined, MAX_PLAN_ITEMS)) throw failure('writeFiles must contain at most 60 unique safe source/artifact paths; use an empty array for verification-only work.');
  const current = new Map(map.nodes.map(node => [node.id, node])), baseline = new Map(task.baselineNodes.map(node => [node.id, node]));
  for (const node of task.plan?.artifactNodes || []) baseline.set(node.id,node);
  const artifactNodes = new Map((task.plan?.artifactNodes || []).map(node=>[node.id,node]));
  const broad = await inventory(root, options), broadFiles = new Map(broad.files.map(file=>[file.path,file]));
  for (const file of input.writeFiles) {
    if (current.has(file) || allowedFile(file,root,state)) continue;
    const record = broadFiles.get(file);
    if (record && !record.sensitive) {
      const node = { id:file, label:path.basename(file), kind:/\.(jsonl?|csv|txt|md)$/i.test(file)?'data':'config', files:[file], confidence:'inferred', artifact:true };
      current.set(file,node); artifactNodes.set(file,node); map.nodes.push(node);
    }
  }
  const newNodes = [];
  if (input.newNodes !== undefined && (!Array.isArray(input.newNodes) || input.newNodes.length > MAX_PLAN_ITEMS)) throw failure('newNodes must contain at most 60 planned source nodes.');
  for (const node of input.newNodes ?? []) {
    if (!plainObject(node) || !allowedPlanFile(node.id, root, state) || current.has(node.id) || baseline.has(node.id) || newNodes.some(existing => existing.id === node.id) || !input.writeFiles.includes(node.id) || !boundedText(node.label, 120) || !KINDS.has(node.kind)) throw failure('Each new node needs a unique planned source path in writeFiles, a label, and a supported kind.');
    const route = inferRoute(node.id, node.kind);
    newNodes.push({ id: node.id, label: node.label.trim(), kind: node.kind, files: [node.id], confidence: 'inferred', planned: true, ...(!allowedFile(node.id,root,state) ? {artifact:true} : {}), ...(route ? { route } : {}) });
  }
  const known = new Map([...baseline, ...current, ...newNodes.map(node => [node.id, node])]);
  for (const node of newNodes.filter(n=>n.artifact)) artifactNodes.set(node.id,node);
  const assetBindings = input.assetBindings ?? {};
  if (!plainObject(assetBindings) || Object.entries(assetBindings).some(([file,owner])=>!input.writeFiles.includes(file)||!artifactNodes.has(file)||!current.has(owner)||current.get(owner).artifact||file===owner)) throw failure('assetBindings must link planned artifacts to existing source feature nodes.');
  for (const [file,owner] of Object.entries(assetBindings)) if(current.has(file)) map.edges.push({id:digest(owner+'\0'+file+'\0artifact').slice(0,20),source:owner,target:file,kind:'uses',confidence:'inferred',evidence:'Declared artifact membership; not a runtime-verified dependency.'});

  for (const file of input.writeFiles) {
    await safeWriteTarget(root, state, file);
    if (!known.has(file)) throw failure('Every new write file needs a matching newNodes entry.');
    if (!current.has(file) && !baseline.has(file)) {
      const ignored = await git(root, ['check-ignore', '--', file]);
      if (ignored?.trim()) throw failure('A planned new source file is ignored by Git. Choose a visible source path.');
      try { await fs.lstat(path.join(root, file)); throw failure('A planned new file already exists outside scan coverage. Choose an indexed source or a new file.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  if (!Array.isArray(input.effects) || !input.effects.length || input.effects.length > MAX_PLAN_ITEMS || new Set(input.effects.map(effect => effect?.nodeId)).size !== input.effects.length || !input.effects.every(effect => validEffect(effect, root, state, new Set(known.keys())))) throw failure('Describe 1 to 60 distinct node effects, each with nodeId, change, expected result, and how to verify it.');
  const effects = input.effects.map(effect => ({ nodeId: effect.nodeId, change: effect.change.trim(), expected: effect.expected.trim(), verify: effect.verify.trim() }));
  if (input.writeFiles.some(file => !effects.some(effect => effect.nodeId === file))) throw failure('Every write file must appear as a node effect in the visual plan.');
  const removeNodeIds = input.removeNodeIds ?? [];
  // A running task can carry forward a deletion that was already reviewed. Do
  // not reinterpret every source missing from the original baseline as an
  // authorized deletion: it may be an unrelated edit or an omitted scan file.
  const priorRemovals = new Set(task.startedAt ? [
    ...(approvalMatches(task) ? task.plan.removeNodeIds ?? [] : []),
    ...(task.plan?.alreadyRemovedNodeIds ?? []),
  ] : []);
  const removable = new Set([...current.keys(), ...[...priorRemovals].filter(nodeId => baseline.has(nodeId))]);
  if (!validPlanPaths(removeNodeIds, root, state, removable, MAX_PLAN_ITEMS) || removeNodeIds.some(nodeId => !input.writeFiles.includes(nodeId) || !effects.some(effect => effect.nodeId === nodeId) || newNodes.some(node => node.id === nodeId))) throw failure('removeNodeIds must name current nodes or already reviewed deletions in this running task, included in writeFiles and effects.');
  const removedNodes = new Set(removeNodeIds), alreadyRemovedNodeIds = removeNodeIds.filter(nodeId => !current.has(nodeId));
  for (const nodeId of alreadyRemovedNodeIds) {
    try { await fs.lstat(path.join(root, nodeId)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw failure('A previously reviewed removal is missing from scan coverage but its file still exists. Review source coverage before replanning.');
  }
  if (effects.some(effect => !current.has(effect.nodeId) && !newNodes.some(node => node.id === effect.nodeId) && !removedNodes.has(effect.nodeId))) throw failure('A missing node cannot be restored implicitly. Keep a previously reviewed deletion in removeNodeIds or remove the missing node from this plan.');
  const flowChanges = input.flowChanges ?? [];
  if (!Array.isArray(flowChanges) || flowChanges.length > MAX_PLAN_ITEMS || !flowChanges.every(change => validFlowChange(change, new Set(known.keys()))) || new Set(flowChanges.map(change => [change.source, change.target, change.kind].join('\0'))).size !== flowChanges.length) throw failure('flowChanges needs distinct known endpoints, an allowed kind, add/remove action, and a reason (at most 60).');
  const normalizedFlows = flowChanges.map(change => ({ source: change.source, target: change.target, kind: change.kind, action: change.action, reason: change.reason.trim() }));
  for (const change of normalizedFlows) if (change.action === 'add' && (removedNodes.has(change.source) || removedNodes.has(change.target))) throw failure('A new flow cannot refer to a node the plan removes.');
  for (const change of normalizedFlows) if (change.action === 'remove' && !map.edges.some(edge => edge.source === change.source && edge.target === change.target && edge.kind === change.kind)) throw failure('A flow removal must refer to a relationship present in the current map.');
  const edgeKey = edge => [edge.source, edge.target, edge.kind].join('\0');
  const removed = new Set(normalizedFlows.filter(change => change.action === 'remove').map(edgeKey));
  const afterEdges = map.edges.filter(edge => !removed.has(edgeKey(edge)) && !removedNodes.has(edge.source) && !removedNodes.has(edge.target));
  for (const change of normalizedFlows.filter(change => change.action === 'add')) {
    if (afterEdges.some(edge => edgeKey(edge) === edgeKey(change))) continue;
    afterEdges.push({ id: digest(edgeKey(change) + '\0planned').slice(0, 20), source: change.source, target: change.target, kind: change.kind, confidence: 'inferred', evidence: 'Planned relationship: ' + change.reason, planned: true, action: 'add' });
  }
  for(const [file,owner] of Object.entries(assetBindings)) if(!current.has(file)) afterEdges.push({id:digest(owner+'\0'+file+'\0artifact').slice(0,20),source:owner,target:file,kind:'uses',confidence:'inferred',evidence:'Planned artifact membership; verify after implementation.',planned:true,action:'add'});
  const seeds = [...effects.map(effect => effect.nodeId), ...task.nodeIds, ...normalizedFlows.flatMap(change => [change.source, change.target])];
  const beforeEdges = map.edges.map(edge => removed.has(edgeKey(edge)) ? { ...edge, planned: true, action: 'remove' } : edge);
  const afterNodes = [...[...current.values()].filter(node => !removedNodes.has(node.id)), ...newNodes];
  const now = new Date().toISOString();
  const plan = { revision: (task.plan?.revision ?? 0) + 1, snapshotId: map.snapshotId, summary: input.summary.trim(), writeFiles: [...input.writeFiles], effects, newNodes, removeNodeIds: [...removeNodeIds], alreadyRemovedNodeIds, flowChanges: normalizedFlows, assetBindings, artifactNodes:[...artifactNodes.values()], beforeGraph: focusedGraph(map.nodes, beforeEdges, seeds, { removed: removedNodes }), afterGraph: focusedGraph(afterNodes, afterEdges, seeds, { planned: new Set(input.writeFiles) }), createdAt: now };
  if (!validatePlan(plan, root, state, new Set(baseline.keys()))) throw failure('The plan exceeds the focused graph limits. Split the request into smaller plans.');
  const history = [...(task.planHistory ?? []), ...(task.plan ? [{ revision: task.plan.revision, snapshotId: task.plan.snapshotId, summary: task.plan.summary, createdAt: task.plan.createdAt }] : [])].slice(-5);
  const next = { ...task, status: 'awaiting_review', reviewRequired: true, plan, planHistory: history, approval: null, updatedAt: now };
  if (next.baselineEdges === undefined && task.snapshotId === map.snapshotId) next.baselineEdges = map.edges;
  await atomicJSON(path.join(state, 'tasks', id + '.json'), next);
  return next;
}

export async function reviewTask(projectRoot, id, input, options = {}) {
  if (!plainObject(input) || Object.keys(input).some(key => !['decision', 'revision', 'snapshotId', 'note', 'source'].includes(key)) || !['approve', 'revise'].includes(input.decision) || !Number.isSafeInteger(input.revision) || input.revision < 1 || !/^[0-9a-f]{32}$/.test(input.snapshotId ?? '') || (input.note !== undefined && !boundedText(input.note, 4000, false)) || (input.source !== undefined && !['dashboard', 'conversation'].includes(input.source))) throw failure('Review needs approve/revise, the exact plan revision and snapshotId, and an optional note/source.');
  const root = await projectPath(projectRoot), task = await getTask(root, id, options), state = await ensureState(root, options.stateDir);
  if (!['awaiting_review', 'approved'].includes(task.status) || !task.plan) throw failure('Review the proposed plan before approving or requesting revisions.', 'REVIEW_REQUIRED', 409);
  if (input.revision !== task.plan.revision || input.snapshotId !== task.plan.snapshotId) throw failure('This review refers to an older plan. Read the latest preview before reviewing it.', 'STALE_PLAN', 409);
  const map = await scanProject(root, options);
  if (map.snapshotId !== task.plan.snapshotId) throw failure('The project changed after the plan was prepared. Request an updated plan before reviewing it.', 'STALE_SNAPSHOT', 409);
  const now = new Date().toISOString(), review = { decision: input.decision, revision: input.revision, snapshotId: input.snapshotId, source: input.source ?? 'conversation', note: input.note?.trim() ?? '', reviewedAt: now };
  const next = { ...task, status: input.decision === 'approve' ? 'approved' : 'queued', approval: input.decision === 'approve' ? { ...review, planHash: digest(JSON.stringify(task.plan)) } : null, lastReview: review, updatedAt: now };
  await atomicJSON(path.join(state, 'tasks', id + '.json'), next);
  return next;
}

export async function updateTask(projectRoot, id, patch, options = {}) {
  if (!plainObject(patch)) throw failure('Task update must be an object.');
  if (Object.keys(patch).some(key => !['status', 'note'].includes(key))) throw failure('Only status and note may be updated. Review plans and complete tasks through their dedicated operations.');
  const root = await projectPath(projectRoot), task = await getTask(root, id, options), state = await ensureState(root, options.stateDir);
  if (task.status === 'completed') throw failure('A completed task cannot be changed. Create a new task for follow-up work.', 'TASK_COMPLETED', 409);
  if (patch.status !== undefined && !['queued', 'running', 'blocked'].includes(patch.status)) throw failure('Status must be queued, running, or blocked; approval requires a separate review.');
  if (patch.note !== undefined && (typeof patch.note !== 'string' || patch.note.length > 4000)) throw failure('Task note must be at most 4000 characters.');
  if (patch.status === 'running' && task.status !== 'running') {
    if (!approvalMatches(task) || !['approved', 'blocked'].includes(task.status)) throw failure('A current visual plan must be explicitly approved before this task can start.', 'REVIEW_REQUIRED', 409);
    const current = await scanProject(root, options);
    if (current.snapshotId !== task.plan.snapshotId) throw failure('Project changed after plan approval. Prepare and review an updated plan before starting.', 'STALE_SNAPSHOT', 409);
  }
  const transitions = { queued: ['queued', 'blocked'], awaiting_review: ['queued', 'blocked'], approved: ['queued', 'running', 'blocked'], running: ['running', 'blocked'], blocked: ['blocked', 'running', 'queued'] };
  if (!transitions[task.status] || (patch.status && !transitions[task.status].includes(patch.status))) throw failure('This task status transition is not allowed.', 'INVALID_TRANSITION', 409);
  const now = new Date().toISOString();
  const next = { ...task, ...(patch.status ? { status: patch.status } : {}), ...(patch.status === 'queued' ? { approval: null } : {}), ...(patch.status === 'running' && !task.startedAt ? { startedAt: now } : {}), ...(patch.note !== undefined ? { note: patch.note } : {}), updatedAt: now };
  await atomicJSON(path.join(state, 'tasks', id + '.json'), next);
  return next;
}

function normalizeChecks(checks, effectIds = new Set()) {
  if (checks === undefined) return [];
  if (!Array.isArray(checks) || checks.length > 50) throw failure('checks must be an array of at most 50 results.');
  return checks.map(check => {
    if (!plainObject(check) || typeof check.name !== 'string' || !check.name.trim() || !['passed', 'failed', 'not_run'].includes(check.status)) throw failure('Each check needs a name and status: passed, failed, or not_run.');
    if (check.nodeId !== undefined && (typeof check.nodeId !== 'string' || !effectIds.has(check.nodeId))) throw failure('A linked check must reference a nodeId from this plan\'s effects.');
    return { name: cleanText(check.name, 200), status: check.status, ...(typeof check.detail === 'string' ? { detail: cleanText(check.detail, 1000) } : {}), ...(check.nodeId ? { nodeId: check.nodeId } : {}), ...(check.source && ['tool', 'agent', 'user'].includes(check.source) ? { source: check.source } : {}), ...(typeof check.evidenceId === 'string' ? { evidenceId: cleanText(check.evidenceId, 100) } : {}) };
  });
}

function verificationFor(checks) {
  return checks.some(check => check.status === 'failed') ? 'failed' : !checks.length || checks.some(check => check.status === 'not_run') ? 'not_run' : 'passed';
}

export async function completeTask(projectRoot, id, input = {}, options = {}) {
  if (!plainObject(input)) throw failure('Completion input must be an object.');
  if (input.summary !== undefined && (typeof input.summary !== 'string' || input.summary.length > 6000)) throw failure('Summary must be at most 6000 characters.');
  const root = await projectPath(projectRoot), task = await getTask(root, id, options);
  if (task.status === 'completed') return task;
  if (!['running', 'finalizing', 'finalization_failed'].includes(task.status) || (task.reviewRequired && !approvalMatches(task))) throw failure('Only a running task may be completed. Prepare, review, and start the plan first.', 'REVIEW_REQUIRED', 409);
  const checks = normalizeChecks(input.checks, new Set(task.plan?.effects.map(effect => effect.nodeId) ?? []));
  const map = await scanProject(root, options), state = await ensureState(root, options.stateDir);
  const before = new Map(task.baseline.map(file => [file.path, file.hash])), after = new Map(map.files.map(file => [file.path, file.hash]));
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort(), changes = [];
  const planned = new Set(task.plan?.writeFiles ?? task.impact.writeFiles);
  for (const filePath of paths) {
    if (before.get(filePath) === after.get(filePath)) continue;
    const status = !before.has(filePath) ? 'added' : !after.has(filePath) ? 'deleted' : 'modified';
    changes.push({ path: filePath, status, type: status, beforeHash: before.get(filePath) ?? null, afterHash: after.get(filePath) ?? null, outOfScope: !planned.has(filePath) });
  }
  const changedPaths = new Set(changes.map(change => change.path)), changeStatuses = new Map(changes.map(change => [change.path, change.status]));
  const outcomes = (task.plan?.effects ?? []).map(effect => {
    const linked = checks.filter(check => check.nodeId === effect.nodeId);
    return { ...effect, status: verificationFor(linked), checks: linked };
  });
  const verificationStatus = verificationFor([...checks, ...outcomes.map(outcome => ({ status: outcome.status }))]);
  const focus = [...(task.plan?.effects.map(effect => effect.nodeId) ?? []), ...task.nodeIds, ...changedPaths, ...(task.plan?.flowChanges.flatMap(change => [change.source, change.target]) ?? [])];
  const comparisonIncomplete = !task.baselineCoverage || task.baselineCoverage.truncated || task.baselineCoverage.skippedFiles > 0 || map.coverage?.truncated || map.coverage?.skippedFiles > 0;
  const beforeGraph = focusedGraph(task.baselineNodes, task.baselineEdges ?? [], focus, { changes: changeStatuses });
  const afterGraph = focusedGraph(map.nodes, map.edges, focus, { changes: changeStatuses });
  const result = { summary: input.summary?.trim() ?? '', checks, verificationStatus, changes, outOfScopeFiles: changes.filter(change => change.outOfScope).map(change => change.path), beforeNodes: task.baselineNodes.filter(node => node.files.some(file => changedPaths.has(file))), afterNodes: map.nodes.filter(node => node.files.some(file => changedPaths.has(file))), beforeGraph, afterGraph, ...(task.plan ? { outcomes } : {}), beforeSnapshotId: task.snapshotId, afterSnapshotId: map.snapshotId, comparisonCoverage: { sourceFilesOnly: true, completeWithinScannedSources: !comparisonIncomplete, before: task.baselineCoverage ?? null, after: map.coverage }, warnings: ['Changes are differences since task creation, not proof that this task caused every change. Concurrent edits require review.', 'File changes and inferred flow edges do not prove that the expected behavior works. Only explicitly linked recorded checks affect each node outcome.', 'This comparison covers scanned source files only. Ignored files, unsupported formats, dependencies, and secrets are outside the comparison.', ...(task.baselineEdges === undefined ? ['This legacy task did not record its original relationships; the before graph cannot reconstruct them.'] : []), ...(beforeGraph.truncated || afterGraph.truncated ? ['The focused result graph is bounded; inspect the full file change list for changes outside the displayed nodes.'] : []), ...(comparisonIncomplete ? ['Coverage is incomplete; a missing file may have been skipped rather than deleted. Review additions, deletions, and out-of-scope findings against Git before relying on them.'] : [])] };
  const now = new Date().toISOString();
  const next = { ...task, status: 'completed', updatedAt: now, completedAt: now, checks, verificationStatus, result };
  if (options.prepareOnly) return next;
  await atomicJSON(path.join(state, 'tasks', id + '.json'), next);
  return next;
}


// Host-only finalization primitives. Normal status updates cannot forge completion.
export async function markFinalization(projectRoot, id, status, message = '', options = {}) {
  if (!['finalizing', 'finalization_failed'].includes(status)) throw failure('Invalid finalization status.');
  const root = await projectPath(projectRoot), state = await ensureState(root, options.stateDir);
  const task = await getTask(root, id, options);
  if (!['running', 'finalizing', 'finalization_failed'].includes(task.status)) throw failure('Only started work may be finalized.', 'INVALID_TRANSITION', 409);
  const next = { ...task, status, finalization: { status, message: cleanText(message, 1000), at: new Date().toISOString() }, updatedAt: new Date().toISOString() };
  await atomicJSON(path.join(state, 'tasks', id + '.json'), next);
  return next;
}

export async function publishCompletion(projectRoot, id, candidate, options = {}) {
  const root = await projectPath(projectRoot), state = await ensureState(root, options.stateDir);
  const current = await getTask(root, id, options);
  if (!['finalizing', 'finalization_failed'].includes(current.status) || current.plan?.revision !== candidate.plan?.revision || current.approval?.planHash !== candidate.approval?.planHash)
    throw failure('Finalization context changed. Retry using the current task.', 'STALE_FINALIZATION', 409);
  const next = { ...candidate, finalization: { status: 'complete', at: new Date().toISOString() } };
  validateStoredTask(next, id, root, state);
  await atomicJSON(path.join(state, 'tasks', id + '.json'), next);
  return next;
}
