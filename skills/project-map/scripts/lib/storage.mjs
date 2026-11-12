/** Private controller state, protected from normal Codex workspace writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export const DEFAULT_STATE = '.agents/project-map-state';
const problem = (message, code='INVALID_STATE', statusCode=409) => Object.assign(new Error(message),{code,statusCode});
export function getStateDir(projectRoot, stateDir) {
  const root=path.resolve(projectRoot);
  if(stateDir!==undefined&&(typeof stateDir!=='string'||!stateDir.trim()))throw problem('stateDir must be a nonempty path.');
  const state=path.resolve(root,stateDir??DEFAULT_STATE);
  if(state===root)throw problem('State directory must be separate from the project root.');
  return state;
}
async function regular(file) {
  try { const s=await fs.lstat(file); if(s.isSymbolicLink())throw problem('State paths must not use symbolic links.','UNSAFE_STATE_PATH');return s; }
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function guardLegacyState(root,stateDir) {
  if(stateDir!==undefined)return;
  // Check ancestors before reading a marker or an old task directory.
  const legacy=path.join(root,'.project-map');const info=await regular(legacy);
  if(!info)return;if(!info.isDirectory())return;
  const tasks=await regular(path.join(legacy,'tasks'));if(!tasks?.isDirectory())return;
  const marker=path.join(root,DEFAULT_STATE,'migration.json');
  let current=root;for(const part of DEFAULT_STATE.split('/')){current=path.join(current,part);await regular(current);}
  if(await regular(marker))return;
  const names=await fs.readdir(path.join(legacy,'tasks'));
  if(names.some(n=>n.endsWith('.json')))throw problem('이전 작업 기록이 있습니다. 기존 Codex 실행을 중단한 뒤 migrate-state 명령으로 기록을 옮겨 주세요. 원본은 삭제하지 않습니다.','STATE_MIGRATION_REQUIRED');
}
export async function migrateState(projectRoot) {
  const root=await fs.realpath(projectRoot),from=path.join(root,'.project-map'),to=path.join(root,DEFAULT_STATE);
  if(await regular(to))throw problem('새 상태 폴더가 이미 있습니다. 자동 병합·덮어쓰기는 하지 않습니다.');
  if(!(await regular(from))?.isDirectory())throw problem('이전 .project-map 상태 폴더가 없습니다.');
  const agents=path.join(root,'.agents');await regular(agents);await fs.mkdir(agents,{recursive:true,mode:0o700});
  const manifest=[];let bytes=0;
  async function inspect(dir,prefix=''){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      if(entry.isSymbolicLink())throw problem('이전 상태에 심볼릭 링크가 있습니다. 수동으로 확인하세요.','UNSAFE_STATE_PATH');
      const relative=prefix?`${prefix}/${entry.name}`:entry.name,file=path.join(dir,entry.name);
      if(entry.isDirectory())await inspect(file,relative);
      else if(entry.isFile()){
        const s=await fs.lstat(file);bytes+=s.size;if(bytes>512*1024*1024||manifest.length>=10000)throw problem('이전 상태가 커서 자동 이전을 중단했습니다.');
        const data=await fs.readFile(file);manifest.push({relative,hash:crypto.createHash('sha256').update(data).digest('hex')});
        if(relative.startsWith('tasks/')&&relative.endsWith('.json')){
          const task=JSON.parse(data);if(['running','finalizing','finalization_failed'].includes(task.status))throw problem('실행·결과 정리 중인 작업을 기존 버전에서 먼저 중단하거나 완료하세요.','ACTIVE_MIGRATION');
        }
      }else throw problem('지원하지 않는 상태 파일입니다.');
    }
  }
  await inspect(from);
  const stage=path.join(agents,`.project-map-import-${crypto.randomUUID()}`);
  try {
    await fs.cp(from,stage,{recursive:true,force:false,errorOnExist:true,dereference:false});
    for(const entry of manifest){const file=path.join(stage,entry.relative);const data=await fs.readFile(file);if(crypto.createHash('sha256').update(data).digest('hex')!==entry.hash)throw problem('이전 중 상태가 변경되었습니다. 작업을 중단하고 다시 시도하세요.');
      if(entry.relative.startsWith('tasks/')&&entry.relative.endsWith('.json')){const task=JSON.parse(data);if(task.status==='approved'){task.status='awaiting_review';task.approval=null;task.updatedAt=new Date().toISOString();await fs.writeFile(file,JSON.stringify(task,null,2)+'\n');}}
    }
    await fs.writeFile(path.join(stage,'migration.json'),JSON.stringify({from,at:new Date().toISOString(),sourceRetained:true,files:manifest.length}),{flag:'wx',mode:0o600});
    // Rename refuses to overwrite a nonempty destination; recheck before publishing.
    if(await regular(to))throw problem('이전 도중 새 상태 폴더가 생겼습니다. 덮어쓰지 않습니다.');
    await fs.rename(stage,to);
    return {stateDir:to,files:manifest.length,sourceRetained:true,approvedPlansRequireReview:true};
  }catch(e){await fs.rm(stage,{recursive:true,force:true});throw e;}
}
export async function requireProtectedState(root,options={}) {
  root=await fs.realpath(root);const state=getStateDir(root,options.stateDir);
  const protectedRoot=path.join(root,'.agents');
  if(state!==protectedRoot&&!state.startsWith(protectedRoot+path.sep))throw problem('직접 연결에서는 .agents 아래의 보호된 상태 저장소만 사용합니다. 기본 경로로 실행하거나 수동 전달 방식을 사용하세요.','UNPROTECTED_STATE');
  let cur=root;for(const part of path.relative(root,state).split(path.sep)){cur=path.join(cur,part);await regular(cur);}
  return state;
}
