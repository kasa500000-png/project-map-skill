/** Cross-process project coordinator. No age-based lock stealing or PID guessing. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getStateDir } from './storage.mjs';
import { safePath, problem, hash } from './state-store.mjs';
const exec = promisify(execFile);

async function controlRoot(root) {
  root = await fs.realpath(root);
  let top = root;
  try { top = await fs.realpath((await exec('git', ['-C', root, 'rev-parse', '--show-toplevel'], { timeout: 5000 })).stdout.trim()); } catch { /* Non-Git project. */ }
  const dir = await safePath(top, '.agents/project-map-control', true);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await safePath(top, '.agents/project-map-control');
  return dir;
}
async function readRecord(file) {
  try {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 10000) throw problem('Invalid project execution record.', 'UNSAFE_LOCK');
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export async function projectMutation(root, fn) {
  const dir = await controlRoot(root), lock = path.join(dir, 'mutation.lock'), nonce = crypto.randomUUID();
  try { await fs.mkdir(lock, { mode: 0o700 }); }
  catch (e) { if (e.code === 'EEXIST') throw problem('다른 작업이 상태를 저장 중입니다. 완료 후 다시 시도하세요. 남은 잠금은 임의로 삭제하지 마세요.', 'PROJECT_BUSY', 409); throw e; }
  try {
    await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify({ nonce, pid: process.pid, at: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
    return await fn();
  } finally {
    const owner = await readRecord(path.join(lock, 'owner.json'));
    if (owner?.nonce === nonce) { await fs.unlink(path.join(lock, 'owner.json')); await fs.rmdir(lock); }
  }
}
function sameOwner(a, b) { return a?.taskId === b.taskId && a.root === b.root && a.stateDir === b.stateDir; }
export async function claimExecution(root, id, options = {}) {
  const dir = await controlRoot(root), file = path.join(dir, 'active.json');
  const value = { taskId: id, root: await fs.realpath(root), stateDir: getStateDir(root, options.stateDir), at: new Date().toISOString() };
  const previous = await readRecord(file);
  if(previous?.uncertain)throw problem('연결이 끊긴 실행이 남아 있습니다. 실제 Codex가 중단됐는지 확인한 뒤 중단 상태를 기록하세요.','EXECUTION_CONFIRM_REQUIRED',409);
  if (previous && !sameOwner(previous, value)) throw problem(`다른 수정 작업이 실행 또는 결과 정리 중입니다: ${previous.taskId}. 먼저 그 작업을 중단하거나 완료하세요.`, 'PROJECT_IN_USE', 409);
  if (!previous) await fs.writeFile(file, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
  return !previous;
}
export async function assertNoOtherExecution(root, id, options = {}) {
  const dir = await controlRoot(root), active = await readRecord(path.join(dir, 'active.json'));
  const owner = { taskId: id, root: await fs.realpath(root), stateDir: getStateDir(root, options.stateDir) };
  if (active?.uncertain) throw problem('실행 중단 여부를 먼저 확인하세요.', 'EXECUTION_CONFIRM_REQUIRED',409);
  if (active && !sameOwner(active, owner)) throw problem('다른 작업의 실행이 끝나기 전에는 이 작업을 변경할 수 없습니다.', 'PROJECT_IN_USE', 409);
}
export async function releaseExecution(root, id, options = {}) {
  const dir = await controlRoot(root), file = path.join(dir, 'active.json'), active = await readRecord(file);
  if (active && sameOwner(active, { taskId: id, root: await fs.realpath(root), stateDir: getStateDir(root, options.stateDir) })) await fs.unlink(file);
}
export async function executionStatus(root) { return readRecord(path.join(await controlRoot(root), 'active.json')); }

export async function markExecutionUncertain(root,id,options={}) {
  const dir=await controlRoot(root),file=path.join(dir,'active.json'),value=await readRecord(file);
  if(value && value.taskId===id) {
    const temporary=file+'.'+crypto.randomUUID()+'.tmp';
    try{await fs.writeFile(temporary,JSON.stringify({...value,uncertain:true}),{flag:'wx',mode:0o600});await fs.rename(temporary,file);}finally{await fs.unlink(temporary).catch(()=>{});}
  }
}
