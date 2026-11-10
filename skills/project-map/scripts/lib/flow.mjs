import crypto from 'node:crypto';

// A bounded source heuristic, deliberately not a JavaScript/JSX AST or router.
// Every resulting edge is inferred, including direct literal links. Imports do
// not prove that a component is rendered, or that a navigation call is reached.
const MAX_IMPORT_DEPTH = 4;
const MAX_IMPORT_VISITS = 512;
const MAX_ORIGIN_SCREENS = 128;
const MAX_TAG_TOKENS = 512;
const MAX_LITERALS_PER_FILE = 256;
const MAX_NAVIGATION_EDGES = 24000;
const SCRIPT_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|html)$/i;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 20);
}

function punct(token, value) {
  return token?.type === 'punct' && token.value === value;
}

function word(token, value) {
  return token?.type === 'word' && token.value === value;
}

/** Normalize a root-relative internal pathname; never resolve a relative URL. */
export function normalizeRoute(input) {
  if (typeof input !== 'string' || !input || input.length > 2048 || input !== input.trim() || /[\u0000-\u001f\u007f\\]/.test(input) || !input.startsWith('/') || input.startsWith('//')) return null;
  const pathname = input.split(/[?#]/, 1)[0];
  if (/\s/.test(pathname) || /%2f|%5c/i.test(pathname)) return null;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  // Encoded separators, traversal, and ambiguous URL syntax are not guessed.
  if (/[\u0000-\u0020\u007f\\?#<>"']/.test(decoded) || decoded.includes('//')) return null;
  const parts = decoded.split('/');
  if (parts.some(part => part === '.' || part === '..')) return null;
  return decoded.length > 1 ? decoded.replace(/\/$/, '') : '/';
}

function routePattern(route) {
  const normalized = normalizeRoute(route);
  if (!normalized) return null;
  if (normalized === '/') return { route: '/', dynamic: false, regex: /^\/$/ };
  const parts = normalized.slice(1).split('/');
  let expression = '', dynamic = false;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (/^\[\[\.\.\.[A-Za-z_$][\w$]*\]\]$/.test(part)) {
      if (index !== parts.length - 1) return null;
      expression += parts.length === 1 ? '/(?:[^/]+(?:/[^/]+)*)?' : '(?:/[^/]+(?:/[^/]+)*)?'; dynamic = true;
    } else if (/^\[\.\.\.[A-Za-z_$][\w$]*\]$/.test(part)) {
      if (index !== parts.length - 1) return null;
      expression += '/[^/]+(?:/[^/]+)*'; dynamic = true;
    } else if (/^\[[A-Za-z_$][\w$]*\]$/.test(part) || /^:[A-Za-z_$][\w$]*$/.test(part)) {
      expression += '/[^/]+'; dynamic = true;
    } else {
      // Parallel/intercepting route conventions and unknown parameter syntax
      // need explicit configuration; treating them as real URL segments lies.
      if (/[\[\]()*:]/.test(part) || part.startsWith('@')) return null;
      expression += `/${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
    }
  }
  return { route: normalized, dynamic, regex: new RegExp(`^${expression || '/'}$`) };
}

function inspectLiterals(text, file, tokenize, counts) {
  const markup = /\.(?:html|vue|svelte)$/i.test(file)
    ? text.replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ' '))
    : text;
  const stream = tokenize(markup), found = [];
  function add(token, line, syntax) {
    if (found.length >= MAX_LITERALS_PER_FILE) { counts.literalLimit++; return; }
    if (token?.type !== 'string' || token.escaped) { counts.unsupported++; return; }
    if (/^(?:[A-Za-z][\w+.-]*:|\/\/)/.test(token.value)) { counts.external++; return; }
    const route = normalizeRoute(token.value);
    // A literal placeholder is not a concrete navigation destination. Object
    // hrefs, named native routes, interpolation, and relative links are omitted.
    if (!route || route.split('/').some(part => /[\[\]*]/.test(part) || part.startsWith(':'))) { counts.unsupported++; return; }
    found.push({ route, line, syntax });
  }
  for (let index = 0; index < stream.length; index++) {
    const token = stream[index];
    if (punct(token, '<') && stream[index + 1]?.type === 'word') {
      const tag = stream[index + 1].value;
      const attributes = tag === 'a' ? ['href'] : tag === 'NavLink' ? ['to'] : tag === 'Link' ? ['href', 'to'] : null;
      if (attributes) {
        const candidates = [];
        let braces = 0, closed = false, spread = false, invalid = false;
        for (let cursor = index + 2; cursor < Math.min(stream.length, index + MAX_TAG_TOKENS); cursor++) {
          const current = stream[cursor];
          if (braces === 0 && punct(current, '>')) { closed = true; break; }
          if (braces === 0 && punct(current, '<')) break;
          if (braces === 0 && current.type === 'word' && attributes.includes(current.value) && punct(stream[cursor + 1], '=')) {
            const value = stream[cursor + 2];
            if (value?.type === 'string') candidates.push({ token: value, line: current.line, syntax: `<${tag} ${current.value}>` });
            else if (punct(value, '{') && stream[cursor + 3]?.type === 'string' && punct(stream[cursor + 4], '}')) candidates.push({ token: stream[cursor + 3], line: current.line, syntax: `<${tag} ${current.value}>` });
            else invalid = true;
          }
          if (punct(current, '{')) {
            if (braces === 0 && punct(stream[cursor + 1], '.') && punct(stream[cursor + 2], '.') && punct(stream[cursor + 3], '.')) spread = true;
            braces++;
          } else if (punct(current, '}')) braces = Math.max(0, braces - 1);
        }
        if (candidates.length || invalid) {
          if (!closed || spread || invalid || candidates.length !== 1) counts.unsupported++;
          else add(candidates[0].token, candidates[0].line, candidates[0].syntax);
        }
      }
    }
    if (token.type !== 'word' || punct(stream[index - 1], '.') || word(stream[index - 1], 'new') || word(stream[index - 1], 'function')) continue;
    let open = -1, syntax;
    if (token.value === 'navigate' && punct(stream[index + 1], '(')) {
      open = index + 1; syntax = 'navigate()';
    } else if (['router', 'navigation', 'history'].includes(token.value)) {
      let methodIndex = index + 2;
      if (punct(stream[index + 1], '?') && punct(stream[index + 2], '.')) methodIndex++;
      else if (!punct(stream[index + 1], '.')) continue;
      const method = stream[methodIndex];
      const allowed = token.value === 'router' ? ['push', 'replace', 'navigate'] : token.value === 'navigation' ? ['navigate'] : ['push', 'replace'];
      if (method?.type === 'word' && allowed.includes(method.value) && punct(stream[methodIndex + 1], '(')) {
        open = methodIndex + 1; syntax = `${token.value}.${method.value}()`;
      }
    }
    if (open !== -1) {
      if (stream[open + 1]?.type === 'string' && (punct(stream[open + 2], ')') || punct(stream[open + 2], ','))) add(stream[open + 1], token.line, syntax);
      else counts.unsupported++;
    }
  }
  return found;
}

function frameworkEvidence(sources) {
  try {
    const pkg = JSON.parse(sources.get('package.json')?.text ?? '{}');
    const dependencies = { ...pkg.devDependencies, ...pkg.dependencies };
    return { next: Boolean(dependencies.next), expo: Boolean(dependencies['expo-router']) };
  } catch { return { next: false, expo: false }; }
}

/**
 * Infer screen-to-screen flow independently of code dependencies.
 * `tokens` must be the shared lexer that skips comments/quoted code snippets.
 * Route overrides are applied by core before this function is called.
 */
export function detectNavigation({ nodes, edges, sources, config: _config, tokens }) {
  const warnings = ['Screen navigation is inferred from supported static links/calls; it does not confirm rendered components, reachable handlers, authentication guards, or runtime navigation.'];
  if (typeof tokens !== 'function') return { edges: [], warnings: [...warnings, 'Screen navigation was omitted because the source lexer is unavailable.'] };
  const counts = { unsupported: 0, external: 0, unresolved: 0, ambiguous: 0, noOrigin: 0, projectionLimit: 0, literalLimit: 0, edgeLimit: 0, routePatterns: 0 };
  const byId = new Map(nodes.map(node => [node.id, node]));
  const screens = nodes.filter(node => node.kind === 'screen');
  const descriptors = [];
  for (const node of screens) {
    if (typeof node.route !== 'string') continue;
    const pattern = routePattern(node.route);
    if (pattern) descriptors.push({ node, ...pattern });
    else counts.routePatterns++;
  }
  const exact = new Map();
  for (const descriptor of descriptors.filter(entry => !entry.dynamic)) {
    if (!exact.has(descriptor.route)) exact.set(descriptor.route, []);
    exact.get(descriptor.route).push(descriptor);
  }
  const dynamic = descriptors.filter(entry => entry.dynamic), resolutions = new Map();
  function resolve(route) {
    if (!resolutions.has(route)) {
      const matches = exact.get(route) ?? dynamic.filter(entry => entry.regex.test(route));
      resolutions.set(route, matches.length === 1 ? { node: matches[0].node } : { reason: matches.length ? 'ambiguous' : 'unresolved' });
    }
    return resolutions.get(route);
  }
  const reverse = new Map();
  for (const edge of edges) {
    if (edge.kind !== 'imports' || !byId.has(edge.source) || !byId.has(edge.target)) continue;
    if (!reverse.has(edge.target)) reverse.set(edge.target, new Set());
    reverse.get(edge.target).add(edge.source);
  }
  const frameworks = frameworkEvidence(sources), originCache = new Map();
  function layoutScreens(id) {
    const match = id.match(/^((?:src\/)?app\/(?:.*\/)?)(layout|_layout)\.[jt]sx?$/);
    if (!match) return null;
    const supported = match[2] === 'layout' ? frameworks.next : frameworks.expo;
    if (!supported) return null;
    return { nodes: screens.filter(screen => screen.id.startsWith(match[1]) && screen.id !== id), framework: match[2] === 'layout' ? 'Next layout convention (next in package.json)' : 'Expo layout convention (expo-router in package.json)' };
  }
  function origins(id) {
    if (originCache.has(id)) return originCache.get(id);
    const result = new Map(), visited = new Set(), scheduled = new Set([id]), pending = [{ id, depth: 0, chain: [id] }];
    let limited = false;
    while (pending.length) {
      if (visited.size >= MAX_IMPORT_VISITS || result.size >= MAX_ORIGIN_SCREENS) { limited = true; break; }
      const current = pending.shift();
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      const node = byId.get(current.id);
      if (!node) continue;
      if (node.kind === 'screen') {
        result.set(node.id, { node, chain: [...current.chain].reverse() });
        continue;
      }
      const layout = layoutScreens(node.id);
      if (layout) {
        for (const screen of layout.nodes) {
          if (result.size >= MAX_ORIGIN_SCREENS) { limited = true; break; }
          if (!result.has(screen.id)) result.set(screen.id, { node: screen, chain: [screen.id, ...current.chain.slice().reverse()], layout: layout.framework });
        }
      }
      const parents = reverse.get(current.id) ?? [];
      if (current.depth >= MAX_IMPORT_DEPTH) { if ([...parents].some(parent => !visited.has(parent))) limited = true; continue; }
      for (const parent of parents) if (!scheduled.has(parent)) {
        scheduled.add(parent);
        pending.push({ id: parent, depth: current.depth + 1, chain: [...current.chain, parent] });
      }
    }
    if (limited) counts.projectionLimit++;
    const value = [...result.values()]; originCache.set(id, value); return value;
  }
  const navigation = new Map();
  for (const [file, source] of sources) {
    if (!SCRIPT_FILE.test(file) || !byId.has(file)) continue;
    const literals = inspectLiterals(source.text, file, tokens, counts);
    if (!literals.length) continue;
    const owners = origins(file);
    if (!owners.length) { counts.noOrigin += literals.length; continue; }
    for (const literal of literals) {
      const destination = resolve(literal.route);
      if (!destination.node) { counts[destination.reason]++; continue; }
      for (const owner of owners) {
        if (owner.node.id === destination.node.id) continue;
        const id = hash(`${owner.node.id}\0${destination.node.id}\0navigates`);
        if (navigation.has(id)) { navigation.get(id).evidenceCount++; continue; }
        if (navigation.size >= MAX_NAVIGATION_EDGES) { counts.edgeLimit++; continue; }
        const via = owner.chain.length > 1 ? `; via ${owner.layout ? `${owner.layout}; source chain` : 'import path'} ${owner.chain.join(' -> ')}` : '';
        navigation.set(id, {
          id, source: owner.node.id, target: destination.node.id, kind: 'navigates', confidence: 'inferred',
          evidence: `${`${file}:${literal.line} ${literal.syntax} points to ${literal.route}${via}`.slice(0, 940)}; statically inferred, not runtime verified.`,
          evidenceCount: 1,
          ...(owner.chain.length > 1 ? { via: file } : {}),
        });
      }
    }
  }
  if (counts.unsupported) warnings.push(`${counts.unsupported} navigation expressions were omitted: only unescaped, root-relative string destinations are supported; computed/object/template/relative URLs, named navigator routes, and ambiguous JSX attributes require declared relationships.`);
  if (counts.external) warnings.push(`${counts.external} external or URL-scheme navigation destinations were omitted from the internal screen flow.`);
  if (counts.unresolved) warnings.push(`${counts.unresolved} literal navigation destinations had no matching scanned screen route. Configure routes or declare the relationship if needed.`);
  if (counts.ambiguous) warnings.push(`${counts.ambiguous} literal navigation destinations matched multiple screen routes and were omitted instead of selecting a guessed destination.`);
  if (counts.noOrigin) warnings.push(`${counts.noOrigin} navigation literals could not be associated with a screen through ${MAX_IMPORT_DEPTH} import levels or a supported layout convention with package.json evidence.`);
  if (counts.projectionLimit || counts.literalLimit || counts.edgeLimit) warnings.push(`Navigation coverage limit reached: ${MAX_IMPORT_DEPTH} import levels, ${MAX_IMPORT_VISITS} visited files and ${MAX_ORIGIN_SCREENS} screens per origin, ${MAX_LITERALS_PER_FILE} literals per file, or ${MAX_NAVIGATION_EDGES} flow edges. Some relationships were omitted.`);
  if (counts.routePatterns) warnings.push(`${counts.routePatterns} screen route patterns use unsupported or invalid syntax and were not used as automatic navigation destinations.`);
  return { edges: [...navigation.values()], warnings };
}
