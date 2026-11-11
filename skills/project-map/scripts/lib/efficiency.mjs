import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inventory } from './inventory.mjs';
import { readState, writeState, hash } from './state-store.mjs';
import * as core from './analyzer.mjs';
import { loadAssurance } from './assurance.mjs';
const exec=promisify(execFile);
export async function refreshMap(root,options={}){
 const before=await inventory(root,options);let git='no-git';
 try{git=(await exec('git',['-C',root,'rev-parse','HEAD'],{timeout:10000})).stdout+(await exec('git',['-C',root,'symbolic-ref','--short','HEAD'],{timeout:10000})).stdout+(await exec('git',['-C',root,'status','--porcelain','--untracked-files=no'],{timeout:10000})).stdout;}catch{}
 const key=hash(JSON.stringify({version:1,fingerprint:before.fingerprint,git})),cached=await readState(root,'refresh-cache.json',options,{});
 let map;
 if(!options.full && before.complete && cached.key===key){
   try{map=await core.getMap(root,options);if(map.snapshotId!==cached.snapshotId||map.coverage?.truncated||map.coverage?.skippedFiles)map=null;}catch{}
 }
 const previous=new Map((cached.files||[]).map(f=>[f.path,f.hash])),next=new Map(before.files.map(f=>[f.path,f.hash]));
 const changedFiles=[...new Set([...previous.keys(),...next.keys()])].filter(p=>previous.get(p)!==next.get(p));
 if(map)return {...map,refresh:{mode:'reused',checkedAt:new Date().toISOString(),changedFiles:[],note:'내용 해시 확인 후 기존 지도를 재사용했습니다.'}};
 map=await core.scanProject(root,options);
 await writeState(root,'refresh-cache.json',{key:map.files.every(f=>next.get(f.path)===f.hash)?key:null,snapshotId:map.snapshotId,files:before.files.map(({path,hash})=>({path,hash}))},options);
 return {...map,refresh:{mode:'rebuilt',checkedAt:new Date().toISOString(),changedFiles,note:'변경을 감지해 관계 전체를 다시 계산했습니다. 부분 파서 캐시는 사용하지 않습니다.'}};
}
export function compareScopes(left,right,map){
 if(!left.plan||!right.plan)return {status:'unknown',reasons:['두 작업의 구체적인 계획이 모두 필요합니다.'],sharedReads:[]};
 const a=left.experience?.assurance?.impact||left.impact,b=right.experience?.assurance?.impact||right.impact;
 const aw=new Set(left.plan.writeFiles),bw=new Set(right.plan.writeFiles),ar=new Set(a.readFiles),br=new Set(b.readFiles);
 const overlap=[...aw].filter(p=>bw.has(p)),dependencies=[...new Set([...aw].filter(p=>br.has(p)).concat([...bw].filter(p=>ar.has(p))))];
 const reasons=[];if(overlap.length)reasons.push('같은 파일 수정: '+overlap.join(', '));if(dependencies.length)reasons.push('한 작업이 다른 작업의 참고 코드를 변경: '+dependencies.join(', '));
 const resources=files=>new Set(map.files.filter(f=>files.has(f.path)).flatMap(f=>(f.resources||[]).map(r=>`${r.type}:${r.key}`)));
 const ra=resources(new Set([...aw,...ar])),rb=resources(new Set([...bw,...br]));
 const sharedResources=[...ra].filter(key=>rb.has(key));
 if(sharedResources.length)reasons.push('공유 데이터/API 규칙 확인: '+sharedResources.join(', '));
 if([...aw,...bw].some(p=>/(schema|migration|auth|permissions|config|package\.json)/i.test(p)))reasons.push('권한·스키마·공통 설정 변경은 선행 합의가 필요합니다.');
 const stale=left.plan.snapshotId!==map.snapshotId||right.plan.snapshotId!==map.snapshotId||map.coverage?.truncated||map.coverage?.skippedFiles;
 if(stale)reasons.push('오래되었거나 불완전한 분석입니다. 실행 전에 계획을 갱신하세요.');
 return {status:overlap.length||dependencies.length?'conflict':reasons.length?(stale?'unknown':'coordinate'):'conditional',reasons:reasons.length?reasons:['현재 계획에서 직접 충돌은 찾지 못했습니다. 실행 중 공유 자원과 범위 확대를 추가 확인하세요.'],sharedReads:[...ar].filter(p=>br.has(p))};
}
export async function taskComparisons(root,task,map,options={}){
 const peers=(await core.listTasks(root,options)).filter(t=>t.id!==task.id&&t.status!=='completed').slice(0,30),results=[];
 for(const peer of peers){const meta=await loadAssurance(root,peer.id,options);peer.experience={assurance:{impact:meta.plan?.impact}};results.push({id:peer.id,request:peer.request,...compareScopes(task,peer,map)});}
 return results;
}
