import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as core from './analyzer.mjs';
import { buildFeatureMap, resolveSelection, suggestIntent } from './feature-map.mjs';
export * from './analyzer.mjs';
import { beginAudit, auditPlan, assertAuditFresh, finishAudit, assuranceView, recordEvidence, evidenceResponse } from './assurance.mjs';
export { recordEvidence } from './assurance.mjs';
import { checkpoint, sealCheckpoint, safetyView, restorePreview, restoreApply, resumePlan } from './safety.mjs';

async function configAt(root) {
  try {
    const file = path.join(root, 'project-map.config.json'), stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 512 * 1024) throw new Error('Unsafe config');
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid config');
    return value;
  } catch (error) { if (error.code === 'ENOENT') return {}; throw Object.assign(new Error('설정 파일을 안전하게 읽을 수 없습니다. 기존 설정을 확인하세요.'), { statusCode: 400 }); }
}
async function decorate(map) {
  return { ...map, featureGraph: buildFeatureMap(map, await configAt(map.project.root)) };
}
export async function scanProject(root, options = {}) { return decorate(await core.scanProject(root, options)); }
export async function getMap(root, options = {}) { return decorate(await core.getMap(root, options)); }
export function analyzeImpact(map, input = {}) {
  const resolved = resolveSelection(map, input);
  resolved.intent = resolved.intent === 'auto' || !resolved.intent ? suggestIntent(resolved.request || '') : resolved.intent;
  return { ...core.analyzeImpact(map, resolved), intentNote: '변경 유형은 초기 추정입니다. Codex가 실제 소스를 읽고 변경 계획을 다시 작성합니다.' };
}
export async function createTask(root, input, options = {}) {
  const map = await getMap(root, options), resolved = resolveSelection(map, input);
  resolved.intent = resolved.intent === 'auto' || !resolved.intent ? suggestIntent(resolved.request || '') : resolved.intent;
  const task = await core.createTask(root, resolved, options);
  await beginAudit(root, task, options);
  return decorateTask(task, root, options);
}
async function decorateTask(task, root, options) {
  const config = await configAt(root), map = await getMap(root, options);
  const project = graph => graph ? buildFeatureMap({ ...graph, files: [] }, config) : null;
  return { ...task, experience: {
    featureLabels: Object.fromEntries(map.nodes.map(node => [node.id, map.featureGraph.nodes.filter(f => f.entryNodeIds.includes(node.id)).map(f => f.label).join(' / ') || node.label])),
    beforeGraph: project(task.plan?.beforeGraph), expectedGraph: project(task.plan?.afterGraph),
    actualGraph: project(task.result?.afterGraph),
    assurance: await assuranceView(root, task, options),
    safety: await safetyView(root, task, options)
  } };
}
export async function getTask(root, id, options = {}) { return decorateTask(await core.getTask(root, id, options), root, options); }
export async function listTasks(root, options = {}) { return Promise.all((await core.listTasks(root, options)).map(task => decorateTask(task, root, options))); }
export async function proposeTask(root, id, input, options = {}) {
  const task = await core.proposeTask(root, id, input, options);
  await auditPlan(root, task, await getMap(root, options), options);
  return decorateTask(task, root, options);
}
export async function reviewTask(root, id, input, options = {}) {
  if (input.decision === 'approve') await assertAuditFresh(root, await core.getTask(root,id,options), options);
  return decorateTask(await core.reviewTask(root, id, input, options), root, options);
}
export async function updateTask(root, id, input, options = {}) {
  if (input.status === 'running') await assertAuditFresh(root, await core.getTask(root,id,options), options);
  const task = await core.updateTask(root, id, input, options);
  if (input.status === 'running') {
    try { await checkpoint(root,task,options); }
    catch(error) { await core.updateTask(root,id,{status:'blocked',note:'체크포인트 실패. 소스 수정 전에 원인을 확인하세요.'},options);throw error; }
  }
  if (input.status === 'blocked') await sealCheckpoint(root,task,options);
  return decorateTask(task, root, options);
}
export async function completeTask(root, id, input, options = {}) {
  const existing = await core.getTask(root,id,options);
  if(existing.status === 'completed') return decorateTask(existing,root,options);
  const task = await core.completeTask(root, id, input, options);
  await finishAudit(root,task,options);
  await sealCheckpoint(root,task,options);
  return decorateTask(task, root, options);
}

export async function workspaceRoute(root, route, input, options = {}) {
  const safety = route.match(/^\/api\/tasks\/([^/]+)\/(pause|resume-plan|restore-preview|restore-apply)$/);
  if(safety) {
    const task = await core.getTask(root,safety[1],options); let value;
    if(safety[2] === 'pause') {
      if(input.executionStopped !== true) throw Object.assign(new Error('Codex 실행을 먼저 중단한 후 기록하세요.'),{statusCode:409});
      value = await updateTask(root,task.id,{status:'blocked',note:'사용자가 실행 중단을 확인함'},options);
    } else if(safety[2] === 'resume-plan') value = await proposeTask(root,task.id,resumePlan(task,await scanProject(root,options)),options);
    else if(safety[2] === 'restore-preview') value = await restorePreview(root,task,options);
    else value = await restoreApply(root,task,input.token,options);
    return {value,status:200};
  }
  if (route !== '/api/features/rename') return null;
  const map = await scanProject(root, options);
  if (input.snapshotId !== map.snapshotId) throw Object.assign(new Error('코드가 변경되었습니다. 새로고침 후 이름을 수정하세요.'), { statusCode: 409 });
  if (!map.featureGraph.nodes.some(n => n.id === input.id) || typeof input.label !== 'string' || !input.label.trim() || input.label.length > 120)
    throw Object.assign(new Error('유효한 기능과 120자 이내의 이름을 입력하세요.'), { statusCode: 400 });
  const config = await configAt(map.project.root);
  config.featureLabels = { ...(config.featureLabels || {}), [input.id]: input.label.trim() };
  const target = path.join(map.project.root, 'project-map.config.json');
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, target); }
  finally { await fs.unlink(temporary).catch(() => {}); }
  return { value: await scanProject(root, options), status: 200 };
}

// Extension points share the server's same-origin, session-token protection.
export async function workspaceRead(root, route, options = {}) { return evidenceResponse(root, route, options); }
export async function closeWorkspace() {}
