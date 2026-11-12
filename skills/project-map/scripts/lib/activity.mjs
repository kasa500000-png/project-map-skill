/** Cheap HTTP polling: metadata first; load/validate only one history page. */
import fs from 'node:fs/promises';
import path from 'node:path';
import * as core from './analyzer.mjs';
import { hash, statePath, stateRoot } from './state-store.mjs';
const cache=new Map();
async function entries(root,options){
  const base=await stateRoot(root,options),dir=await statePath(root,'tasks/.index',options);
  const names=(await fs.readdir(path.dirname(dir))).filter(n=>/^task-[0-9a-f-]{36}\.json$/.test(n));
  const values=[];
  for(const name of names.slice(0,5000)){
    const full=path.join(base,'tasks',name),s=await fs.lstat(full);
    if(s.isFile()&&!s.isSymbolicLink())values.push({id:name.slice(0,-5),file:full,size:s.size,mtime:s.mtimeMs,stamp:`${s.ino}:${s.size}:${s.mtimeMs}`});
  }
  values.sort((a,b)=>b.mtime-a.mtime||a.id.localeCompare(b.id));
  return {base,values,total:names.length,truncated:names.length>5000};
}
export async function activity(root,options={}){
  const data=await entries(root,options), stamps=data.values.map(v=>[v.id,v.stamp]);
  for(const folder of ['workspace','finalization']){
    const p=path.join(data.base,folder);try{const s=await fs.lstat(p);if(!s.isDirectory()||s.isSymbolicLink())continue;
      for(const file of (await fs.readdir(p)).slice(0,5000)){const stat=await fs.lstat(path.join(p,file));stamps.push([folder,file,stat.ino,stat.size,stat.mtimeMs]);}
    }catch(e){if(e.code!=='ENOENT')throw e;}
  }
  return {version:hash(JSON.stringify(stamps)),total:data.total,truncated:data.truncated};
}
export async function recentTasks(root,{offset=0,limit=30,includeArchived=false,...options}={}){
  offset=Math.max(0,Math.min(5000,Number(offset)||0));limit=Math.max(1,Math.min(100,Number(limit)||30));
  const data=await entries(root,options),tasks=[];let position=offset,readBytes=0;
  for(;position<data.values.length&&tasks.length<limit;position++){
    const item=data.values[position];let value=cache.get(item.file);
    if(!value||value.stamp!==item.stamp){
      if(item.size>24*1024*1024)continue; // Never return a cursor that cannot advance.
      if(readBytes+item.size>32*1024*1024)break;readBytes+=item.size;
      try {const t=await core.getTask(root,item.id,options);value={stamp:item.stamp,summary:{id:t.id,status:t.status,request:t.request,createdAt:t.createdAt,updatedAt:t.updatedAt,archivedAt:t.archivedAt||null}};cache.set(item.file,value);}
      catch {continue;}
    }
    if(!value.summary.archivedAt||includeArchived)tasks.push(value.summary);
  }
  if(cache.size>3000){const keys=[...cache.keys()];for(const key of keys.slice(0,cache.size-3000))cache.delete(key);}
  return {tasks,total:data.total,nextOffset:position<data.values.length?position:null,truncated:data.truncated};
}
export async function storageUsage(root,options={}){
  const base=await stateRoot(root,options);let files=0,bytes=0,checkpointBytes=0,truncated=false;
  async function visit(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){
    if(files>=10000){truncated=true;return;}const full=path.join(dir,e.name);
    if(e.isSymbolicLink()){truncated=true;continue;}if(e.isDirectory())await visit(full);
    else if(e.isFile()){const s=await fs.stat(full);files++;bytes+=s.size;if(full.includes(path.sep+'checkpoint-blobs'+path.sep))checkpointBytes+=s.size;}
  }}await visit(base);return {files,bytes,checkpointBytes,truncated,automaticDeletion:false};
}
