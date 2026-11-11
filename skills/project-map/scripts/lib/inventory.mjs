import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hash, relativeFile, safePath, stateRoot } from './state-store.mjs';
const exec = promisify(execFile);
const excluded = new Set(['.git','.agents','.codex','.project-map','node_modules','vendor','dist','build','.next','.expo','coverage','out','.turbo','.cache','__pycache__','.venv','venv','Pods','.gradle','DerivedData','target','test-results','playwright-report']);
export const isSensitive = p => p.split('/').some(n => /(?:^\.env(?:\.|$)|credentials?|secrets?|service[-_.]?account|private[-_.]?key|^id_(?:rsa|ed25519)|\.(?:pem|key|p12|pfx|keystore|jks)$)/i.test(n));
export function auditable(relative) {
  try { relativeFile(relative); return !relative.split('/').some(p => excluded.has(p)); } catch { return false; }
}
export async function inventory(root, options = {}) {
  root = await fs.realpath(root); const state = await stateRoot(root, options), files = [], skipped = []; let names, git = true;
  try { names = (await exec('git', ['-C', root, 'ls-files', '-c', '-o', '--exclude-standard', '-z', '--', '.'], { maxBuffer: 16 * 1024 * 1024, timeout: 15000 })).stdout.split('\0').filter(Boolean); }
  catch {
    git = false; names = [];
    async function walk(dir, depth = 0) {
      if (depth > 32 || names.length >= 6000) { skipped.push(path.relative(root, dir) || '(root)'); return; }
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name), rel = path.relative(root, full).split(path.sep).join('/');
        if (!auditable(rel) || full === state || full.startsWith(state + path.sep)) continue;
        if (e.isSymbolicLink()) { skipped.push(rel); continue; }
        if (e.isDirectory()) await walk(full, depth + 1); else if (e.isFile()) names.push(rel);
      }
    }
    await walk(root);
  }
  names = [...new Set(names)].filter(n => auditable(n) && !path.resolve(root,n).startsWith(state + path.sep)).sort();
  let total = 0;
  for (const rel of names.slice(0, 5000)) {
    try {
      const file = await safePath(root, rel), s = await fs.stat(file);
      if (!s.isFile()) continue;
      if (s.size > 20 * 1024 * 1024 || total + s.size > 128 * 1024 * 1024) { skipped.push(rel); continue; }
      const bytes = await fs.readFile(file); total += bytes.length;
      files.push({ path: rel, hash: hash(bytes), size: bytes.length, mode: s.mode & 0o777, sensitive: isSensitive(rel) });
    } catch (e) { if (e.code !== 'ENOENT') skipped.push(rel); }
  }
  if (names.length > 5000) skipped.push(...names.slice(5000));
  return { files, fingerprint: hash(JSON.stringify(files.map(f => [f.path,f.hash,f.mode]))), complete: skipped.length === 0,
    skipped, git, warnings: [!git ? 'Git을 사용할 수 없어 기본 제외 규칙으로 검사했습니다.' : 'Git 무시 파일과 의존성·생성 폴더는 비교 범위에서 제외됩니다.', ...(skipped.length ? ['일부 파일을 읽지 못했습니다. 누락을 삭제로 단정하지 마세요.'] : [])] };
}
export function compareInventory(before, after, writes = [], sourceFiles = []) {
  if (!before) return { available: false, complete: false, changes: [], warnings: ['이 요청에는 전체 파일 기준 정보가 없습니다.'] };
  const a = new Map(before.files.map(f => [f.path,f])), b = new Map(after.files.map(f => [f.path,f]));
  const planned = new Set(writes), source = new Set(sourceFiles), skipped = new Set([...(before.skipped || []), ...(after.skipped || [])]);
  const changes = [];
  for (const p of [...new Set([...a.keys(),...b.keys()])].sort()) {
    const left = a.get(p), right = b.get(p); if (left?.hash === right?.hash && left?.mode === right?.mode) continue;
    changes.push({ path:p, status: skipped.has(p) ? 'unknown' : !left ? 'added' : !right ? 'deleted' : 'modified', sensitive: left?.sensitive || right?.sensitive || false,
      beforeHash:left?.hash || null, afterHash:right?.hash || null, outsideMap:!source.has(p), outOfScope:!planned.has(p) });
  }
  return { available:true, complete:before.complete && after.complete, changes, warnings:after.warnings };
}
