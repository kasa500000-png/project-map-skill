import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as core from './analyzer.mjs';
import { projectMutation, claimExecution, releaseExecution, assertNoOtherExecution, markExecutionUncertain, executionStatus } from './task-lock.mjs';
import { finalize } from './finalize.mjs';
import { reviewGraphs } from './graph-review.mjs';
import { buildFeatureMap, resolveSelection, suggestIntent } from './feature-map.mjs';
export * from './analyzer.mjs';
import { beginAudit, auditPlan, assertAuditFresh, finishAudit, assuranceView, recordEvidence, evidenceResponse } from './assurance.mjs';
export { recordEvidence } from './assurance.mjs';
import { checkpoint, sealCheckpoint, safetyView, restorePreview, restoreApply, resumePlan } from './safety.mjs';
import { refreshMap, taskComparisons } from './efficiency.mjs';
import { inventory } from './inventory.mjs';
import { getStateDir, requireProtectedState } from './storage.mjs';
import { readState, writeState } from './state-store.mjs';
import { CodexBridge } from './codex-bridge.mjs';
const bridges = new Map();
const bridgeKey = (root,options) => `${path.resolve(root)}:${getStateDir(root,options.stateDir)}`;

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
export async function scanProject(root, options = {}) { return decorate(await refreshMap(root, options)); }
export async function getMap(root, options = {}) { return decorate(await core.getMap(root, options)); }
export function analyzeImpact(map, input = {}) {
  const resolved = resolveSelection(map, input);
  resolved.intent = resolved.intent === 'auto' || !resolved.intent ? suggestIntent(resolved.request || '') : resolved.intent;
  return { ...core.analyzeImpact(map, resolved), intentNote: '변경 유형은 초기 추정입니다. Codex가 실제 소스를 읽고 변경 계획을 다시 작성합니다.' };
}
export async function createTask(root, input, options = {}) {
  return projectMutation(root, async () => {
  const map = await getMap(root, options), resolved = resolveSelection(map, input);
  resolved.intent = resolved.intent === 'auto' || !resolved.intent ? suggestIntent(resolved.request || '') : resolved.intent;
  const task = await core.createTask(root, resolved, options);
  await beginAudit(root, task, options);
  return decorateTask(task, root, options);
  });
}
async function decorateTask(task, root, options) {
  if(task.status==='completed'&&task.finalization?.status!=='complete'){
    task=structuredClone(task);task.legacyReported=true;
    const downgrade=checks=>(checks||[]).map(c=>({...c,source:'agent',status:c.status==='passed'?'not_run':c.status,detail:'이전 버전 기록 · 실행 증거 재확인 필요. '+(c.detail||'')}));
    task.checks=downgrade(task.checks);task.verificationStatus=task.checks.some(c=>c.status==='failed')?'failed':'not_run';
    if(task.result){task.result.checks=task.checks;task.result.verificationStatus=task.verificationStatus;
      for(const outcome of task.result.outcomes||[]){outcome.checks=downgrade(outcome.checks);outcome.status=outcome.checks.some(c=>c.status==='failed')?'failed':'not_run';}
    }
  }
  const config = await configAt(root), map = await getMap(root, options);
  const assurance = await assuranceView(root, task, options);
  const graphs = reviewGraphs(task, config, assurance);
  const decorated = { ...task, experience: {
    featureLabels: Object.fromEntries(map.nodes.map(node => [node.id, map.featureGraph.nodes.filter(f => f.entryNodeIds.includes(node.id)).map(f => f.label).join(' / ') || node.label])),
    ...graphs,
    assurance,
    safety: { ...await safetyView(root, task, options), uncertainExecution: (await executionStatus(root))?.uncertain || false }
  } };
  decorated.experience.parallel = await taskComparisons(root,decorated,map,options);
  return decorated;
}
export async function getTask(root, id, options = {}) { return decorateTask(await core.getTask(root, id, options), root, options); }
export async function listTasks(root, options = {}) { return core.listTasks(root, options); }
export async function proposeTask(root, id, input, options = {}) {
  return projectMutation(root, async () => {
  const old = await core.getTask(root,id,options);
  if(['finalizing','finalization_failed'].includes(old.status))throw Object.assign(new Error('결과 정리를 먼저 완료하세요. 새 계획으로 마무리 실패를 덮어쓸 수 없습니다.'),{code:'FINALIZATION_PENDING',statusCode:409});
  await assertNoOtherExecution(root, id, options);
  const task = await core.proposeTask(root, id, input, options);
  await auditPlan(root, task, await getMap(root, options), options);
  return decorateTask(task, root, options);
  });
}
export async function reviewTask(root, id, input, options = {}) {
  return projectMutation(root, async () => {
  if (input.decision === 'approve') await assertAuditFresh(root, await core.getTask(root,id,options), options);
  return decorateTask(await core.reviewTask(root, id, input, options), root, options);
  });
}
export async function updateTask(root, id, input, options = {}) {
  return projectMutation(root, async () => {
    const prior = await core.getTask(root, id, options);
    if (input.status === 'running') {
      if (prior.status === 'completed') throw Object.assign(new Error('완료된 작업입니다.'), { code: 'TASK_COMPLETED', statusCode: 409 });
      if (!['approved','blocked','running'].includes(prior.status) || !prior.approval) throw Object.assign(new Error('현재 계획의 사용자 승인이 필요합니다.'), { code: 'REVIEW_REQUIRED', statusCode: 409 });
      if (prior.status === 'running') throw Object.assign(new Error('이미 실행 중인 작업입니다. 별도 실행을 시작하지 마세요.'), { code: 'ALREADY_RUNNING', statusCode: 409 });
      await assertAuditFresh(root, prior, options);
      const others = (await core.listTasks(root, options)).filter(t => t.id !== id && ['running', 'finalizing', 'finalization_failed'].includes(t.status));
      if (others.length) throw Object.assign(new Error('다른 작업이 실행 또는 결과 정리 중입니다.'), { code: 'PROJECT_IN_USE', statusCode: 409 });
      const claimed = await claimExecution(root, id, options);
      try {
        // Do not publish running until the backup is safely written.
        if (prior.plan) await checkpoint(root, prior, options);
        const task = await core.updateTask(root, id, input, options);
        return decorateTask(task, root, options);
      } catch (error) { if (claimed) await releaseExecution(root, id, options); throw error; }
    }
    const task = await core.updateTask(root, id, input, options);
    if (input.status === 'blocked') {
      await sealCheckpoint(root, task, options);
      await releaseExecution(root, id, options);
    }
    return decorateTask(task, root, options);
  });
}
export async function completeTask(root, id, input = {}, options = {}) {
  return projectMutation(root, async () => decorateTask(await finalize(root, id, input, options), root, options));
}

export async function workspaceRoute(root, route, input, options = {}) {
  const managed=route.match(/^\/api\/tasks\/([^/]+)\/manage$/);
  if(managed)return projectMutation(root,async()=>{
    if((await executionStatus(root))?.taskId===managed[1])throw Object.assign(new Error('실행 중인 작업을 먼저 중단하세요.'),{code:'PROJECT_IN_USE',statusCode:409});
    return {value:await core.manageTask(root,managed[1],input.action,options),status:200};
  });
  const retry = route.match(/^\/api\/tasks\/([^/]+)\/retry-finalization$/);
  if (retry) return { value: await completeTask(root, retry[1], {}, options), status: 200 };
  if (route.startsWith('/api/codex/')) {
    if(!options.codex) throw Object.assign(new Error('직접 연결은 기본으로 꺼져 있습니다. --codex로 서버를 시작하세요.'),{statusCode:403});
    await requireProtectedState(root,options);
    const bridge = bridgeFor(root, options); let value;
    if(route==='/api/codex/run') value=await bridge.run(input.id,input.phase);
    else if(route==='/api/codex/interrupt') value=await bridge.interrupt();
    else if(route==='/api/codex/reset-thread') value=await bridge.forget(input.id);
    else if(route==='/api/codex/decision') value=await bridge.decide(input.id,input.decision);
    else return null;
    return {value,status:200};
  }
  const safety = route.match(/^\/api\/tasks\/([^/]+)\/(pause|resume-plan|restore-preview|restore-apply)$/);
  if(safety) {
    if(bridges.get(bridgeKey(root,options))?.active) throw Object.assign(new Error('직접 연결된 Codex 작업을 먼저 중단하고 완료 상태를 확인하세요.'),{statusCode:409});
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
function bridgeFor(root,options) {
  const key=bridgeKey(root,options);if(!bridges.has(key)) bridges.set(key,new CodexBridge({root,handlers:{
    get:id=>getTask(root,id,options), loadThread:async id=>(await readState(root,`bridge/${id}.json`,options))?.threadId, saveThread:(id,threadId)=>writeState(root,`bridge/${id}.json`,{threadId},options), fingerprint:async()=>(await inventory(root,options)).fingerprint,
    plan:(id,plan)=>proposeTask(root,id,plan,options), start:id=>updateTask(root,id,{status:'running'},options),
    complete:(id,result)=>completeTask(root,id,result,options), block:async(id,message,uncertain=false)=>{
      if(uncertain)return projectMutation(root,async()=>{await markExecutionUncertain(root,id,options);return core.updateTask(root,id,{status:'blocked',note:String(message).slice(0,1000)},options);});
      const existing=await core.getTask(root,id,options);if(['finalizing','finalization_failed'].includes(existing.status))return existing;
      return updateTask(root,id,{status:'blocked',note:String(message).slice(0,1000)},options);
    }
  }}));return bridges.get(key);
}
export async function workspaceRead(root, route, options = {}) {
  if(route==='/api/connection') return {value: options.codex ? bridgeFor(root,options).status() : {enabled:false,connected:false,active:null,approvals:[]},status:200};
  return evidenceResponse(root, route, options);
}
export async function closeWorkspace(root,options={}) {const key=bridgeKey(root,options),bridge=bridges.get(key);if(bridge){await bridge.close();bridges.delete(key);}}
