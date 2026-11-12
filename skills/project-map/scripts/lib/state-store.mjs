import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getStateDir, guardLegacyState } from './storage.mjs';
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const problem = (message, code = 'INVALID_INPUT', statusCode = 400) => Object.assign(new Error(message), { code, statusCode });
export function taskId(id) {
  if (!/^task-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id || '')) throw problem('Invalid task ID.');
  return id;
}
export function relativeFile(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || path.posix.normalize(value) !== value ||
    /[\\\u0000-\u001f\u007f]/.test(value) || path.isAbsolute(value) || path.win32.isAbsolute(value) || value.split('/').some(p => ['..','.git'].includes(p))) throw problem('Unsafe relative file path.');
  return value;
}
export async function safePath(root, relative, missing = false) {
  relativeFile(relative); const base = await fs.realpath(root); let current = base;
  const pieces = relative.split('/');
  for (let i = 0; i < pieces.length; i++) {
    current = path.join(current, pieces[i]);
    try { const s = await fs.lstat(current); if (s.isSymbolicLink() || (i < pieces.length - 1 && !s.isDirectory())) throw problem('Symbolic links and non-directory ancestors are not permitted.', 'UNSAFE_PATH'); }
    catch (e) { if (e.code === 'ENOENT' && missing) return path.join(base, relative); throw e; }
  }
  return current;
}
export async function stateRoot(root, options = {}) {
  const project = await fs.realpath(root);await guardLegacyState(project,options.stateDir);const state = getStateDir(project,options.stateDir);
  if (state === project) throw problem('State must be separate from source.');
  for (let p = state; p !== path.dirname(p); p = path.dirname(p)) {
    try { const s = await fs.lstat(p); if (s.isSymbolicLink() || !s.isDirectory()) throw problem('Unsafe state directory.', 'UNSAFE_STATE_PATH'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  await fs.mkdir(state, { recursive: true, mode: 0o700 });
  return state;
}
export async function statePath(root, relative, options = {}) {
  const state = await stateRoot(root, options), file = await safePath(state, relative, true);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); return file;
}
export async function readState(root, relative, options = {}, fallback = null) {
  try { const file = await statePath(root, relative, options), stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw problem('Invalid state file.');
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
export async function writeState(root, relative, value, options = {}) {
  const file = await statePath(root, relative, options), temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, file); }
  finally { await fs.unlink(temporary).catch(() => {}); }
}
