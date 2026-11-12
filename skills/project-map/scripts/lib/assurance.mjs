import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { hash, taskId, safePath, readState, writeState, statePath, problem } from './state-store.mjs';
import { inventory, compareInventory } from './inventory.mjs';
const metaFile = id => `workspace/${taskId(id)}.json`;
export const loadAssurance = (root,id,options) => readState(root,metaFile(id),options,{});
export const saveAssurance = (root,id,value,options) => writeState(root,metaFile(id),value,options);
export async function beginAudit(root,task,options) { await saveAssurance(root,task.id,{ baseline:await inventory(root,options), evidence:[] },options); }
export function writeImpact(map, plan) {
  const writes = new Set(plan.writeFiles), verify = new Set(writes), reasons = new Map(), reverse = new Map();
  for (const e of map.edges.filter(e=>e.kind!=='navigates')) { if (!reverse.has(e.target)) reverse.set(e.target,[]); reverse.get(e.target).push(e); }
  for(const [artifact,owner] of Object.entries(plan.assetBindings||{}))if(writes.has(artifact)){verify.add(owner);reasons.set(owner,'연결된 콘텐츠·이미지·설정 파일이 바뀌므로 이 기능을 확인하세요.');}
  const queue = [...verify];
  while (queue.length) for (const e of reverse.get(queue.shift()) || []) {
    if (!verify.has(e.source)) { verify.add(e.source);queue.push(e.source);reasons.set(e.source, `${e.target}를 사용하는 코드이므로 변경 후 확인이 필요합니다.`); }
  }
  const read = new Set();
  for (const e of map.edges) { if (writes.has(e.source) && e.kind!=='navigates') read.add(e.target);
    if (e.kind==='navigates' && (verify.has(e.source)||verify.has(e.target))) { read.add(e.source);read.add(e.target); } }
  const resources = new Set(map.files.filter(f=>writes.has(f.path)).flatMap(f=>(f.resources||[]).map(r=>`${r.type}:${r.key}`)));
  for (const f of map.files) if ((f.resources||[]).some(r=>resources.has(`${r.type}:${r.key}`))) { verify.add(f.path); reasons.set(f.path,'같은 데이터 또는 API 경로를 사용하므로 실제 공유 규칙을 확인해야 합니다.'); }
  const features = map.featureGraph.nodes.filter(n=>n.kind==='feature' && n.files.some(p=>verify.has(p))).map(n=>({id:n.id,label:n.label, files:n.files.filter(p=>verify.has(p)), reason:n.entryNodeIds.some(p=>writes.has(p))?'이번 요청이 직접 수정하는 기능입니다.':'수정할 공통 코드 또는 데이터를 사용합니다. 이 기능도 확인해야 합니다.'}));
  return { writeFiles:[...writes], readFiles:[...read].filter(p=>!writes.has(p)), verifyFiles:[...verify], features,
    reasons:Object.fromEntries(reasons), unknown:'정적 코드에 나타나지 않는 실행 중 연결·외부 서비스는 별도 확인이 필요합니다.' };
}
export async function auditPlan(root,task,map,options) {
  const meta = await loadAssurance(root,task.id,options);
  meta.plan = { revision:task.plan.revision, digest:hash(JSON.stringify(task.plan)), inventory:await inventory(root,options), impact:writeImpact(map,task.plan) };
  await saveAssurance(root,task.id,meta,options);
}
export async function assertAuditFresh(root,task,options) {
  const meta = await loadAssurance(root,task.id,options);
  if (!meta.plan) {if(task.controlVersion>=2)throw problem('전체 파일 기준의 계획 기록이 없습니다. 계획을 다시 작성하세요.','PLAN_AUDIT_REQUIRED',409);return;} // Pre-upgrade requests retain the original source guard.
  if (meta.plan.digest!==hash(JSON.stringify(task.plan)) || meta.plan.inventory.fingerprint!==(await inventory(root,options)).fingerprint)
    throw problem('소스 또는 지도 밖 파일이 변경되었습니다. 계획을 갱신하고 다시 검토하세요.','STALE_SNAPSHOT',409);
}
export async function finishAudit(root,task,options) {
  const meta = await loadAssurance(root,task.id,options), current=await inventory(root,options);
  meta.result = compareInventory(meta.baseline,current,task.plan?.writeFiles,task.baseline.map(f=>f.path));
  meta.result.fingerprint=current.fingerprint;
  await saveAssurance(root,task.id,meta,options);
}
export async function assuranceView(root,task,options) {
  const meta=await loadAssurance(root,task.id,options), fingerprint=meta.evidence?.length ? (await inventory(root,options)).fingerprint : null;
  const evidence=(meta.evidence||[]).map(e=>({...e, current:e.fingerprint===fingerprint && e.revision===task.plan?.revision && e.stable!==false}));
  return {evidenceCheckedAt:new Date().toISOString(),impact:meta.plan?.impact || null, audit:meta.result || null, evidence,
    evidenceNote:'증거가 없는 통과 기록은 에이전트 보고입니다. 캡처만으로 동작 성공이 증명되지는 않습니다.'};
}
const redact=text=>String(text).replace(/\b(?:sk-[a-zA-Z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/g,'[REDACTED]').replace(/((?:token|password|secret|api[_-]?key)\s*[:=]\s*)[^\s,;]+/ig,'$1[REDACTED]').slice(-12000);
export async function recordEvidence(root,task,spec,options={}) {
  if (!task.plan || !spec || typeof spec.name!=='string' || !spec.name.trim()) throw problem('계획과 증거 이름이 필요합니다.');
  if (spec.nodeId && !task.plan.effects.some(e=>e.nodeId===spec.nodeId)) throw problem('증거는 현재 계획의 기능에 연결하세요.');
  const before=await inventory(root,options), id=`ev-${crypto.randomUUID()}`;
  const record={id,name:spec.name.slice(0,160),nodeId:spec.nodeId || null,revision:task.plan.revision,createdAt:new Date().toISOString(),fingerprint:before.fingerprint};
  if (spec.kind==='image') {
    if (!['before','after'].includes(spec.stage)) throw problem('이미지는 before/after 구분이 필요합니다.');
    const input=await safePath(root,spec.file), stat=await fs.stat(input); if (!stat.isFile()||stat.size>8*1024*1024) throw problem('8MB 이하의 이미지 파일을 선택하세요.');
    const bytes=await fs.readFile(input), png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if (!png&&!jpg) throw problem('PNG/JPEG 이미지만 등록할 수 있습니다.');
    const target=await statePath(root,`evidence/${task.id}/${id}`,options); await fs.writeFile(target,bytes,{flag:'wx',mode:0o600});
    Object.assign(record,{kind:'image',stage:spec.stage,mime:png?'image/png':'image/jpeg',hash:hash(bytes),url:`/api/evidence/${task.id}/${id}`,status:'attached'});
  } else if (spec.kind==='check') {
    if (task.status!=='running') throw problem('검증 명령은 실행 중인 작업에서만 허용됩니다.');
    if (!Array.isArray(spec.argv)||!spec.argv.length||spec.argv.length>64||spec.argv.some(a=>typeof a!=='string'||a.length>8192||a.includes('\0'))) throw problem('argv 문자열 배열이 필요합니다. 셸 문자열은 실행하지 않습니다.');
    const timeout=Math.min(120000,Math.max(1000,Number(spec.timeoutMs)||30000));
    const result=await new Promise(resolve=>{
      let output='',settled=false,timedOut=false;const child=spawn(spec.argv[0],spec.argv.slice(1),{cwd:root,shell:false,stdio:['ignore','pipe','pipe']});
      const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result);};
      const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeout);
      const collect=chunk=>{output=(output+chunk.toString()).slice(-16000);};child.stdout.on('data',collect);child.stderr.on('data',collect);
      child.on('error',e=>finish({exitCode:null,error:e.message,output}));child.on('close',(code,signal)=>finish({exitCode:code,signal,timedOut,output}));
    });
    const after=await inventory(root,options);
    Object.assign(record,{kind:'check',argv:spec.argv.map(redact),exitCode:result.exitCode,status:result.exitCode===0&&!result.timedOut?'passed':'failed',output:redact(result.output||result.error),stable:before.fingerprint===after.fingerprint});
  } else throw problem('증거 종류는 image 또는 check 입니다.');
  const meta=await loadAssurance(root,task.id,options);meta.evidence=[...(meta.evidence||[]),record].slice(-100);await saveAssurance(root,task.id,meta,options);return record;
}
export async function evidenceResponse(root,route,options) {
  const match=route.match(/^\/api\/evidence\/(task-[0-9a-f-]+)\/(ev-[0-9a-f-]+)$/);if(!match)return null;
  const meta=await loadAssurance(root,match[1],options), record=(meta.evidence||[]).find(e=>e.id===match[2]&&e.kind==='image');if(!record)throw problem('Evidence not found.','NOT_FOUND',404);
  const file=await statePath(root,`evidence/${taskId(match[1])}/${match[2]}`,options), bytes=await fs.readFile(file);if(hash(bytes)!==record.hash)throw problem('Evidence was changed.','INVALID_STATE',409);
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(bytes.length>8*1024*1024||(!png&&!jpg))throw problem('Invalid image.');
  return {value:bytes,type:png?'image/png':'image/jpeg',status:200};
}
