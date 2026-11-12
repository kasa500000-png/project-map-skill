import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink, realpath, rename, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { scanProject, getMap, analyzeImpact, createTask, listTasks, getTask, reviewTask, getStateDir, workspaceRoute, workspaceRead, closeWorkspace } from './core.mjs';

import { activity, recentTasks, storageUsage } from './activity.mjs';
import { requireProtectedState } from './storage.mjs';

const assets = fileURLToPath(new URL('../../assets/', import.meta.url));
const routes = new Map([
  ['/', ['workbench.html', 'text/html; charset=utf-8']],
  ['/assurance-ui.js', ['assurance-ui.js', 'text/javascript; charset=utf-8']],
  ['/safety-ui.js', ['safety-ui.js', 'text/javascript; charset=utf-8']],
  ['/bridge-ui.js', ['bridge-ui.js', 'text/javascript; charset=utf-8']],
  ['/workbench.js', ['workbench.js', 'text/javascript; charset=utf-8']],
  ['/workbench.css', ['workbench.css', 'text/css; charset=utf-8']],
  ['/legacy', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

function error(message, statusCode = 400, code = 'INVALID_REQUEST') {
  return Object.assign(new Error(message), { statusCode, code });
}

function reply(res, status, value, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
}

async function body(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw error('Use application/json.', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw error('Request is too large.', 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw error('Body must be a JSON object.'); }
}

function tokenMatches(value, token) {
  if (typeof value !== 'string' || value.length !== token.length) return false;
  const provided = Buffer.from(value);
  const expected = Buffer.from(token);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function launchBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd.exe' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/d', '/c', 'start', '', url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', shell: false });
    child.on('error', () => {});
    child.unref();
  } catch { /* The printed local URL remains usable when a browser launcher is unavailable. */ }
}

export async function startServer({ projectRoot, stateDir, port = 0, open = false, codex = false } = {}) {
  const root = await realpath(path.resolve(projectRoot || process.cwd()));
  const options = { stateDir, codex };
  if(codex)await requireProtectedState(root,options);
  await scanProject(root, options);
  const token = randomBytes(32).toString('hex');
  let address;
  let mutation = Promise.resolve();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try {
      const hosts = new Set([`127.0.0.1:${address.port}`, `localhost:${address.port}`]);
      if (!hosts.has(req.headers.host)) throw error('Unrecognized local host.', 403, 'FORBIDDEN_HOST');
      const origin = req.headers.origin;
      if (origin && ![...hosts].some(host => origin === `http://${host}`)) throw error('Cross-origin access is not allowed.', 403, 'FORBIDDEN_ORIGIN');
      const site = req.headers['sec-fetch-site'];
      if (site && !['same-origin', 'none'].includes(site)) throw error('Cross-site access is not allowed.', 403, 'FORBIDDEN_ORIGIN');
      const url = new URL(req.url, `http://127.0.0.1:${address.port}`);
      if (req.method === 'GET') {
        if (routes.has(url.pathname)) {
          const [file, type] = routes.get(url.pathname);
          return reply(res, 200, await readFile(path.join(assets, file)), type);
        }
        const extra = await workspaceRead(root, url.pathname, options);
        if (extra) return reply(res, extra.status || 200, extra.value, extra.type);
        if (url.pathname === '/healthz') return reply(res, 200, { ok: true });
        if (url.pathname === '/api/session') return reply(res, 200, { token });
        if (url.pathname === '/api/map') return reply(res, 200, await getMap(root, options));
        if(url.pathname==='/api/activity')return reply(res,200,await activity(root,options));
        if(url.pathname==='/api/storage')return reply(res,200,await storageUsage(root,options));
        if(url.pathname==='/api/tasks'&&url.searchParams.get('brief')==='1')return reply(res,200,await recentTasks(root,{...options,offset:url.searchParams.get('offset'),limit:url.searchParams.get('limit'),includeArchived:url.searchParams.get('archived')==='1'}));
        if (url.pathname === '/api/tasks') return reply(res, 200, { tasks: (await listTasks(root, options)).map(summarizeTask) });
        if (url.pathname.startsWith('/api/tasks/')) {
          const id = decodeURIComponent(url.pathname.slice('/api/tasks/'.length));
          return reply(res, 200, summarizeTask(await getTask(root, id, options)));
        }
        if (url.pathname === '/api/changes') {
          const task = await getTask(root, url.searchParams.get('task') || '', options);
          return reply(res, 200, { taskId: task.id, status: task.status, plan: task.plan || null, approval: task.approval || null, result: task.result || null });
        }
        return reply(res, 404, { error: 'NOT_FOUND', message: 'Not found.' });
      }
      if (req.method !== 'POST') return reply(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' });
      if (!tokenMatches(req.headers['x-project-map-token'], token)) throw error('Refresh the page to renew the local session.', 403, 'INVALID_SESSION');
      const input = await body(req);
      const run = async () => {
        const extra = await workspaceRoute(root, url.pathname, input, options);
        if (extra) return extra;
        if (url.pathname === '/api/refresh') return { value: await scanProject(root, options), status: 200 };
        if (url.pathname === '/api/impact') return { value: analyzeImpact(await getMap(root, options), input), status: 200 };
        if(url.pathname==='/api/activity')return reply(res,200,await activity(root,options));
        if(url.pathname==='/api/storage')return reply(res,200,await storageUsage(root,options));
        if(url.pathname==='/api/tasks'&&url.searchParams.get('brief')==='1')return reply(res,200,await recentTasks(root,{...options,offset:url.searchParams.get('offset'),limit:url.searchParams.get('limit'),includeArchived:url.searchParams.get('archived')==='1'}));
        if (url.pathname === '/api/tasks') return { value: summarizeTask(await createTask(root, input, options)), status: 201 };
        const review = url.pathname.match(/^\/api\/tasks\/([^/]+)\/review$/);
        if (review) return { value: summarizeTask(await reviewTask(root, decodeURIComponent(review[1]), { ...input, source: 'dashboard' }, options)), status: 200 };
        throw error('Not found.', 404, 'NOT_FOUND');
      };
      const operation = mutation.then(run, run);
      mutation = operation.catch(() => {});
      const result = await operation;
      return reply(res, result.status, result.value);
    } catch (err) {
      if (!res.headersSent && !res.destroyed) {
        const status = Number.isInteger(err.statusCode) ? err.statusCode : err.code === 'ENOENT' ? 404 : 500;
        reply(res, status, { error: err.code || 'SERVER_ERROR', message: status === 500 ? 'Local operation failed. Check the terminal output.' : err.message });
        if (status === 500) process.stderr.write(`[project-map] ${err.message}\n`);
      }
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 15000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { address = server.address(); resolve(); });
  });
  const url = `http://127.0.0.1:${address.port}`;
  const state = getStateDir(root, stateDir);
  await mkdir(state, { recursive: true });
  const infoPath = path.join(state, 'server.json');
  const infoTemp = path.join(state, `.server-${randomBytes(12).toString('hex')}.tmp`);
  await writeFile(infoTemp, JSON.stringify({ pid: process.pid, url, projectRoot: root, startedAt: new Date().toISOString() }, null, 2), { mode: 0o600, flag: 'wx' });
  await rename(infoTemp, infoPath);
  const close = async () => {
    await closeWorkspace(root, options);
    await new Promise(resolve => server.close(resolve));
    try {
      if ((await lstat(infoPath)).isSymbolicLink()) return;
      const info = JSON.parse(await readFile(infoPath, 'utf8'));
      if (info.pid === process.pid && info.url === url) await unlink(infoPath);
    } catch { /* Another local process may already own the server record. */ }
  };
  if (open) launchBrowser(url);
  return { server, url, projectRoot: root, close };
}

export function summarizeTask(task) {
  const { baseline, baselineNodes, baselineEdges, ...summary } = task;
  return summary;
}
