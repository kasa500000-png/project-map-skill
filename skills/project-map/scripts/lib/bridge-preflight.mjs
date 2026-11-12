import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { problem } from './state-store.mjs';
const exec=promisify(execFile);
function allObjects(value){if(!value||typeof value!=='object')return [];return [value,...Object.values(value).flatMap(allObjects)];}
function resolve(schema){
  let value=schema;for(let i=0;i<12&&value?.$ref;i++){
    if(!value.$ref.startsWith('#/'))throw problem('External schema references are not supported.','CODEX_INCOMPATIBLE');
    value=value.$ref.slice(2).split('/').reduce((obj,key)=>obj?.[key.replace(/~1/g,'/').replace(/~0/g,'~')],schema);
  }return value;
}
export function checkProtocolSchemas(schemas){
  const turn=resolve(schemas.turn),start=resolve(schemas.start),resume=resolve(schemas.resume);
  for(const name of ['threadId','input','sandboxPolicy','outputSchema','approvalPolicy'])if(!turn?.properties?.[name])throw problem(`Codex protocol missing ${name}. Use manual handoff.`, 'CODEX_INCOMPATIBLE');
  if(!start?.properties?.sandbox||!resume?.properties?.threadId)throw problem('Codex thread resume/sandbox contract is unsupported.','CODEX_INCOMPATIBLE');
  const variants=allObjects(schemas.turn),variant=type=>variants.find(v=>v.properties?.type?.const===type||v.properties?.type?.enum?.includes(type));
  const write=variant('workspaceWrite'),read=variant('readOnly');
  if(!read?.properties?.access||!write?.properties?.readOnlyAccess||!['writableRoots','networkAccess','excludeSlashTmp','excludeTmpdirEnvVar'].every(key=>write?.properties?.[key]))
    throw problem('Codex lacks the restricted read/write controls required by this adapter. Use manual handoff.','CODEX_INCOMPATIBLE');
  if(!variants.some(v=>v.enum?.includes('never')))throw problem('Codex approval-policy contract is unsupported.','CODEX_INCOMPATIBLE');
  return true;
}
export async function inspectCodex(){
  let version;
  try{version=(await exec('codex',['--version'],{timeout:10000,maxBuffer:4096})).stdout.trim().slice(0,120);}
  catch(e){throw problem(e.code==='ENOENT'?'Codex CLI가 설치되지 않았거나 PATH에 없습니다. 요청문 복사 방식을 사용하세요.':'Codex 버전을 확인하지 못했습니다. 로컬 CLI 상태를 확인하세요.',e.code==='ENOENT'?'CODEX_NOT_INSTALLED':'CODEX_CHECK_FAILED');}
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'project-map-protocol-'));
  try{
    await exec('codex',['app-server','generate-json-schema','--out',temp],{timeout:20000,maxBuffer:1024*1024});
    const found=new Map();let count=0;
    async function visit(dir,depth=0){if(depth>6)return;for(const e of await fs.readdir(dir,{withFileTypes:true})){
      if(++count>2500)throw problem('Codex schema bundle is too large.','CODEX_INCOMPATIBLE');
      if(e.isSymbolicLink())continue;const p=path.join(dir,e.name);
      if(e.isDirectory())await visit(p,depth+1);else if(e.isFile()&&['TurnStartParams.json','ThreadStartParams.json','ThreadResumeParams.json'].includes(e.name)){
        if((await fs.stat(p)).size>8*1024*1024)throw problem('Oversized protocol schema.','CODEX_INCOMPATIBLE');
        found.set(e.name,JSON.parse(await fs.readFile(p,'utf8')));
      }
    }}
    await visit(temp);checkProtocolSchemas({turn:found.get('TurnStartParams.json'),start:found.get('ThreadStartParams.json'),resume:found.get('ThreadResumeParams.json')});
    return {version,compatible:true,checkedAt:new Date().toISOString()};
  }catch(e){if(e.code==='CODEX_INCOMPATIBLE')throw e;throw problem('설치된 Codex의 통신 규격을 확인하지 못했습니다. 자동 실행 대신 요청문 복사 방식을 사용하세요.','CODEX_INCOMPATIBLE');}
  finally{await fs.rm(temp,{recursive:true,force:true});}
}
