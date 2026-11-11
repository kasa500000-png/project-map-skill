import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as core from './analyzer.mjs';
import { hash, taskId, safePath, statePath, readState, writeState, problem } from './state-store.mjs';
import { auditable, isSensitive } from './inventory.mjs';
const location=id=>`checkpoints/${taskId(id)}.json`;
async function current(root,p){
  if(!auditable(p)||isSensitive(p))throw problem('복원 대상은 안전한 프로젝트 파일이어야 합니다.');
  try{const full=await safePath(root,p),stat=await fs.stat(full);if(!stat.isFile()||stat.size>2*1024*1024)throw problem('체크포인트 파일은 2MB 이하의 일반 파일이어야 합니다.');
    const bytes=await fs.readFile(full);return {hash:hash(bytes),mode:stat.mode&0o777,bytes};
  }catch(e){if(e.code==='ENOENT')return {hash:null,mode:null,bytes:null};throw e;}
}
async function blob(root,bytes,options){
  const digest=hash(bytes),file=await statePath(root,`checkpoint-blobs/${digest}`,options);
  try{await fs.writeFile(file,bytes,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;if(hash(await fs.readFile(file))!==digest)throw problem('체크포인트 파일이 손상되었습니다.');}return digest;
}
async function load(root,id,options){
  const cp=await readState(root,location(id),options);
  if(!cp)return null;
  if(cp.root!==await fs.realpath(root)||cp.id!==id||!Array.isArray(cp.files)||cp.files.length>120||new Set(cp.files.map(f=>f.path)).size!==cp.files.length)throw problem('Invalid checkpoint.');
  for(const f of cp.files)if(!auditable(f.path)||isSensitive(f.path)||(f.beforeHash!==null&&!/^[0-9a-f]{64}$/.test(f.beforeHash||''))||!Number.isInteger(f.mode)||f.mode<0||f.mode>511)throw problem('Invalid checkpoint entry.');
  return cp;
}
export async function checkpoint(root,task,options={}){
  let cp=await load(root,task.id,options);
  if(cp?.restoredAt)throw problem('복원한 작업은 새 요청으로 이어가세요.','RESTORED_TASK',409);
  cp ||= {id:task.id,root:await fs.realpath(root),createdAt:new Date().toISOString(),files:[]};
  for(const p of task.plan.writeFiles){if(cp.files.some(f=>f.path===p))continue;const value=await current(root,p);
    cp.files.push({path:p,beforeHash:value.bytes?await blob(root,value.bytes,options):null,mode:value.mode??0o644});}
  cp.sealed=null;cp.preview=null;
  await writeState(root,location(task.id),cp,options);
  return {files:cp.files.length,createdAt:cp.createdAt};
}
export async function sealCheckpoint(root,task,options={}){
  const cp=await load(root,task.id,options);if(!cp||cp.restoredAt)return;
  cp.sealed=[];for(const f of cp.files){const value=await current(root,f.path);cp.sealed.push({path:f.path,hash:value.hash,mode:value.mode});}
  cp.sealedAt=new Date().toISOString();cp.preview=null;await writeState(root,location(task.id),cp,options);
}
export async function safetyView(root,task,options={}){
  const cp=await load(root,task.id,options);
  return {checkpoint:cp?{files:cp.files.map(f=>f.path),createdAt:cp.createdAt,sealedAt:cp.sealedAt||null,restoredAt:cp.restoredAt||null}:null,
    nextAction:task.status==='blocked'?'Codex 실행을 중단한 상태에서 현재 코드를 확인하고 재개 계획을 검토하세요.':task.status==='approved'?'계획 승인 완료입니다. Codex 실행 요청이 필요합니다.':task.status==='running'?'외부 Codex 실행 상태도 확인하세요. 상태 표시만으로 프로세스를 중단하지 않습니다.':task.status==='completed'?'검증 결과와 지도 밖 변경을 확인하세요.':'요청 저장과 실제 실행은 별도 단계입니다.',
    limits:'체크포인트는 계획한 로컬 파일만 복원합니다. 데이터베이스·결제·메일·배포 등 외부 작업은 되돌리지 않습니다.'};
}
async function preflight(root,task,cp,options){
  if(!['blocked','completed'].includes(task.status)||!cp?.sealed||cp.restoredAt)throw problem('중단 또는 완료 후 기록된 체크포인트만 복원할 수 있습니다.','RESTORE_UNAVAILABLE',409);
  const peers=await core.listTasks(root,options);
  if(peers.some(t=>t.id!==task.id&&t.status==='running'&&(t.plan?.writeFiles||[]).some(p=>cp.files.some(f=>f.path===p))))throw problem('같은 파일을 수정하는 다른 작업이 진행 중입니다. 먼저 해당 작업을 중단하세요.','ACTIVE_CONFLICT',409);
  const result=[];
  for(const f of cp.files){const value=await current(root,f.path),sealed=cp.sealed.find(s=>s.path===f.path);
    if(!sealed||sealed.hash!==value.hash||sealed.mode!==value.mode)throw problem(`다른 수정이 섞였습니다. 자동 복원을 중단합니다: ${f.path}`,'RESTORE_CONFLICT',409);
    result.push({path:f.path,currentHash:value.hash,currentMode:value.mode,targetHash:f.beforeHash,targetMode:f.mode,action:f.beforeHash===null?'remove':value.hash===null?'recreate':'restore'});}
  return result;
}
export async function restorePreview(root,task,options={}){
  const cp=await load(root,task.id,options), files=await preflight(root,task,cp,options);
  const token=crypto.randomUUID(),digest=hash(JSON.stringify(files));cp.preview={token,digest,at:Date.now()};await writeState(root,location(task.id),cp,options);
  return {token,files,warning:'표시한 로컬 파일만 작업 전 상태로 되돌립니다. 외부 데이터·배포는 복원되지 않습니다. 다른 Codex 실행을 먼저 중단하세요.'};
}
export async function restoreApply(root,task,token,options={}){
  const lock=await statePath(root,`locks/${taskId(task.id)}.lock`,options);try{await fs.mkdir(lock);}catch(e){if(e.code==='EEXIST')throw problem('다른 복원 작업이 진행 중입니다.','RESTORE_BUSY',409);throw e;}
  try{
    const cp=await load(root,task.id,options),files=await preflight(root,task,cp,options);
    if(!cp.preview||typeof token!=='string'||token!==cp.preview.token||Date.now()-cp.preview.at>300000||hash(JSON.stringify(files))!==cp.preview.digest)throw problem('복원 미리보기를 다시 확인해 주세요.','STALE_RESTORE',409);
    const prepared=[];
    for(const f of cp.files){let bytes=null;if(f.beforeHash){bytes=await fs.readFile(await statePath(root,`checkpoint-blobs/${f.beforeHash}`,options));if(hash(bytes)!==f.beforeHash)throw problem('체크포인트 내용이 손상되었습니다.');}
      const value=await current(root,f.path);prepared.push({file:f,bytes,recoveryHash:value.bytes?await blob(root,value.bytes,options):null});}
    const journal={at:new Date().toISOString(),taskId:task.id,files:prepared.map(p=>({path:p.file.path,backup:p.recoveryHash,target:p.file.beforeHash})),applied:[],status:'in_progress'};
    await writeState(root,`recovery/${task.id}.json`,journal,options);
    for(const item of prepared){
      const target=await safePath(root,item.file.path,true);
      // Recheck immediately before mutation; do not clobber an intervening edit.
      const value=await current(root,item.file.path),expected=files.find(f=>f.path===item.file.path);
      if(value.hash!==expected.currentHash||value.mode!==expected.currentMode)throw problem('복원 중 동시 수정이 감지되었습니다. recovery 기록을 확인하세요.','RESTORE_PARTIAL',409);
      if(item.bytes){await fs.mkdir(path.dirname(target),{recursive:true});const temp=`${target}.pm-${crypto.randomUUID()}.tmp`;
        try{await fs.writeFile(temp,item.bytes,{flag:'wx',mode:item.file.mode});await fs.rename(temp,target);}finally{await fs.unlink(temp).catch(()=>{});}}
      else if(value.hash!==null)await fs.unlink(target);
      journal.applied.push(item.file.path);await writeState(root,`recovery/${task.id}.json`,journal,options);
    }
    journal.status='completed';await writeState(root,`recovery/${task.id}.json`,journal,options);
    cp.restoredAt=new Date().toISOString();cp.preview=null;await writeState(root,location(task.id),cp,options);
    return {restoredAt:cp.restoredAt,files:journal.applied,externalStateRestored:false};
  }finally{await fs.rmdir(lock).catch(()=>{});}
}
export function resumePlan(task,map){
  if(task.status!=='blocked'||!task.plan)throw problem('중단된 계획만 재검토할 수 있습니다.');
  const known=new Set(map.nodes.map(n=>n.id));
  return {summary:`중단한 작업 이어서 진행: ${task.plan.summary}`.slice(0,2000),writeFiles:task.plan.writeFiles,effects:task.plan.effects,
    newNodes:task.plan.newNodes.filter(n=>!known.has(n.id)).map(({id,label,kind})=>({id,label,kind})),removeNodeIds:task.plan.removeNodeIds,
    flowChanges:task.plan.flowChanges.filter(c=>c.action!=='remove'||map.edges.some(e=>e.source===c.source&&e.target===c.target&&e.kind===c.kind))};
}
